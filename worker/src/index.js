// 기억의 정원 방 서버.
// 방 하나 = Durable Object 하나. 접속자 위치·동작은 중계만 하고,
// 꽃·날씨·최근 대화는 방 저장소에 남겨 늦게 온 사람도 같은 상태를 본다.
import { DurableObject } from 'cloudflare:workers';
import '../../assets/campfire-rules.js';
import '../../assets/prayer-rules.js';
const Fire=globalThis.GardenCampfire;
const Prayer=globalThis.GardenPrayer;

// 걸을 수 있는 반경(m). index.html의 WORLD_R와 같게 둔다.
const WORLD_R = 90;
const MAX_PEERS = 16;
const VISIT_AWAY_MS=5*60*1000,VISIT_MEMORY_MS=24*60*60*1000;
const TRACKS=['dawn','wind','bowl','melody'];
const LISTENING_TRACKS=['bluehour','rainwood','starlight'];
const spaceOf=s=>s&&s.space==='listening'?'listening':'garden';
const sameSpace=(a,b)=>spaceOf(a)===spaceOf(b);
const WEATHER = ['auto', 'clear', 'rain', 'snow'];
const BOARD_PAGE_SIZE=6,BOARD_MAX_NOTES=500,BOARD_MAX_TEXT=600;
const boardText=v=>typeof v==='string'?v.replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').trim():'';
const boardId=v=>typeof v==='string'&&/^[a-f0-9]{32}$/.test(v);
const boardRecipient=v=>boardText(v).normalize('NFC').replace(/에게$/,'').trim();

const RPS_DISTANCE = 4, RPS_BREAK_DISTANCE = 6;
const RPS_INVITE_MS = 15000, RPS_RETAIN_MS = 30000;
const RPS_CHOICES = ['scissors', 'rock', 'paper'];
const RPS_BEATS = { scissors: 'paper', rock: 'scissors', paper: 'rock' };
const activeRps = g => g.status === 'invited' || g.status === 'playing';

const POSES = ['stand', 'standing_pray', 'pray2', 'shake', 'sit', 'lie', 'prone', 'wave', 'pray', 'bow', 'coffee', 'beer', 'fuel', 'woodpick', 'woodcarry', 'woodfeed', 'yoga', 'soda', 'soju', 'cheers', 'makgeolli'];
const POCHA_ITEMS = ['odeng', 'dakbal', 'egg', 'golbaeng', 'jeon', 'tteok', 'udon', 'guksu', 'soju', 'beer', 'makgeolli', 'cider'];

const POCHA_CENTER={x:-6.3,z:-23.4};
const POCHA_HEADING=Math.atan2(-POCHA_CENTER.x,-POCHA_CENTER.z);
const POCHA_STOOLS=Array.from({length:8},(_,i)=>{
  const x=-2.45+i*.7,z=.35;
  return{x:POCHA_CENTER.x+Math.cos(POCHA_HEADING)*x+Math.sin(POCHA_HEADING)*z,z:POCHA_CENTER.z-Math.sin(POCHA_HEADING)*x+Math.cos(POCHA_HEADING)*z};
});
const POCHA_DRINKS=['soju','beer','makgeolli','cider'];
function pochaSeatFor(state){
  if(!state||spaceOf(state)!=='garden'||!['sit','coffee','beer','soda','soju','makgeolli','cheers'].includes(state.p))return -1;
  return POCHA_STOOLS.findIndex(seat=>Math.hypot(seat.x-state.x,seat.z-state.z)<.25);
}
function trimPochaOrders(orders){
  const seats=new Map();
  for(const order of orders){
    if(!order||!Number.isInteger(order.seat)||!POCHA_STOOLS[order.seat]||!POCHA_ITEMS.includes(order.item))continue;
    let row=seats.get(order.seat);if(!row){row={food:[],drink:[]};seats.set(order.seat,row)}
    if(POCHA_DRINKS.includes(order.item))row.drink=[order];else row.food=row.food.concat(order).slice(-4);
  }
  return [...seats.values()].flatMap(row=>row.food.concat(row.drink)).sort((a,b)=>(a.at||0)-(b.at||0));
}

const INVISIBLE = /[\u0000-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g;

const clean = (v, n) => (typeof v === 'string' ? v.replace(INVISIBLE, '').trim().slice(0, n) : '');
const nameKey=v=>clean(v,12).normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const num = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 100) / 100)) : null);

function cleanLook(l) {
  if (!l || typeof l !== 'object') return null;
  const o = {};
  for (const k of ['skin', 'hair', 'shirt', 'pants', 'shoe']) {
    if (!Number.isInteger(l[k]) || l[k] < 0 || l[k] > 0xffffff) return null;
    o[k] = l[k];
  }
  o.hs = l.hs === 1 ? 1 : 0;
  o.hat = !!l.hat;
  if (['male', 'female'].includes(l.gender)) { o.gender = l.gender; o.hs = l.gender === 'female' ? 1 : 0; }
  const small = (v, max) => Number.isInteger(v) && v >= 0 && v <= max ? v : 0;
  o.st = small(l.st, 4); o.gl = small(l.gl, 3); o.fh = o.gender === 'male' ? small(l.fh, 2) : 0; o.sk = o.gender === 'female' && !!l.sk;
  return o;
}
function cleanDog(d) {
  if (!d || !Number.isInteger(d.b) || d.b < 0) return null;
  if (d.kind === 'cat') {
    if (d.b >= 8 || !Number.isInteger(d.coat) || d.coat < 0 || d.coat >= 8) return null;
    return { kind: 'cat', b: d.b, coat: d.coat, n: clean(d.n, 8) };
  }
  if ((d.kind !== undefined && d.kind !== 'dog') || d.b > 9) return null;
  if (d.coat !== undefined && (!Number.isInteger(d.coat) || d.coat < 0 || d.coat >= 10)) return null;
  return { b: d.b, n: clean(d.n, 8), ...(d.coat === undefined ? {} : { coat: d.coat }) };
}
// Cosmetic completion expiry is an absolute timestamp; presence/reconnect never refreshes it.
function cleanBowHalo(value,now=Date.now()){return Number.isFinite(value)&&value>now&&value<=now+7*86400000?value:0}
function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const x = num(s.x, -WORLD_R, WORLD_R), z = num(s.z, -WORLD_R, WORLD_R);
  if (x === null || z === null) return null;
  const space=spaceOf(s);
  return { space,x:space==='listening'?num(x,-5.6,5.6):x,z:space==='listening'?num(z,-3,5.3):z, h: num(s.h, -1000, 1000) ?? 0, p: POSES.includes(s.p) ? s.p : 'stand', bp: num(s.bp, 0, 1) ?? 0, u:s.u===true,haloUntil:cleanBowHalo(s.haloUntil),haloLevel:s.haloLevel===2?2:1,halos:Prayer.cleanHalos(s.halos||{whiteUntil:s.haloUntil},Date.now()) };
}

