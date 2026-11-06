const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let now=1800000000000;
const c={crypto,TextEncoder,Date:class extends Date{static now(){return now}},Math,URL,Headers,Response,Request,Uint32Array};vm.createContext(c);
for(const file of ['campfire-rules','prayer-rules'])vm.runInContext(fs.readFileSync(__dirname+'/../assets/'+file+'.js','utf8'),c);
const worker=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace("import '../../assets/campfire-rules.js';",'').replace("import '../../assets/prayer-rules.js';",'').replace('export class GardenRoom','class GardenRoom').replace('export default {','const handler={');vm.runInContext(worker+';this.Room=GardenRoom;this.handler=handler;',c);
function context(){const values=new Map(),sockets=[];let tail=Promise.resolve();const ctx={values,sockets,fail:false,alarm:null,getWebSockets:()=>sockets,blockConcurrencyWhile(fn){this.ready=fn()}};ctx.storage={async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async getAlarm(){return ctx.alarm},async setAlarm(at){ctx.alarm=at},async deleteAlarm(){ctx.alarm=null},async transaction(fn){const task=tail.then(async()=>{const copy=new Map(structuredClone([...values])),tx={async get(k){return structuredClone(copy.get(k))},async put(k,v){if(ctx.fail&&(k.startsWith('person.')||k.startsWith('personal.code.')))throw Error('disk');copy.set(k,structuredClone(v))}};const result=await fn(tx);values.clear();for(const[k,v]of copy)values.set(k,v);return result});tail=task.catch(()=>{});return task}};return ctx}
function socket(ctx,id,ready=false){const ws={readyState:1,a:{id,name:'같은 이름',ready,s:{space:'garden',x:24,z:-3,h:Math.PI,p:'stand'}},messages:[],deserializeAttachment(){return structuredClone(this.a)},serializeAttachment(a){this.a=structuredClone(a)},send(m){this.messages.push(JSON.parse(m))},close(){this.readyState=3}};ctx.sockets.push(ws);return ws}
const last=(w,t)=>w.messages.filter(m=>m.t===t).at(-1),look={skin:1,hair:2,shirt:3,pants:4,shoe:5},dog={b:3,coat:2,n:'콩이'};
let serial=0;const nonce=()=> (++serial).toString(16).padStart(32,'0');
(async()=>{
 const P=c.GardenPrayer,ctx=context();let room=new c.Room(ctx,{});await ctx.ready;
 const send=(w,m)=>room.webSocketMessage(w,JSON.stringify(m)),code='ABCD-EFGH-JKLM-NPQR-STUV',hello=(w,personalCode=code,personalAction='restore',resumeToken='a'.repeat(64))=>send(w,{t:'hello',personalCode,personalAction,resumeToken,name:'같은 이름',look,dog,s:{x:24,z:-3,p:'stand',haloUntil:now+7*86400000,haloLevel:2}});
 const observer=socket(ctx,'observer',true),a=socket(ctx,'phone');await hello(a,code,'create');assert.ok(last(a,'welcome'));const id=a.a.id,key='person.'+id;
 assert.equal(last(a,'welcome').features.personal,1);assert.equal(ctx.values.get(key).totalBows,0);assert.equal(last(a,'welcome').personal.halos.redUntil,0);
 assert.ok(!JSON.stringify(observer.messages).includes(code));assert.ok(!JSON.stringify([...ctx.values]).includes(code));assert.ok(!JSON.stringify(observer.messages).includes(ctx.values.get(key).codeHash));
 // Incoming local counts and claimed reward dates cannot advance a profile.
 let request=nonce();await send(a,{t:'bow_start',request,mode:'auto',target:108,count:107});assert.equal(room.bows[id].count,0);
 now+=16000;await send(a,{t:'bow_control',id:request,action:'stop'});let p=ctx.values.get(key);assert.equal(p.progress[108],2);assert.equal(p.totalBows,2);assert.equal(p.completed[108],0);
 request=nonce();await send(a,{t:'bow_start',request,mode:'auto',target:3000,count:2999});assert.equal(room.bows[id].count,0);const at=now,end=at+3000*8000;
 now=at+108*8000;assert.equal(P.bowProgress(room.bows[id],now).haloLevel,0);
 await room.webSocketClose(a);now=end+60000;room=new c.Room(ctx,{});await ctx.ready;await room.alarm();p=ctx.values.get(key);
 assert.equal(p.totalBows,3002);assert.equal(p.progress[3000],3000);assert.equal(p.completed[3000],1);assert.equal(p.highestHalo,2);assert.equal(p.halos.redUntil,end+7*86400000);
 const redUntil=p.halos.redUntil,b=socket(ctx,'pc');await hello(b);assert.equal(b.a.id,id);assert.equal(last(b,'welcome').personal.progress[3000],3000);assert.deepEqual(last(b,'welcome').personal.dog,dog);
 assert.equal(last(b,'welcome').personal.halos.redUntil,redUntil);assert.equal(last(b,'welcome').bow.haloLevel,2);
 // Finishing 108 while red is active adds a white reward without downgrading red.
 request=nonce();await send(b,{t:'bow_start',request,mode:'auto',target:108,count:0});assert.equal(room.bows[id].count,2);const whiteEnd=now+106*8000;now=whiteEnd+1;await room.alarm();p=ctx.values.get(key);
 assert.equal(p.totalBows,3108);assert.equal(p.completed[108],1);assert.equal(p.halos.whiteUntil,whiteEnd+3*86400000);assert.equal(p.halos.redUntil,redUntil);assert.equal(room.peerInfo(b.a).s.haloLevel,2);
 // Replayed finish/control and counter reset never renew a reward or erase totals.
 const totals=p.totalBows;now+=2000;await send(b,{t:'bow_start',request,mode:'auto',target:108,count:108});assert.equal(ctx.values.get(key).totalBows,totals);assert.equal(ctx.values.get(key).completed[108],1);
 await send(b,{t:'bow_control',id:request,action:'reset'});p=ctx.values.get(key);assert.equal(p.progress[108],0);assert.equal(p.totalBows,totals);assert.equal(p.halos.redUntil,redUntil);
 // Newest device takes over the same profile; same-named different code stays separate.
 const oldSession=b.a.personalSession,d=socket(ctx,'tablet');await hello(d);assert.equal(last(b,'replaced').t,'replaced');assert.equal(d.a.id,id);const currentJob=structuredClone(room.bows[id]);await room.editBow(id,job=>({...job,count:99}),oldSession);assert.deepEqual(room.bows[id],currentJob);
 const secondCode='2345-6789-ABCD-EFGH-JKLM',other=socket(ctx,'different');await hello(other,secondCode,'create','b'.repeat(64));assert.notEqual(other.a.id,id);assert.equal(last(other,'welcome').personal.totalBows,0);assert.ok(room.visiblePeers('observer').some(p=>p.id===id));
 await send(d,{t:'leave'});assert.equal(ctx.values.get('visits')[id].revoked,true);assert.ok(ctx.values.get(key));
 // Even after operational jobs and visits expire, permanent data stays intact.
 now+=10*86400000;await room.alarm();assert.equal(room.bows[id],undefined);assert.equal(ctx.values.get(key).totalBows,totals);
 room=new c.Room(ctx,{});await ctx.ready;const back=socket(ctx,'return');await hello(back);assert.ok(last(back,'welcome'));p=last(back,'welcome').personal;
 assert.equal(p.totalBows,totals);assert.equal(p.progress[108],0);assert.equal(p.progress[3000],3000);assert.equal(p.highestHalo,2);assert.equal(p.halos.redUntil,0);assert.equal(p.halos.whiteUntil,0);
 now+=2000;await send(back,{t:'state',s:{x:24,z:-3,p:'stand',haloUntil:now+7*86400000,haloLevel:2,halos:{redUntil:now+7*86400000}}});assert.equal(back.a.s.haloUntil,0);
 const missing=socket(ctx,'typo');await hello(missing,'ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ');assert.equal(last(missing,'personal_error').code,'missing');
 const before=structuredClone(ctx.values.get(key));ctx.fail=true;now+=2000;await send(back,{t:'bow_start',request:nonce(),mode:'auto',target:108,count:108});assert.equal(last(back,'bow_error').code,'storage');assert.deepEqual(ctx.values.get(key),before);ctx.fail=false;
 // First registration claims an existing server job once, without trusting local imports.
 const guest=socket(ctx,'guest');await send(guest,{t:'hello',resumeToken:'c'.repeat(64),name:'이전 방문자',look,dog,s:{x:24,z:-3}});const legacyId=guest.a.id;
 request=nonce();await send(guest,{t:'bow_start',request,mode:'auto',target:108,count:37});now+=16000;await send(guest,{t:'bow_control',id:request,action:'stop'});
 const migrated=socket(ctx,'migration');await hello(migrated,'MMMM-NNNN-PPPP-QQQQ-RRRR','create','c'.repeat(64));assert.equal(last(migrated,'welcome').personal.progress[108],39);assert.equal(last(migrated,'welcome').personal.totalBows,39);assert.equal(last(guest,'replaced').t,'replaced');assert.equal(room.bows[legacyId],undefined);
 const again=socket(ctx,'no-double-import');await hello(again,'SSSS-TTTT-UUUU-VVVV-WWWW','create','c'.repeat(64));assert.equal(last(again,'welcome').personal.totalBows,0);
 // Atomic five-digit issuer: forced random collisions, retries and leading zeros.
 c.crypto={subtle:crypto.subtle,randomUUID:crypto.randomUUID,getRandomValues:array=>{array.fill(42);return array}};
 const origin='https://garden.test',allocate=(request,ip='issuer')=>c.handler.fetch(new Request(origin+'/personal/allocate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify({request})}),{ASSETS:{fetch(){throw Error('allocation must reach worker')}},ROOMS:{idFromName:name=>name,get(){return{fetch:req=>room.fetch(req)}}}});
 const requestA='d'.repeat(64),requestB='e'.repeat(64),responses=await Promise.all([allocate(requestA),allocate(requestB)]),codes=await Promise.all(responses.map(r=>r.json()));
 // Hashing may finish in either order; each request must retain its own code.
 const [codeA,codeB]=codes.map(r=>r.code);assert.deepEqual([codeA,codeB].sort(),['00042','00043']);assert.equal((await(await allocate(requestA)).json()).code,codeA);assert.ok(ctx.values.get('personal.code.pool')[42>>3]&(1<<(42&7)));
 // Profile preview accepts the same credentials but never creates a visit or replaces a live socket.
 const preview=(body,ip='preview')=>c.handler.fetch(new Request(origin+'/personal/profile',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)}),{ROOMS:{idFromName:name=>name,get(){return{fetch:req=>room.fetch(req)}}}});
 const beforePending=structuredClone([...ctx.values]);assert.equal((await(await preview({personalCode:codeA,personalAction:'create',personalRegistration:requestA})).json()).pending,true);assert.deepEqual([...ctx.values],beforePending);
 assert.equal((await preview({personalCode:codeA,personalAction:'create',personalRegistration:'f'.repeat(64)},'bad-preview')).status,403);
 assert.equal((await preview({personalCode:'76543',personalAction:'restore'},'missing-preview')).status,404);
 const bad=socket(ctx,'claim-forgery');await send(bad,{t:'hello',personalCode:codeA,personalAction:'create',personalRegistration:'f'.repeat(64),name:'새 방문자',look,dog,s:{x:0,z:14}});assert.equal(last(bad,'personal_error').code,'code');
 const five=socket(ctx,'five');await send(five,{t:'hello',personalCode:codeA,personalAction:'create',personalRegistration:requestA,name:'새 방문자',look,dog,s:{x:0,z:14}});assert.ok(last(five,'welcome'));const fiveId=five.a.id;assert.equal(last(five,'welcome').personal.name,'새 방문자');
 const ret=socket(ctx,'five-return');await send(ret,{t:'hello',personalCode:codeA,personalAction:'restore',name:'틀린 로컬 이름',s:{x:0,z:14}});assert.equal(ret.a.id,fiveId);assert.equal(last(ret,'welcome').personal.name,'새 방문자');assert.deepEqual(last(ret,'welcome').personal.dog,dog);
 const activeCount=ctx.sockets.filter(w=>w.readyState===1).length,storedBefore=structuredClone([...ctx.values]),messagesBefore=ctx.sockets.map(w=>w.messages.length);
 const read=await preview({personalCode:codeA,personalAction:'restore'},'saved-preview'),info=await read.json();assert.equal(read.headers.get('Cache-Control'),'no-store');assert.equal(info.personal.name,'새 방문자');assert.deepEqual([...ctx.values],storedBefore);assert.deepEqual(ctx.sockets.map(w=>w.messages.length),messagesBefore);assert.equal(ctx.sockets.filter(w=>w.readyState===1).length,activeCount);
 const changed=socket(ctx,'edited-entry');await send(changed,{t:'hello',personalCode:codeA,personalAction:'restore',personalUpdate:true,name:'변경한 별칭',look:{...look,gender:'female'},dog:{kind:'cat',b:2,coat:3},s:{x:0,z:14}});assert.equal(last(changed,'welcome').personal.name,'변경한 별칭');assert.equal(last(changed,'welcome').personal.look.gender,'female');assert.equal(last(changed,'welcome').personal.dog.kind,'cat');assert.equal(last(changed,'welcome').personal.totalBows,0);
 console.log('PASS: pre-entry read-only profile/pending reservation, no visit/takeover/counter mutations, missing/forged-code rejection and explicit edited-profile join.');
 const bitmap=structuredClone(ctx.values.get('personal.code.pool'));ctx.fail=true;assert.equal((await allocate('1'.repeat(64),'fail')).status,503);assert.deepEqual(ctx.values.get('personal.code.pool'),bitmap);ctx.fail=false;
 ctx.values.set('personal.code.pool',new Uint8Array(12500).fill(255));const full=await allocate('2'.repeat(64),'full');assert.equal(full.status,503);assert.equal((await full.json()).error,'full');assert.equal((await(await allocate(requestA,'full')).json()).code,codeA);ctx.values.set('personal.code.pool',bitmap);
 room=new c.Room(ctx,{});await ctx.ready;assert.equal((await(await allocate(requestB,'restart')).json()).code,codeB);assert.equal(P.validCode(42),false);assert.equal(P.validCode('00042'),true);assert.equal(P.formatCode('00042'),'00042');
 console.log('PASS: 5-digit transactional reservations, concurrent collision avoidance, request retry/restart idempotency, claim isolation, zero-preserving restore, capacity exhaustion, storage rollback and same-origin worker route.');
 console.log('PASS: permanent private code identity; server-only counters; exact real 3/7-day rewards; red priority; cumulative/reset/replay isolation; phone/PC takeover; same-name separation; leave and 10-day restore; hashed secret privacy; transactional rollback; one-time legacy migration.');
})().catch(e=>{console.error(e);process.exitCode=1});
