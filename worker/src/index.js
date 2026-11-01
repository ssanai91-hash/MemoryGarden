// 기억의 정원 방 서버.
// 방 하나 = Durable Object 하나. 접속자 위치·동작은 중계만 하고,
// 꽃·날씨·최근 대화는 방 저장소에 남겨 늦게 온 사람도 같은 상태를 본다.
import { DurableObject } from 'cloudflare:workers';

// 걸을 수 있는 반경(m). index.html의 WORLD_R와 같게 둔다.
const WORLD_R = 90;
const MAX_PEERS = 16;
const VISIT_AWAY_MS=5*60*1000,VISIT_MEMORY_MS=24*60*60*1000;
const TRACKS=['dawn','wind','bowl','melody','banya'];
const LISTENING_TRACKS=['bluehour','rainwood','starlight'];
const spaceOf=s=>s&&s.space==='listening'?'listening':'garden';
const sameSpace=(a,b)=>spaceOf(a)===spaceOf(b);
const validVideo=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{11}$/.test(v);
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

const POSES = ['stand', 'standing_pray', 'pray2', 'shake', 'sit', 'lie', 'prone', 'wave', 'pray', 'bow', 'coffee', 'beer', 'fuel', 'yoga', 'soda', 'soju', 'cheers', 'makgeolli'];
const POCHA_ITEMS = ['odeng', 'dakbal', 'egg', 'golbaeng', 'jeon', 'tteok', 'soju', 'beer', 'makgeolli', 'cider'];

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
function cleanState(s) {
  if (!s || typeof s !== 'object') return null;
  const x = num(s.x, -WORLD_R, WORLD_R), z = num(s.z, -WORLD_R, WORLD_R);
  if (x === null || z === null) return null;
  const space=spaceOf(s);
  return { space,x:space==='listening'?num(x,-5.6,5.6):x,z:space==='listening'?num(z,-3,5.3):z, h: num(s.h, -1000, 1000) ?? 0, p: POSES.includes(s.p) ? s.p : 'stand', bp: num(s.bp, 0, 1) ?? 0, u:s.u===true };
}