async function personalHash(text){return[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('')}

export class GardenRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    this.rps = [];this.visits={};this.personalViews=new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.shared = (await ctx.storage.get('shared')) || {
        flowers: [], music:{track:null,startedAt:0,videoId:null}, weather: 'auto', chat: [],
      };
      if (!Array.isArray(this.shared.pocha)) this.shared.pocha = [];
      if(!this.shared.music||!TRACKS.includes(this.shared.music.track)&&this.shared.music.track!==null){this.shared.music={track:null,startedAt:0,videoId:null};await ctx.storage.put('shared',this.shared)}
      this.listeningAudio=(await ctx.storage.get('listeningAudio'))||{track:'bluehour',power:false,startedAt:0,offsetMs:0,rev:0};
      this.rps = (await ctx.storage.get('rpsGames')) || [];
      this.visits=(await ctx.storage.get('visits'))||{};
      this.bows=(await ctx.storage.get('bowPractices'))||{};this.bowQueue=new Map();
      this.campfire=await ctx.storage.get('campfire');
      if(!this.campfire){this.campfire=Fire.initial(Date.now());await ctx.storage.put('campfire',this.campfire)}
      if(this.campfire.fuelUntil>Date.now()+Fire.MAX_MS){this.campfire={...this.campfire,fuelUntil:Date.now()+Fire.MAX_MS};await ctx.storage.put('campfire',this.campfire)}
      this.candles=(await ctx.storage.get('prayerCandles'))||{rev:0,items:[]};
      // Re-arm durable practices even after a restart between their commit and alarm setup.
      let restoredBows=false;const live=new Set(this.readyPeers().map(p=>p.a.id));
      for(const [id,job]of Object.entries(this.bows)){
        const f=Prayer.bowProgress(job,Date.now()),visit=this.visits[id];
        if(f.finishedAt&&['auto','single'].includes(f.mode)&&visit?.peer&&!visit.revoked&&!live.has(id)){
          const until=f.finishedAt+VISIT_AWAY_MS;if(!(visit.awayUntil>=until)){visit.awayUntil=until;restoredBows=true}
        }
      }
      if(restoredBows)await ctx.storage.put('visits',this.visits);
      if(Object.keys(this.bows).length)await this.armRpsAlarm();
      else if ((this.rps.length||Object.keys(this.visits).length||this.candles.items.length) && await ctx.storage.getAlarm() === null) await this.armRpsAlarm();
    });
  }

  // Admissions and renames share one queue so simultaneous requests cannot claim a name twice.
  queueAdmission(change){
    const previous=this.admissionQueue||Promise.resolve();
    const task=previous.catch(()=>{}).then(change);this.admissionQueue=task;
    return task.finally(()=>{if(this.admissionQueue===task)this.admissionQueue=null});
  }
  nameInUse(name,id,legacyId=null){
    const key=nameKey(name),now=Date.now();
    if(this.readyPeers().some(p=>p.a.id!==id&&p.a.id!==legacyId&&nameKey(p.a.name)===key))return true;
    return Object.entries(this.visits).some(([other,v])=>{
      if(other===id||other===legacyId||v.revoked||!v.peer||v.expiresAt<=now||nameKey(v.peer.name)!==key)return false;
      const bow=Prayer.bowProgress(this.bows[other],now);
      return v.awayUntil>now||!!(bow&&['auto','single'].includes(bow.mode)&&!bow.done);
    });
  }

  async personalIdentity(ws,a,m,legacyId){
    if(m.personalCode===undefined)return null; // old clients retain temporary visits
    if(!Prayer.validCode(m.personalCode)||!['create','restore'].includes(m.personalAction))throw Error('code');
    const hash=personalHash;
    const admin=Prayer.isAdminCode(m.personalCode);
    const codeHash=await hash('garden-code-v1:'+Prayer.normalizeCode(m.personalCode)),id=(await hash('garden-person-v1:'+codeHash)).slice(0,20),now=Date.now(),session=crypto.randomUUID();
    const result=await this.ctx.storage.transaction(async txn=>{
      const key='person.'+id,jobs=(await txn.get('bowPractices'))||{};
      let person=await txn.get(key);
      // 관리자 코드는 발급 예약 없이 쓰고, 기록이 없으면 처음 입장할 때 만든다.
      if(!admin&&/^[0-9]{5}$/.test(Prayer.normalizeCode(m.personalCode))&&m.personalAction==='create'){
        if(!/^[a-f0-9]{64}$/.test(m.personalRegistration||''))throw Error('code');
        const reservation=await txn.get('personal.code.reserve.'+codeHash),requestHash=await hash('garden-issue-v1:'+m.personalRegistration);
        if(!reservation||reservation.requestHash!==requestHash)throw Error('code');
      }
      if(!person){
        if(m.personalAction!=='create'&&!admin)throw Error('missing');
        person={id,codeHash,createdAt:now,updatedAt:now,name:clean(m.name,12)||'친구',look:cleanLook(m.look),dog:cleanDog(m.dog),progress:{108:0,3000:0},completed:{108:0,3000:0},totalBows:0,highestHalo:0,halos:{whiteUntil:0,redUntil:0},bow:null};
        // Claim only a server-confirmed previous visit, once. Local numbers and
        // client halo timestamps never grant rewards to a permanent profile.
        const legacy=legacyId&&jobs[legacyId],claimed=legacyId&&await txn.get('person.claim.'+legacyId);
        if(legacy&&!claimed){const f=Prayer.bowProgress(legacy,now);person.progress={...person.progress,...legacy.progress,[f.target]:f.count};person.totalBows=(person.progress[108]||0)+(person.progress[3000]||0);person.bow={...legacy,accountedCount:f.count};delete jobs[legacyId];await txn.put('person.claim.'+legacyId,id)}
      }else if(person.codeHash!==codeHash)throw Error('code');
      if(m.personalUpdate===true){person.name=clean(m.name,12)||person.name;person.look=cleanLook(m.look)||person.look;person.dog=cleanDog(m.dog)||person.dog}
      if(this.nameInUse(person.name,id,legacyId))throw Error('name_taken');
      let job=person.bow||{id:crypto.randomUUID().replace(/-/g,''),rev:0,mode:'idle',target:108,count:person.progress[108]||0,elapsed:0,at:now,paused:false,progress:{...person.progress},halos:person.halos,accountedCount:person.progress[108]||0,position:cleanState(m.s)};
      const settled=Prayer.accountProfile(person,job,now);person=settled.profile;job={...settled.job,progress:{...person.progress},expiresAt:now+VISIT_MEMORY_MS*2};person.bow=job;jobs[id]=job;
      person.session=session;await txn.put(key,person);await txn.put('bowPractices',jobs);return{person,jobs};
    });
    this.bows=result.jobs;this.personalViews.set(id,Prayer.profileView(result.person,now));
    if(legacyId!==id)for(const prior of this.readyPeers().filter(p=>p.a.id===legacyId)){prior.a.ready=false;prior.ws.serializeAttachment(prior.a);try{prior.ws.send(JSON.stringify({t:'replaced'}));prior.ws.close(4002,'personal profile resumed')}catch{}this.broadcast({t:'leave',id:legacyId})}
    a.id=id;a.personal=true;a.personalSession=session;a.admin=admin;
    return result.person;
  }
  async rememberPersonal(a){
    if(!a.personal)return;
    const person=await this.ctx.storage.transaction(async txn=>{const key='person.'+a.id,p=await txn.get(key);if(!p||p.session!==a.personalSession)return null;const next={...p,name:a.name,look:a.look,dog:a.dog,updatedAt:Date.now()};await txn.put(key,next);return next});
    if(person)this.personalViews.set(a.id,Prayer.profileView(person,Date.now()));
  }
  personalHalos(a){
    const f=Prayer.bowProgress(this.bows[a.id],Date.now()),v=this.personalViews.get(a.id),state=Prayer.haloState(f?.halos||v?.halos,Date.now());
    return{halos:{whiteUntil:state.whiteUntil,redUntil:state.redUntil},haloUntil:state.until,haloLevel:state.level};
  }

  async previewPersonalProfile(req){
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    if(req.method!=='POST')return reply({error:'method'},405);
    let message;try{const text=await req.text();if(text.length>512)throw Error();message=JSON.parse(text);if(!Prayer.validCode(message.personalCode))throw Error()}catch{return reply({error:'code'},400)}
    const ip=req.headers.get('CF-Connecting-IP')||'unknown';if(!this.allow({id:'profile-preview:'+ip},'preview',3))return reply({error:'slow'},429);
    try{
      const now=Date.now(),codeHash=await personalHash('garden-code-v1:'+Prayer.normalizeCode(message.personalCode)),id=(await personalHash('garden-person-v1:'+codeHash)).slice(0,20);
      const person=await this.ctx.storage.get('person.'+id);
      if(!person){
        if(Prayer.isAdminCode(message.personalCode))return reply({personal:null,pending:true,now});
        if(message.personalAction==='create'){
          if(/^[0-9]{5}$/.test(Prayer.normalizeCode(message.personalCode))){const reservation=await this.ctx.storage.get('personal.code.reserve.'+codeHash);if(!/^[a-f0-9]{64}$/.test(message.personalRegistration||'')||reservation?.requestHash!==await personalHash('garden-issue-v1:'+message.personalRegistration))return reply({error:'code'},403)}
          return reply({personal:null,pending:true,now});
        }return reply({error:'missing'},404);
      }
      if(person.codeHash!==codeHash)return reply({error:'code'},403);
      // Preview is read-only: no presence, session replacement, practice stop or
      // stored clock change occurs until the owner presses the entry button.
      const projected=Prayer.accountProfile(person,this.bows[id]||person.bow,now).profile;
      return reply({personal:Prayer.profileView(projected,now),now});
    }catch{return reply({error:'storage'},503)}
  }

  async allocatePersonalCode(req){
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    if(req.method!=='POST')return reply({error:'method'},405);
    let request;try{const body=await req.text();if(body.length>256)throw Error();request=JSON.parse(body).request;if(!/^[a-f0-9]{64}$/.test(request||''))throw Error()}catch{return reply({error:'request'},400)}
    const requestHash=await personalHash('garden-issue-v1:'+request);
    try{
      // A retry, even after a lost response/restart, returns the same reservation.
      const existing=await this.ctx.storage.get('personal.issue.'+requestHash);if(existing)return reply({code:existing});
      const ip=req.headers.get('CF-Connecting-IP')||'unknown';if(!this.allow({id:'code-issue:'+ip},'issue',2))return reply({error:'slow'},429);
      const code=await this.ctx.storage.transaction(async txn=>{
        const prior=await txn.get('personal.issue.'+requestHash);if(prior)return prior;
        const saved=await txn.get('personal.code.pool'),pool=saved?new Uint8Array(saved):new Uint8Array(12500);
        // Unbiased random starting slot; a bitmap scan resolves all collisions
        // inside this transaction, with a fixed 12.5 KB pool for 100,000 codes.
        const values=new Uint32Array(1);do{crypto.getRandomValues(values)}while(values[0]>=4294900000);
        const start=values[0]%100000;let slot=-1;
        for(let i=0;i<100000;i++){const candidate=(start+i)%100000;if(String(candidate).padStart(5,'0')===Prayer.ADMIN_CODE)continue;if(!(pool[candidate>>3]&(1<<(candidate&7)))){slot=candidate;break}}
        if(slot<0)throw Error('full');pool[slot>>3]|=1<<(slot&7);
        const next=String(slot).padStart(5,'0'),codeHash=await personalHash('garden-code-v1:'+next);
        await txn.put('personal.code.pool',pool);await txn.put('personal.code.reserve.'+codeHash,{requestHash});await txn.put('personal.issue.'+requestHash,next);return next;
      });return reply({code});
    }catch(error){return reply({error:error.message==='full'?'full':'storage'},503)}
  }

  async fetch(req) {
    if(req&&new URL(req.url).pathname==='/personal/allocate')return this.allocatePersonalCode(req);
    if(req&&new URL(req.url).pathname==='/personal/profile')return this.previewPersonalProfile(req);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().replace(/-/g, '').slice(0, 10), ready: false,loginRateKey:req?.headers.get('CF-Connecting-IP')||null });
    return new Response(null, { status: 101, webSocket: client });
  }

  readyPeers() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((p) => p.ws.readyState === 1 && p.a && p.a.ready);
  }
  peerInfo(a) {
    const job=this.bows?.[a.id]||null,f=Prayer.bowProgress(job,Date.now()),s={...a.s};
    if(a.personal)Object.assign(s,this.personalHalos(a));
    if(f){s.halos=f.halos;s.haloLevel=f.haloLevel;if(['auto','single'].includes(f.mode)){Object.assign(s,job.position,{p:'bow',bp:f.elapsed/Prayer.BOW_MS})}else if(s.p==='bow')s.p='stand';s.haloUntil=Math.max(s.haloUntil||0,f.haloUntil||0)}
    return { id: a.id, name: a.name, look: a.look, dog: a.dog, lastChat: a.lastChat || null, away:!!a.away, bow:job, s };
  }

  visiblePeers(exceptId){
    const live=this.readyPeers(),ids=new Set(live.map(p=>p.a.id));
    const peers=live.filter(p=>p.a.id!==exceptId).map(p=>this.peerInfo(p.a));
    const away=Object.values(this.visits).filter(v=>v.peer&&!v.revoked&&!ids.has(v.peer.id)&&v.awayUntil>Date.now()&&v.peer.id!==exceptId);
    away.sort((a,b)=>b.lastSeen-a.lastSeen);
    return peers.concat(away.map(v=>({...this.peerInfo({...v.peer,s:v.peer.s}),away:true}))).slice(0,MAX_PEERS-1);
  }
  async saveVisits(){
    const live=new Set(this.readyPeers().map(p=>p.a.id));
    const keys=Object.keys(this.visits).sort((a,b)=>this.visits[a].lastSeen-this.visits[b].lastSeen);
    for(const id of keys){if(Object.keys(this.visits).length<=64)break;if(!live.has(id))delete this.visits[id]}
    await this.ctx.storage.put('visits',this.visits);await this.armRpsAlarm();
  }
  async rememberVisit(a,awayUntil=null){
    this.visits[a.id]={peer:this.peerInfo(a),lastSeen:Date.now(),awayUntil,expiresAt:Date.now()+VISIT_MEMORY_MS};
    await this.saveVisits();await this.rememberPersonal(a);
  }
  async advanceVisits(now=Date.now()){
    let changed=false;const leaves=[],live=new Set(this.readyPeers().map(p=>p.a.id));
    for(const [id,visit] of Object.entries(this.visits)){
      if(visit.awayUntil&&visit.awayUntil<=now){visit.awayUntil=null;changed=true;if(!live.has(id))leaves.push(id)}
      if(visit.expiresAt<=now){changed=true;if(live.has(id))visit.expiresAt=now+VISIT_MEMORY_MS;else delete this.visits[id]}
    }
    if(changed)await this.saveVisits();
    for(const id of leaves)this.broadcast({t:'leave',id});
  }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const { ws } of this.readyPeers()) {
      if (ws === except) continue;
      try { ws.send(text); } catch (e) { /* closing socket */ }
    }
  }
  // Small per-connection budget: n messages per second for each kind.
  allow(a, kind, n) {
    const key = a.id + ':' + kind, now = Date.now(), r = this.rate.get(key);
    if (!r || now - r.t > 1000) { this.rate.set(key, { t: now, c: 1 }); return true; }
    if (r.c >= n) return false;
    r.c++;
    return true;
  }
  async save() {
    await this.ctx.storage.put('shared', this.shared);
  }

  async editBow(id,change,personalSession=null){
    const result=await this.ctx.storage.transaction(async txn=>{
      const jobs=(await txn.get('bowPractices'))||{};
      let old=jobs[id]||null,person=await txn.get('person.'+id);
      if(personalSession&&person?.session!==personalSession)return{jobs,person:null};
      if(person&&old){const settled=Prayer.accountProfile(person,old,Date.now());person=settled.profile;old=settled.job}
      let value=change(old);
      if(person){
        if(value){const settled=Prayer.accountProfile(person,value,Date.now());person=settled.profile;value=settled.job}
        else if(old)person.bow={...old,mode:'idle',paused:false,elapsed:0};
        await txn.put('person.'+id,person);
      }
      if(value)jobs[id]=value;else delete jobs[id];
      await txn.put('bowPractices',jobs);return{jobs,person};
    });
    this.bows=result.jobs;if(result.person)this.personalViews.set(id,Prayer.profileView(result.person,Date.now()));return result.jobs[id]||null;
  }
  publishBow(id){
    const live=this.readyPeers().find(p=>p.a.id===id),visit=this.visits[id];
    const a=live?.a||(visit?.peer?{...visit.peer,s:visit.peer.s,away:true}:null);
    if(!a)return;
    const peer=this.peerInfo(a);a.s=peer.s;if(live)live.ws.serializeAttachment(a);
    if(visit?.peer)visit.peer=peer;
    this.broadcast({t:'bow_state',id,job:this.bows[id]||null,peer});
    if(live?.a.personal)live.ws.send(JSON.stringify({t:'personal_state',personal:this.personalViews.get(id)}));
  }
  async advanceBows(now=Date.now()){
    const ids=Object.keys(this.bows||{}).filter(id=>Prayer.bowProgress(this.bows[id],now).done||this.bows[id].expiresAt<=now);
    for(const id of ids){await this.editBow(id,job=>!job||job.expiresAt<=now?null:Prayer.bowProgress(job,now).done?Prayer.settleBow(job,now):job);this.publishBow(id)}
    if(ids.length)await this.saveVisits();
  }
  handleBows(ws,a,m){
    // Control commands from the same socket retain their order across storage awaits.
    this.bowQueue=this.bowQueue||new Map();const previous=this.bowQueue.get(a.id)||Promise.resolve();
    const task=previous.catch(()=>{}).then(()=>this.performBowControl(ws,a,m));this.bowQueue.set(a.id,task);
    return task.finally(()=>{if(this.bowQueue.get(a.id)===task)this.bowQueue.delete(a.id)});
  }
  async performBowControl(ws,a,m){
    a=ws.deserializeAttachment()||a;if(!a.ready)return;
    const error=code=>ws.send(JSON.stringify({t:'bow_error',code,request:m.request||m.id}));
    if(!this.allow(a,'bows',8)){error('slow');return}
    if(m.t==='bow_sync'){await this.advanceBows();ws.send(JSON.stringify({t:'bow_state',id:a.id,job:this.bows[a.id]||null}));return}
    const target=m.target===undefined?108:m.target;
    if(m.t==='bow_start'&&(![108,3000].includes(target)||!Prayer.nonce(m.request)||!['auto','single'].includes(m.mode)||!Number.isInteger(m.count)||m.count<0||m.count>target)){error('invalid');return}
    if(m.t!=='bow_start'&&(!Prayer.nonce(m.id)||!['pause','resume','stop','reset'].includes(m.action))){error('invalid');return}
    const now=Date.now();
    try{
      await this.editBow(a.id,old=>{
        if(m.t==='bow_start'){
          if(old?.id===m.request)return old; // retry never restarts or grants a second reward
          const f=Prayer.bowProgress(old,now),progress={...(old?.progress||{})};if(f)progress[f.target]=f.count;
          const count=m.restart?0:a.personal?(progress[target]||0):Math.max(m.count,progress[target]||0),startCount=m.mode==='auto'&&count>=target?0:count;
          return{id:m.request,rev:(old?.rev||0)+1,mode:m.mode,target,progress,count:startCount,elapsed:0,at:now,paused:false,
            position:{space:spaceOf(a.s),x:a.s.x,z:a.s.z,h:a.s.h},accountedCount:startCount,halos:f?.halos||Prayer.cleanHalos(a.personal?null:a.s.halos,now),haloUntil:a.personal?(f?.haloUntil||0):Math.max(f?.haloUntil||0,a.s.haloUntil||0),expiresAt:now+VISIT_MEMORY_MS*2};
        }
        if(!old||old.id!==m.id)return old; // stale controls cannot cancel a newer practice
        const next=Prayer.settleBow(old,now);if(m.action==='stop'||m.action==='reset'){next.mode='idle';next.paused=false;next.elapsed=0;if(m.action==='reset'){next.count=0;next.accountedCount=0;next.progress={...next.progress,[next.target]:0}}}
        else if(['auto','single'].includes(next.mode))next.paused=m.action==='pause';return next;
      },a.personalSession||null);
      // Visibility/disconnection may have changed the attachment while storage was pending.
      a=ws.deserializeAttachment()||a;const oldVisit=this.visits[a.id],f=Prayer.bowProgress(this.bows[a.id],now);
      this.publishBow(a.id);
      if(a.ready)await this.rememberVisit(ws.deserializeAttachment()||a);
      else if(oldVisit?.peer){oldVisit.awayUntil=Math.max(oldVisit.awayUntil||0,f?.finishedAt?f.finishedAt+VISIT_AWAY_MS:now+VISIT_AWAY_MS);await this.saveVisits()}
      await this.armRpsAlarm();
    }catch(e){error('storage')}
  }

  async handleFire(ws,a,m){
    const now=Date.now(),error=code=>ws.send(JSON.stringify({t:'fire_error',code,request:m.request||a.fireCarry?.request}));
    if(!this.allow(a,'fire',4)){error('slow');return}
    if(m.t==='fire_cancel'){
      if(a.fireCarry&&a.fireCarry.request===m.request){delete a.fireCarry;if(a.s?.p.startsWith('wood'))a.s.p='stand';ws.serializeAttachment(a);this.broadcast({t:'state',id:a.id,s:a.s},ws)}return;
    }
    if(a.away||spaceOf(a.s)!=='garden'){error('space');return}
    if(m.t==='fire_begin'){
      if(typeof m.request!=='string'||!/^[a-f0-9]{32}$/.test(m.request)){error('invalid');return}
      if(Math.hypot(a.s.x-Fire.PILE.x,a.s.z-Fire.PILE.z)>Fire.PILE.r){error('pile');return}
      const count=m.count===undefined?1:m.count;if(!Number.isInteger(count)||count<1||count>Fire.MAX_LOGS){error('invalid');return}
      if(!Fire.canAdd(this.campfire,now,count)){error('full');return}
      if(this.campfire.recent?.[a.id]?.at>now-Fire.COOLDOWN_MS){error('cooldown');return}
      if(!a.fireCarry||a.fireCarry.request!==m.request||now-a.fireCarry.at>45000)
        a.fireCarry={request:m.request,token:crypto.randomUUID(),at:now,count};
      ws.serializeAttachment(a);ws.send(JSON.stringify({t:'fire_ready',...a.fireCarry}));return;
    }
    if(m.t!=='fire_add')return;
    if(typeof m.token!=='string'||!/^[-a-f0-9]{36}$/.test(m.token)){error('invalid');return}
    // A replay acknowledges an already durable contribution without adding fuel again.
    if(this.campfire.recent?.[a.id]?.token===m.token){ws.send(JSON.stringify({t:'fire_state',fire:Fire.publicState(this.campfire),token:m.token}));return}
    const carry=a.fireCarry;
    if(!carry||carry.token!==m.token||now-carry.at>45000){error('expired');return}
    if(now-carry.at<1800){error('early');return}
    const distance=Math.hypot(a.s.x,a.s.z);
    if(distance<2.5||distance>3.8||a.s.p!=='woodfeed'){error('fire');return}
    try{
      const result=await this.ctx.storage.transaction(async txn=>{
        const prev=(await txn.get('campfire'))||Fire.initial(now);
        if(prev.recent?.[a.id]?.token===m.token)return{fire:prev,added:false};
        if(prev.recent?.[a.id]?.at>now-Fire.COOLDOWN_MS)return{code:'cooldown'};
        if(!Fire.canAdd(prev,now,carry.count||1))return{code:'full'};
        const fire=Fire.add(prev,now,a,carry.token,carry.count||1);await txn.put('campfire',fire);return{fire,added:true};
      });
      if(result.code){error(result.code);return}
      if(result.fire.rev>=this.campfire.rev)this.campfire=result.fire;
      const current=ws.deserializeAttachment();
      if(current?.fireCarry?.token===m.token){delete current.fireCarry;ws.serializeAttachment(current)}
      const message={t:'fire_state',fire:Fire.publicState(this.campfire),token:m.token};
      if(result.added)this.broadcast({...message,by:a.id,event:result.fire.last});else ws.send(JSON.stringify(message));
    }catch(e){error('storage')}
  }

  async advanceCandles(now=Date.now()){
    if(!(this.candles?.items||[]).some(c=>c.expiresAt<=now))return;
    const next=await this.ctx.storage.transaction(async txn=>{
      const prev=(await txn.get('prayerCandles'))||{rev:0,items:[]},live=Prayer.active(prev,now);
      if(live.length===prev.items.length)return prev;
      const value={rev:prev.rev+1,items:live};await txn.put('prayerCandles',value);return value;
    });
    if(next.rev>this.candles.rev){this.candles=next;this.broadcast({t:'candles_state',state:Prayer.publicState(next,now)})}
  }
  async handleCandles(ws,a,m){
    const fail=code=>ws.send(JSON.stringify({t:'candle_error',code,nonce:Prayer.nonce(m.nonce)?m.nonce:null}));
    if(!this.allow(a,'candles',4)){fail('slow');return}
    const now=Date.now();
    try{
      if(m.t==='candles_sync'){
        await this.advanceCandles(now);ws.send(JSON.stringify({t:'candles_state',state:Prayer.publicState(this.candles,now)}));await this.armRpsAlarm();return;
      }
      if(m.t!=='candle_light')return;
      if(!Prayer.nonce(m.nonce)){fail('invalid');return}
      const name=Prayer.clean(m.name,25).replace(/\s+/g,' '),wish=Prayer.clean(m.wish,161);
      if(!name||name.length>24||!wish||wish.length>160){fail('invalid');return}
      const result=await this.ctx.storage.transaction(async txn=>{
        const prev=(await txn.get('prayerCandles'))||{rev:0,items:[]},existing=prev.items.find(c=>c.by===a.id&&c.nonce===m.nonce);
        if(existing)return existing.expiresAt>now?{state:prev,candle:existing,added:false}:{code:'expired'};
        // A very late retry must not light a second 24-hour candle after expiry.
        if(!Number.isFinite(m.issuedAt)||now-m.issuedAt>300000||m.issuedAt>now+60000)return{code:'stale'};
        if(spaceOf(a.s)!=='garden'||a.away||!a.s||!Prayer.nearBox(a.s.x,a.s.z))return{code:'far'};
        const live=Prayer.active(prev,now);if(live.length>=Prayer.MAX)return{code:'full'};
        const occupied=new Set(live.map(c=>c.slot));let slot=0;while(occupied.has(slot))slot++;
        const candle={id:crypto.randomUUID().replace(/-/g,''),slot,name,wish,by:a.id,nonce:m.nonce,litBy:a.name,createdAt:now,expiresAt:now+Prayer.LIFE_MS};
        const state={rev:prev.rev+1,items:live.concat(candle)};await txn.put('prayerCandles',state);return{state,candle,added:true};
      });
      if(result.code){fail(result.code);return}
      if(result.state.rev>=this.candles.rev)this.candles=result.state;
      // Commit before acknowledging or showing any flame, including transaction retries.
      const state=Prayer.publicState(result.state,now),candle=state.items.find(c=>c.id===result.candle.id);
      ws.send(JSON.stringify({t:'candle_lit',nonce:m.nonce,candle,state}));
      if(result.added)this.broadcast({t:'candles_state',state},ws);
      await this.armRpsAlarm();
    }catch(e){fail('storage')}
  }

  // Notes live under their own keys, independent of transient chat/shared state.
  async handleBoard(ws,a,m){
    const request=typeof m.request==='string'?m.request.slice(0,64):'';
    const fail=code=>ws.send(JSON.stringify({t:'board_error',code,request,nonce:boardId(m.nonce)?m.nonce:null}));
    try{
      if(m.t==='board_list'){
        if(!this.allow(a,'board_read',4)){fail('slow');return}
        const index=(await this.ctx.storage.get('boardIndex'))||[];
        const pages=Math.max(1,Math.ceil(index.length/BOARD_PAGE_SIZE));
        const page=Number.isInteger(m.page)?Math.max(0,Math.min(pages-1,m.page)):0;
        const notes=(await Promise.all(index.slice(page*BOARD_PAGE_SIZE,(page+1)*BOARD_PAGE_SIZE).map(id=>this.ctx.storage.get('board.note.'+id)))).filter(note=>note&&!note.confirmed);
        ws.send(JSON.stringify({t:'board_page',request,page,pages,total:index.length,notes:notes.map(({id,to,from,at,body})=>({id,to,from,at,preview:body.slice(0,48)}))}));return;
      }
      if(m.t==='board_read'){
        if(!this.allow(a,'board_read',4)){fail('slow');return}
        if(!boardId(m.id)){fail('missing');return}
        const note=await this.ctx.storage.get('board.note.'+m.id);
        if(!note||note.confirmed){fail('missing');return}
        ws.send(JSON.stringify({t:'board_note',request,note}));return;
      }
      if(m.t==='board_confirm'){
        if(!this.allow(a,'board_confirm',2)){fail('slow');return}
        if(!boardId(m.id)){fail('missing');return}
        const key='board.note.'+m.id,recipient=boardRecipient(a.name);
        const result=await this.ctx.storage.transaction(async txn=>{
          const note=await txn.get(key);
          if(!note)return{error:'missing'};
          if(!recipient||boardRecipient(note.to)!==recipient)return{error:'forbidden'};
          const index=(await txn.get('boardIndex'))||[];
          if(note.confirmed)return{removed:false,total:index.length};
          const remaining=index.filter(id=>id!==m.id);
          // Discard message content; retain only a receipt so an old post retry cannot restore it.
          await txn.put(key,{id:m.id,to:note.to,confirmed:true});
          await txn.put('boardIndex',remaining);
          return{removed:true,total:remaining.length};
        });
        if(result.error){fail(result.error);return}
        ws.send(JSON.stringify({t:'board_confirmed',request,id:m.id,total:result.total}));
        if(result.removed)this.broadcast({t:'board_changed',deletedId:m.id,total:result.total},ws);
        return;
      }
      if(m.t!=='board_post')return;
      const to=clean(m.to,13),body=boardText(m.body);
      if(!boardId(m.nonce)||!to||to.length>12||!body||body.length>BOARD_MAX_TEXT){fail('invalid');return}
      // Same tab + same draft nonce always resolves to the same stored note, including after reconnect.
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.id+':'+m.nonce));
      const id=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,32),key='board.note.'+id;
      const existing=await this.ctx.storage.get(key);
      if(existing?.confirmed){fail('confirmed');return}
      if(existing){ws.send(JSON.stringify({t:'board_posted',nonce:m.nonce,note:existing}));return}
      if(!this.allow(a,'board_post',1)){fail('slow');return}
      const result=await this.ctx.storage.transaction(async txn=>{
        const duplicate=await txn.get(key);if(duplicate)return duplicate.confirmed?{confirmed:true}:{note:duplicate,created:false};
        const index=(await txn.get('boardIndex'))||[];
        if(index.length>=BOARD_MAX_NOTES)return{full:true};
        const note={id,to,body,from:a.name,at:Date.now()};
        await txn.put(key,note);await txn.put('boardIndex',[id,...index]);
        return{note,created:true,total:index.length+1};
      });
      if(result.confirmed){fail('confirmed');return}
      if(result.full){fail('full');return}
      ws.send(JSON.stringify({t:'board_posted',nonce:m.nonce,note:result.note}));
      if(result.created)this.broadcast({t:'board_changed',total:result.total});
    }catch(error){fail('storage')}
  }


  // Game state is private to its two players. Choices never appear in shared or peer data.
  rpsFor(id) {
    return this.rps.find(g => activeRps(g) && g.players.includes(id))
      || [...this.rps].reverse().find(g => g.players.includes(id)) || null;
  }
  rpsView(game, id) {
    if (!game || !game.players.includes(id)) return null;
    const index = game.players.indexOf(id), other = game.players[1 - index];
    return {
      id: game.id, status: game.status, inviter: index === 0,
      opponent: { id: other, name: game.names[1 - index] },
      expiresAt: game.expiresAt, startAt: game.startAt || 0, deadline: game.deadline || 0,
      choice: game.choices[id] || null,
      opponentChoice: game.status === 'result' ? game.choices[other] : null,
      result: game.status === 'result' ? (game.winner === null ? 'draw' : game.winner === id ? 'win' : 'lose') : null,
      reason: game.reason || null,
    };
  }
  sendRps(game) {
    for (const { ws, a } of this.readyPeers()) {
      if (game.players.includes(a.id)) {
        try { ws.send(JSON.stringify({ t: 'rps_state', game: this.rpsView(game, a.id) })); } catch (e) {}
      }
    }
  }
  async armRpsAlarm() {
    const deadlines=this.rps.map(g=>g.expiresAt);
    for(const job of Object.values(this.bows||{})){const f=Prayer.bowProgress(job,Date.now());if(f.finishedAt&&f.mode!=='idle')deadlines.push(f.finishedAt);else if(f.done)deadlines.push(Date.now()+1);deadlines.push(job.expiresAt)}
    for(const candle of this.candles?.items||[])deadlines.push(candle.expiresAt);
    for(const visit of Object.values(this.visits)){if(visit.awayUntil)deadlines.push(visit.awayUntil);deadlines.push(visit.expiresAt)}
    const next=deadlines.length?Math.min(...deadlines):null;
    if (next !== null) await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async saveRps() {
    await this.ctx.storage.put('rpsGames', this.rps);
    await this.armRpsAlarm();
  }
  finishRps(game, reason, now = Date.now()) {
    game.status = reason ? 'cancelled' : 'result';
    game.reason = reason || null;
    game.expiresAt = now + RPS_RETAIN_MS;
    if (!reason) {
      const [a, b] = game.players, left = game.choices[a], right = game.choices[b];
      game.winner = left === right ? null : RPS_BEATS[left] === right ? a : b;
    }
  }
  async advanceRps(now = Date.now()) {
    const changed = [];
    for (const game of this.rps) {
      if (activeRps(game) && now >= game.expiresAt) {
        const reason = game.status === 'invited' ? 'timeout'
          : game.players.every(id => RPS_CHOICES.includes(game.choices[id])) ? null : 'no_choice';
        this.finishRps(game, reason, now); changed.push(game);
      }
    }
    const count = this.rps.length;
    this.rps = this.rps.filter(g => activeRps(g) || g.expiresAt > now);
    if (changed.length || count !== this.rps.length) await this.saveRps();
    for (const game of changed) this.sendRps(game);
  }
  async alarm() {
    await this.advanceBows();await this.advanceCandles();await this.advanceRps();await this.advanceVisits();
    await this.armRpsAlarm();
  }
  async cancelRpsFor(id, reason) {
    const games = this.rps.filter(g => activeRps(g) && g.players.includes(id));
    if (!games.length) return;
    await this.advanceRps();
    const cancelled = games.filter(activeRps);
    for (const game of cancelled) this.finishRps(game, reason);
    if (cancelled.length) await this.saveRps();
    for (const game of cancelled) this.sendRps(game);
  }
  async checkRpsDistance(id) {
    const game = this.rps.find(g => activeRps(g) && g.players.includes(id));
    if (!game) return;
    const peers = this.readyPeers(), pair = game.players.map(player => peers.find(p => p.a.id === player));
    if (pair.some(p => !p)) return this.cancelRpsFor(id, 'disconnected');
    if (!sameSpace(pair[0].a.s,pair[1].a.s)||Math.hypot(pair[0].a.s.x - pair[1].a.s.x, pair[0].a.s.z - pair[1].a.s.z) > RPS_BREAK_DISTANCE)
      await this.cancelRpsFor(id, 'away');
  }
  async handleRps(ws, a, m) {
    const error = code => { try { ws.send(JSON.stringify({ t: 'rps_error', code })); } catch (e) {} };
    if (!this.allow(a, 'rps', 5)) { error('slow'); return; }
    await this.advanceRps();
    const now = Date.now();
    if (m.t === 'rps_sync') {
      ws.send(JSON.stringify({ t: 'rps_state', game: this.rpsView(this.rpsFor(a.id), a.id) }));
      return;
    }
    if (m.t === 'rps_invite') {
      if (!this.allow(a, 'rpsi', 1)) { error('slow'); return; }
      if (typeof m.peer !== 'string' || m.peer === a.id) { error('peer'); return; }
      const other = this.readyPeers().find(p => p.a.id === m.peer);
      if (!other||other.a.away) { error('offline'); return; }
      if (this.rps.some(g => activeRps(g) && (g.players.includes(a.id) || g.players.includes(other.a.id)))) { error('busy'); return; }
      if (!sameSpace(a.s,other.a.s)||Math.hypot(a.s.x - other.a.s.x, a.s.z - other.a.s.z) > RPS_DISTANCE) { error('far'); return; }
      // Keep at most one completed match per player; a new invitation always takes priority.
      this.rps = this.rps.filter(g => !g.players.includes(a.id) && !g.players.includes(other.a.id));
      const game = { id: crypto.randomUUID(), players: [a.id, other.a.id], names: [a.name, other.a.name],
        status: 'invited', createdAt: now, expiresAt: now + RPS_INVITE_MS, choices: {} };
      this.rps.push(game); await this.saveRps(); this.sendRps(game); return;
    }
    const game = this.rps.find(g => g.id === m.game && g.players.includes(a.id));
    if (!game || !activeRps(game)) { error('ended'); return; }
    if (m.t === 'rps_reply') {
      if (game.status !== 'invited' || game.players[1] !== a.id || typeof m.accept !== 'boolean') { error('reply'); return; }
      if (!m.accept) this.finishRps(game, 'declined', now);
      else {
        const other = this.readyPeers().find(p => p.a.id === game.players[0]);
        if (!other) this.finishRps(game, 'disconnected', now);
        else if (!sameSpace(a.s,other.a.s)||Math.hypot(a.s.x - other.a.s.x, a.s.z - other.a.s.z) > RPS_DISTANCE) this.finishRps(game, 'away', now);
        else {
          game.status = 'playing';game.startAt = now + 800;game.deadline = game.startAt + 3000;game.expiresAt = game.deadline;
        }
      }
      await this.saveRps();this.sendRps(game);return;
    }
    if (m.t === 'rps_cancel') {
      this.finishRps(game, 'cancelled', now);await this.saveRps();this.sendRps(game);return;
    }
    if (m.t === 'rps_choose') {
      if (game.status !== 'playing' || now >= game.deadline || !RPS_CHOICES.includes(m.choice)) { error('choice'); return; }
      if (game.choices[a.id]) { error('locked'); return; }
      game.choices[a.id] = m.choice;
      await this.saveRps();this.sendRps(game);
    }
  }

  async admit(ws,m){
    const a=ws.deserializeAttachment();if(!a)return;
    if (a.ready || a.handshaking) return;
    a.handshaking = true;
    ws.serializeAttachment(a);
    // 탭의 비공개 토큰에서 공개 접속 ID만 파생한다. 원문 토큰은 다른 사람에게 보내지 않는다.
    if (typeof m.resumeToken === 'string' && /^[a-f0-9]{64}$/.test(m.resumeToken)) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m.resumeToken));
      a.id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 20);
    }
    if(a.loginRateKey&&m.personalCode!==undefined&&!this.allow({id:'personal-login:'+a.loginRateKey},'login',3)){ws.send(JSON.stringify({t:'personal_error',code:'slow'}));ws.close(4004,'try later');return}
    const legacyId=a.id;let personal=null;
    try{personal=await this.personalIdentity(ws,a,m,legacyId)}catch(error){a.handshaking=false;ws.serializeAttachment(a);ws.send(JSON.stringify({t:'personal_error',code:['code','missing','name_taken'].includes(error.message)?error.message:'storage'}));ws.close(4004,'personal profile unavailable');return}
    await this.advanceBows();await this.advanceVisits();
    const previous=this.visits[a.id];
    if(previous&&previous.revoked&&!a.personal){ws.send(JSON.stringify({t:'visit_ended'}));ws.close(4003,'visit ended');return}
    if(!personal&&this.nameInUse(clean(m.name,12)||'친구',a.id)){ws.send(JSON.stringify({t:'personal_error',code:'name_taken'}));ws.close(4004,'name in use');return}
    const duplicates = this.readyPeers().filter(p => p.a.id === a.id);
    const resumed=!!previous||duplicates.length>0;
    if (this.readyPeers().length - duplicates.length >= MAX_PEERS) {
      ws.send(JSON.stringify({ t: 'full', max: MAX_PEERS }));
      ws.close(4001, 'room full');
      return;
    }
    if (duplicates.length) a.lastChat = duplicates[0].a.lastChat || null;
    else if(previous&&previous.peer)a.lastChat=previous.peer.lastChat||null;
    for (const prior of duplicates) {
      prior.a.ready = false;
      prior.ws.serializeAttachment(prior.a);
      try { prior.ws.send(JSON.stringify({ t: 'replaced' })); prior.ws.close(4002, 'session resumed'); } catch (e) {}
    }
    a.name = personal?.name||clean(m.name, 12) || '친구';
    a.look = personal?.look||cleanLook(m.look);
    a.dog = personal?.dog||cleanDog(m.dog);
    a.s = cleanState(m.s) || { x: 0, z: 14, h: Math.PI, p: 'stand', bp: 0, u:false };
    if(a.personal)Object.assign(a.s,this.personalHalos(a));
    if(a.s.p.startsWith('wood'))a.s.p='stand';
    a.ready = true;a.away=!!m.away;
    const continuing=Prayer.bowProgress(this.bows[a.id],Date.now());if(continuing&&['auto','single'].includes(continuing.mode))a.s=this.peerInfo(a).s;
    a.handshaking = false;
    ws.serializeAttachment(a);
    await this.advanceRps();
    await this.rememberVisit(a);
    const peers = this.visiblePeers(a.id);
    ws.send(JSON.stringify({ t: 'welcome', admin:a.admin?1:0, features:{personal:1,board:1,listening:1,campfire:1,candles:1,bows:1,bowTargets:[108,3000]},bow:this.bows[a.id]||null,personal:a.personal?this.personalViews.get(a.id):null,listeningAudio:this.listeningAudio, you: a.id, now: Date.now(), max: MAX_PEERS, resumed, peers, shared: {...this.shared,campfire:Fire.publicState(this.campfire),candles:Prayer.publicState(this.candles,Date.now())}, rps: this.rpsView(this.rpsFor(a.id), a.id) }));
    this.broadcast({ t: resumed?'resume':'join', peer: this.peerInfo(a) }, ws);
    return;
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m.t !== 'string') return;

    if (m.t === 'hello') return this.queueAdmission(()=>this.admit(ws,m));
    if (!a.ready) return;
    if(['bow_start','bow_control','bow_sync'].includes(m.t))return this.handleBows(ws,a,m);
    if(['candle_light','candles_sync'].includes(m.t))return this.handleCandles(ws,a,m);
    if(['fire_begin','fire_add','fire_cancel'].includes(m.t))return this.handleFire(ws,a,m);
    if (['board_list','board_read','board_post','board_confirm'].includes(m.t)) return this.handleBoard(ws,a,m);
    if (['rps_invite', 'rps_reply', 'rps_cancel', 'rps_choose', 'rps_sync'].includes(m.t)) return this.handleRps(ws, a, m);

    switch (m.t) {
      case 'background':case 'foreground':{
        if(!this.allow(a,'visibility',4))return;
        const away=m.t==='background';if(a.away===away)return;
        a.away=away;if(away){delete a.fireCarry;if(a.s?.p.startsWith('wood'))a.s.p='stand'}ws.serializeAttachment(a);await this.rememberVisit(a);
        this.broadcast({t:away?'away':'resume',peer:this.peerInfo(a)},ws);if(!away)ws.send(JSON.stringify({t:'bow_state',id:a.id,job:this.bows[a.id]||null}));return;
      }
      case 'leave': {
        await this.departVisit(ws,true);
        return;
      }
      case 'kick_all': {
        // 관리자만. 접속 중인 다른 사람과 자리 비움으로 남은 사람을 모두 내보낸다.
        // 각자의 절 진행·기록·외형은 일반 '나가기'와 같은 경로로 저장되고, 같은 코드로 다시 들어올 수 있다.
        if(!a.admin||!this.allow(a,'kick',1))return;
        let count=0;const kicked=new Set();
        for(const p of this.readyPeers()){
          if(p.ws===ws||p.a.id===a.id)continue;
          try{p.ws.send(JSON.stringify({t:'kicked'}))}catch{}
          await this.departVisit(p.ws,true);if(!kicked.has(p.a.id)){kicked.add(p.a.id);count++}
        }
        const live=new Set(this.readyPeers().map(p=>p.a.id));
        for(const [id,visit] of Object.entries(this.visits)){
          if(id===a.id||live.has(id)||!visit?.peer||visit.revoked)continue;
          this.visits[id]={revoked:true,lastSeen:Date.now(),expiresAt:Date.now()+VISIT_MEMORY_MS};this.broadcast({t:'leave',id});
          if(!kicked.has(id)){kicked.add(id);count++}
        }
        await this.saveVisits();
        ws.send(JSON.stringify({t:'kick_done',count}));
        return;
      }
      case 'state': {
        if (!this.allow(a, 's', 25)) return;
        const s = cleanState(m.s);
        if (!s) return;
        if(spaceOf(s)!=='garden'||a.fireCarry&&Date.now()-a.fireCarry.at>45000)delete a.fireCarry;
        if(s.p.startsWith('wood')&&!a.fireCarry)s.p='stand';
        s.wc=s.p.startsWith('wood')?a.fireCarry?.count||1:0;
        const activeBow=Prayer.bowProgress(this.bows[a.id],Date.now());
        if(activeBow&&['auto','single'].includes(activeBow.mode)&&(s.p!=='bow'||spaceOf(s)!==spaceOf(a.s)||Math.hypot(s.x-a.s.x,s.z-a.s.z)>.15))await this.handleBows(ws,a,{t:'bow_control',id:activeBow.id,action:'stop'});
        if(a.personal)Object.assign(s,this.personalHalos(a));
        a.s = s;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'state', id: a.id, s: a.s }, ws);
        await this.checkRpsDistance(a.id);
        return;
      }
      case 'profile': return this.queueAdmission(async()=>{
        const current=ws.deserializeAttachment();if(!current?.ready)return;
        if(!this.allow(current,'p',2))return;
        const name=clean(m.name,12)||current.name;
        if(nameKey(name)!==nameKey(current.name)&&this.nameInUse(name,current.id)){
          ws.send(JSON.stringify({t:'profile_error',code:'name_taken',name:current.name,look:current.look,dog:current.dog}));return;
        }
        const renamed=name!==current.name;
        current.name=name;current.look=cleanLook(m.look)||cleanLook(current.look);current.dog=cleanDog(m.dog)||current.dog;
        ws.serializeAttachment(current);
        if(renamed)await this.rememberVisit(current);else await this.rememberPersonal(current);
        this.broadcast({t:'profile',id:current.id,name:current.name,look:current.look,dog:current.dog},ws);
      });
      case 'chat': {
        if (!this.allow(a, 'c', 1)) return;
        const text = clean(m.text, 200);
        if (!text) return;
        const msg = { id: a.id, name: a.name, text, at: Date.now() };
        a.lastChat = { text, at: msg.at };
        ws.serializeAttachment(a);
        this.shared.chat = this.shared.chat.concat(msg).slice(-50);
        await this.save();
        this.broadcast({ t: 'chat', ...msg });
        return;
      }
      case 'flower': {
        if (!this.allow(a, 'f', 2)) return;
        const c = Number.isInteger(m.c) && m.c >= 0 && m.c < 5 ? m.c : 0;
        this.shared.flowers = this.shared.flowers.concat(c).slice(-300);
        await this.save();
        this.broadcast({ t: 'flower', c, by: a.id });
        return;
      }
      case 'listening_music': {
        const error=code=>ws.send(JSON.stringify({t:'listening_error',code}));
        if(spaceOf(a.s)!=='listening'){error('space');return}
        if(!this.allow(a,'listening',2)){error('slow');return}
        if(!['track','power'].includes(m.action)||m.action==='track'&&!LISTENING_TRACKS.includes(m.track)||m.action==='power'&&typeof m.power!=='boolean'){error('value');return}
        try{
          const next=await this.ctx.storage.transaction(async txn=>{
            const prev=(await txn.get('listeningAudio'))||{track:'bluehour',power:false,startedAt:0,offsetMs:0,rev:0},now=Date.now();
            const position=Math.max(0,(prev.offsetMs||0)+(prev.power?now-prev.startedAt:0));
            const sameTrack=m.action==='track'&&m.track===prev.track;
            const value={track:m.action==='track'?m.track:prev.track,power:m.action==='track'?true:m.power,
              offsetMs:m.action==='track'&&!sameTrack?0:position,startedAt:now,rev:(prev.rev||0)+1};
            await txn.put('listeningAudio',value);return value;
          });
          if(next.rev>=this.listeningAudio.rev)this.listeningAudio=next;
          this.broadcast({t:'listening_audio',audio:this.listeningAudio});
        }catch(e){error('storage')}
        return;
      }
      case 'music': {
        if (!this.allow(a, 'm', 1)) return;
        if (m.track !== null && !TRACKS.includes(m.track)) return;
        const track = m.track;
        this.shared.music = { track, startedAt: Date.now(), videoId: null, by: a.id };
        await this.save();
        this.broadcast({ t: 'music', music: this.shared.music, name: a.name });
        return;
      }
      case 'order': {
        const seat=pochaSeatFor(a.s);
        const reject=code=>ws.send(JSON.stringify({t:'pocha_error',code}));
        if(!this.allow(a,'o',4)){reject('slow');return}
        if(seat<0||m.seat!==seat){reject('seat');return}
        if(!POCHA_ITEMS.includes(m.item)){reject('item');return}
        const order = { id: crypto.randomUUID(), seat, item: m.item, at: Date.now(), by: a.id };
        const current=this.shared.pocha.filter(row=>row.seat!==seat||row.by===a.id);
        this.shared.pocha=trimPochaOrders(current.concat(order));
        await this.save();
        this.broadcast({ t: 'order', order, pocha: this.shared.pocha, name: a.name });
        return;
      }
      case 'clearSeat': {
        const seat=pochaSeatFor(a.s);
        if (!this.allow(a, 'x', 2) || seat<0 || m.seat!==seat) {ws.send(JSON.stringify({t:'pocha_error',code:'seat'}));return;}
        this.shared.pocha = this.shared.pocha.filter(order => order.seat !== seat);
        await this.save();
        this.broadcast({ t: 'pocha', pocha: this.shared.pocha });
        return;
      }
      case 'cheers': {
        // 짠: 상태로 남기지 않고 지금 있는 사람들에게만 알린다. 같은 테이블 판단은 화면에서 한다.
        if (!this.allow(a, 'h', 1)) return;
        this.broadcast({ t: 'cheers', id: a.id, name: a.name }, ws);
        return;
      }
      case 'fireplay':{
        if(spaceOf(a.s)!=='garden'||!this.allow(a,'fireplay',1)||!['aurora','fireworks'].includes(m.kind)){ws.send(JSON.stringify({t:'fireplay_error',code:'slow'}));return;}
        if(m.kind==='aurora'&&Math.hypot(a.s.x,a.s.z)>8){ws.send(JSON.stringify({t:'fireplay_error',code:'far'}));return}
        const effect=this.shared.fireplay||{auroraUntil:0,fireworks:null},now=Date.now();
        if(m.kind==='aurora')effect.auroraUntil=now+10000;
        else effect.fireworks={startedAt:now,seed:crypto.getRandomValues(new Uint32Array(1))[0]};
        this.shared.fireplay=effect;await this.save();this.broadcast({t:'fireplay',effect,name:a.name});return;
      }
      case 'shake': {
        // 악수: 가까이(4m) 있는 상대에게만 알린다. 상대 화면에서 마주 보고 손을 맞잡는다.
        if (!this.allow(a, 'shake', 1)) return;
        const other = this.readyPeers().find(p => p.a.id === m.to);
        if (!other || other.a.away || !sameSpace(a.s,other.a.s) || Math.hypot(a.s.x - other.a.s.x, a.s.z - other.a.s.z) > 4) return;
        try { other.ws.send(JSON.stringify({ t: 'shake', id: a.id, name: a.name, to: m.to })); } catch (e) {}
        return;
      }
      case 'stoke': {
        // Legacy clients cannot bypass the shared wood-carrying action.
        ws.send(JSON.stringify({t:'fire_error',code:'refresh'}));
        return;
      }
      case 'weather': {
        if (!this.allow(a, 'w', 1) || !WEATHER.includes(m.mode)) return;
        if(this.shared.weather===m.mode)return;
        this.shared.weatherTransition={from:this.shared.weather||'auto',to:m.mode,at:Date.now()};
        this.shared.weather = m.mode;
        await this.save();
        this.broadcast({ t: 'weather', mode: m.mode, transition:this.shared.weatherTransition, name: a.name });
        return;
      }
      case 'ping': {
        if (!this.allow(a, 'g', 2)) return;
        ws.send(JSON.stringify({ t: 'pong', c: Number.isFinite(m.c) ? m.c : 0, s: Date.now() }));
        return;
      }
    }
  }

  async departVisit(ws,explicit){
    const a=ws.deserializeAttachment();
    if(a&&a.ready){
      delete a.fireCarry;if(a.s?.p.startsWith('wood'))a.s.p='stand';
      a.ready=false;ws.serializeAttachment(a);
      if(!this.readyPeers().some(p=>p.a.id===a.id)){
        if(explicit){
          await this.editBow(a.id,job=>job?{...Prayer.settleBow(job,Date.now()),mode:'idle',paused:false,elapsed:0}:null,a.personalSession||null);
          if(this.readyPeers().some(p=>p.a.id===a.id))return;
          await this.rememberPersonal(a);
          this.visits[a.id]={revoked:true,lastSeen:Date.now(),expiresAt:Date.now()+VISIT_MEMORY_MS};
          await this.saveVisits();this.broadcast({t:'leave',id:a.id});
        }else{
          const f=Prayer.bowProgress(this.bows[a.id],Date.now());a.away=true;await this.rememberVisit(a,Math.max(Date.now()+VISIT_AWAY_MS,f?.finishedAt&&['auto','single'].includes(f.mode)?f.finishedAt+VISIT_AWAY_MS:0));
          this.broadcast({t:'away',peer:this.peerInfo(a)});
        }
        await this.cancelRpsFor(a.id,'disconnected');
      }
    }
    if(a&&!this.readyPeers().some(p=>p.a.id===a.id))for(const key of this.rate.keys())if(key.startsWith(a.id+':'))this.rate.delete(key);
    try{ws.close(1000,explicit?'left garden':'connection paused')}catch(e){}
  }
  async webSocketClose(ws){await this.departVisit(ws,false)}
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}


export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok',{headers:{'X-Garden-Protocol':'board-v2'}});
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{6,40})$/);
    const allocating=['/personal/allocate','/personal/profile'].includes(url.pathname);
    if (!m&&!allocating) {
      if (env.ASSETS) {
        const response=await env.ASSETS.fetch(req);
        if(url.pathname==='/'||url.pathname==='/index.html'){
          const headers=new Headers(response.headers);headers.set('Cache-Control','no-store, max-age=0');
          return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
        }
        return response;
      }
      return new Response('기억의 정원 방 서버입니다.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (allocating&&req.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
    if (!allocating&&req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    const origins = env.ALLOWED_ORIGINS || (env.ASSETS ? url.origin : '');
    const allowed = origins.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(req.headers.get('Origin') || '')) return new Response('origin not allowed', { status: 403 });
    // 통합 정원에서는 이전 링크를 열어도 모두 같은 공간으로 연결한다.
    const space = env.ASSETS||allocating ? 'memorygarden' : m[1];
    return env.ROOMS.get(env.ROOMS.idFromName(space)).fetch(req);
  },
};