export class GardenRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.rate = new Map();
    this.rps = [];this.visits={};
    ctx.blockConcurrencyWhile(async () => {
      this.shared = (await ctx.storage.get('shared')) || {
        flowers: [], music:{track:null,startedAt:0,videoId:null}, weather: 'auto', chat: [],
      };
      if (!Array.isArray(this.shared.pocha)) this.shared.pocha = [];
      if(!this.shared.music){this.shared.music={track:null,startedAt:0,videoId:null};await ctx.storage.put('shared',this.shared)}
      this.listeningAudio=(await ctx.storage.get('listeningAudio'))||{track:'bluehour',power:false,startedAt:0,offsetMs:0,rev:0};
      this.rps = (await ctx.storage.get('rpsGames')) || [];
      this.visits=(await ctx.storage.get('visits'))||{};
      // Preserve a pending alarm when waking from hibernation.
      if ((this.rps.length||Object.keys(this.visits).length) && await ctx.storage.getAlarm() === null) await this.armRpsAlarm();
    });
  }

  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().replace(/-/g, '').slice(0, 10), ready: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  readyPeers() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, a: ws.deserializeAttachment() })).filter((p) => p.ws.readyState === 1 && p.a && p.a.ready);
  }
  peerInfo(a) {
    return { id: a.id, name: a.name, look: a.look, dog: a.dog, lastChat: a.lastChat || null, away:!!a.away, s: a.s };
  }

  visiblePeers(exceptId){
    const live=this.readyPeers(),ids=new Set(live.map(p=>p.a.id));
    const peers=live.filter(p=>p.a.id!==exceptId).map(p=>this.peerInfo(p.a));
    const away=Object.values(this.visits).filter(v=>v.peer&&!v.revoked&&!ids.has(v.peer.id)&&v.awayUntil>Date.now()&&v.peer.id!==exceptId);
    away.sort((a,b)=>b.lastSeen-a.lastSeen);
    return peers.concat(away.map(v=>({...v.peer,away:true}))).slice(0,MAX_PEERS-1);
  }
  async saveVisits(){
    const live=new Set(this.readyPeers().map(p=>p.a.id));
    const keys=Object.keys(this.visits).sort((a,b)=>this.visits[a].lastSeen-this.visits[b].lastSeen);
    for(const id of keys){if(Object.keys(this.visits).length<=64)break;if(!live.has(id))delete this.visits[id]}
    await this.ctx.storage.put('visits',this.visits);await this.armRpsAlarm();
  }
  async rememberVisit(a,awayUntil=null){
    this.visits[a.id]={peer:this.peerInfo(a),lastSeen:Date.now(),awayUntil,expiresAt:Date.now()+VISIT_MEMORY_MS};
    await this.saveVisits();
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
    await this.advanceRps();await this.advanceVisits();
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

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 4096) return;
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment();
    if (!a || !m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (a.ready || a.handshaking) return;
      a.handshaking = true;
      ws.serializeAttachment(a);
      // 탭의 비공개 토큰에서 공개 접속 ID만 파생한다. 원문 토큰은 다른 사람에게 보내지 않는다.
      if (typeof m.resumeToken === 'string' && /^[a-f0-9]{64}$/.test(m.resumeToken)) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(m.resumeToken));
        a.id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('').slice(0, 20);
      }
      await this.advanceVisits();
      const previous=this.visits[a.id];
      if(previous&&previous.revoked){ws.send(JSON.stringify({t:'visit_ended'}));ws.close(4003,'visit ended');return}
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
      a.name = clean(m.name, 12) || '친구';
      a.look = cleanLook(m.look);
      a.dog = cleanDog(m.dog);
      a.s = cleanState(m.s) || { x: 0, z: 14, h: Math.PI, p: 'stand', bp: 0, u:false };
      a.ready = true;a.away=!!m.away;
      a.handshaking = false;
      ws.serializeAttachment(a);
      await this.advanceRps();
      await this.rememberVisit(a);
      // 같은 이름으로 '잠시 자리 비움'인 예전 접속이 있으면 같은 사람이 새로 들어온 것으로 보고 지운다.
      const ghosts=Object.entries(this.visits).filter(([id,v])=>id!==a.id&&v.peer&&!v.revoked&&v.awayUntil&&v.peer.name===a.name&&!this.readyPeers().some(p=>p.a.id===id)).map(([id])=>id);
      for(const id of ghosts){delete this.visits[id];await this.cancelRpsFor(id,'replaced');this.broadcast({t:'leave',id},ws)}
      if(ghosts.length)await this.saveVisits();
      const peers = this.visiblePeers(a.id);
      ws.send(JSON.stringify({ t: 'welcome', features:{board:1,listening:1},listeningAudio:this.listeningAudio, you: a.id, now: Date.now(), max: MAX_PEERS, resumed, peers, shared: this.shared, rps: this.rpsView(this.rpsFor(a.id), a.id) }));
      this.broadcast({ t: resumed?'resume':'join', peer: this.peerInfo(a) }, ws);
      return;
    }
    if (!a.ready) return;
    if (['board_list','board_read','board_post','board_confirm'].includes(m.t)) return this.handleBoard(ws,a,m);
    if (['rps_invite', 'rps_reply', 'rps_cancel', 'rps_choose', 'rps_sync'].includes(m.t)) return this.handleRps(ws, a, m);

    switch (m.t) {
      case 'background':case 'foreground':{
        if(!this.allow(a,'visibility',4))return;
        const away=m.t==='background';if(a.away===away)return;
        a.away=away;ws.serializeAttachment(a);await this.rememberVisit(a);
        this.broadcast({t:away?'away':'resume',peer:this.peerInfo(a)},ws);return;
      }
      case 'leave': {
        await this.departVisit(ws,true);
        return;
      }
      case 'state': {
        if (!this.allow(a, 's', 25)) return;
        const s = cleanState(m.s);
        if (!s) return;
        a.s = s;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'state', id: a.id, s: a.s }, ws);
        await this.checkRpsDistance(a.id);
        return;
      }
      case 'profile': {
        if (!this.allow(a, 'p', 2)) return;
        a.name = clean(m.name, 12) || a.name;
        a.look = cleanLook(m.look) || a.look;
        a.dog = cleanDog(m.dog) || a.dog;
        ws.serializeAttachment(a);
        this.broadcast({ t: 'profile', id: a.id, name: a.name, look: a.look, dog: a.dog }, ws);
        return;
      }
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
        this.shared.music = { track, startedAt: Date.now(), videoId: track === 'banya' && validVideo(m.videoId) ? m.videoId : null, by: a.id };
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
        // 장작 넣기: 상태로 남기지 않고 지금 있는 사람들에게만 불꽃 연출을 알린다.
        if (spaceOf(a.s)!=='garden'||!this.allow(a, 'k', 1)) return;
        this.broadcast({ t: 'stoke', id: a.id, name: a.name }, ws);
        return;
      }
      case 'weather': {
        if (!this.allow(a, 'w', 1) || !WEATHER.includes(m.mode)) return;
        this.shared.weather = m.mode;
        await this.save();
        this.broadcast({ t: 'weather', mode: m.mode, name: a.name });
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
      a.ready=false;ws.serializeAttachment(a);
      if(!this.readyPeers().some(p=>p.a.id===a.id)){
        if(explicit){
          this.visits[a.id]={revoked:true,lastSeen:Date.now(),expiresAt:Date.now()+VISIT_MEMORY_MS};
          await this.saveVisits();this.broadcast({t:'leave',id:a.id});
        }else{
          a.away=true;await this.rememberVisit(a,Date.now()+VISIT_AWAY_MS);
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


// 정적 자산은 Range 요청(206)을 지원하지 않아 iPhone Safari가 음원을 재생하지 못한다. 음원만 Worker가 직접 잘라 준다.
async function serveMusic(req, env, url) {
  if (!/^\/music\/[a-z0-9-]+\.mp3$/.test(url.pathname)) return new Response('Not found', { status: 404 });
  const res = await env.ASSETS.fetch(new Request(url.origin + url.pathname));
  if (!res.ok) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const headers = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=604800' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (!range) return new Response(req.method === 'HEAD' ? null : buf, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  let start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : size - 1;
  start = Math.max(0, start); end = Math.min(size - 1, end);
  if (!(start <= end)) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } });
  return new Response(req.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/health') return new Response('ok',{headers:{'X-Garden-Protocol':'board-v2'}});
    if (env.ASSETS && url.pathname.startsWith('/music/')) return serveMusic(req, env, url);
    const m = url.pathname.match(/^\/room\/([a-z0-9-]{6,40})$/);
    if (!m) {
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
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket only', { status: 426 });
    const origins = env.ALLOWED_ORIGINS || (env.ASSETS ? url.origin : '');
    const allowed = origins.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(req.headers.get('Origin') || '')) return new Response('origin not allowed', { status: 403 });
    // 통합 정원에서는 이전 링크를 열어도 모두 같은 공간으로 연결한다.
    const space = env.ASSETS ? 'memorygarden' : m[1];
    return env.ROOMS.get(env.ROOMS.idFromName(space)).fetch(req);
  },
};


