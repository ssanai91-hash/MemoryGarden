const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let now=1793620000000;
const c={crypto,TextEncoder,URL,Headers,Response,Request,Uint32Array,Date:class extends Date{static now(){return now}}};vm.createContext(c);
vm.runInContext(fs.readFileSync(__dirname+'/../assets/campfire-rules.js','utf8'),c);vm.runInContext(fs.readFileSync(__dirname+'/../assets/prayer-rules.js','utf8'),c);
const Fire=c.GardenCampfire;
let source=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace("import '../../assets/campfire-rules.js';",'').replace("import '../../assets/prayer-rules.js';",'').replace('export class GardenRoom','class GardenRoom').replace('export default {','const handler={');
vm.runInContext(source+'\nthis.Room=GardenRoom;',c);
function context(){
 const values=new Map(),sockets=[];let tail=Promise.resolve();const ctx={values,sockets,fail:false,getWebSockets:()=>sockets,blockConcurrencyWhile(fn){this.ready=fn()}};
 ctx.storage={async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async getAlarm(){return null},async setAlarm(){},async transaction(fn){const result=tail.then(async()=>{
   const copy=new Map(structuredClone([...values]));const tx={async get(k){return structuredClone(copy.get(k))},async put(k,v){if(ctx.fail)throw Error('storage');copy.set(k,structuredClone(v))}};
   const value=await fn(tx);values.clear();for(const [k,v]of copy)values.set(k,v);return value;
 });tail=result.catch(()=>{});return result}};return ctx;
}
function socket(ctx,id,name,ready=true){const ws={readyState:1,a:{id,name,ready,s:{space:'garden',x:5.9,z:0,h:0,p:'stand'}},messages:[],serializeAttachment(a){this.a=structuredClone(a)},deserializeAttachment(){return structuredClone(this.a)},send(m){this.messages.push(JSON.parse(m))}};ctx.sockets.push(ws);return ws}
const last=(ws,t)=>ws.messages.filter(m=>m.t===t).at(-1);
let nonce=0;const request=()=> (++nonce).toString(16).padStart(32,'0');
(async()=>{
 // The same pure rules run on both sides. Clock speed never enters this state.
 const initial=Fire.initial(now);assert.equal(Fire.frame(initial,now).left,4*3600000);
 const stages=[[0,'bright'],[3.5*3600000,'low'],[4*3600000-120000,'embers'],[4*3600000,'out']];
 for(const [elapsed,stage]of stages)assert.equal(Fire.frame(initial,now+elapsed).stage,stage);
 assert.equal(Fire.frame(initial,now+5*3600000).heat,0);assert.equal(Fire.frame(initial,now+5*3600000).flame,0);
 let power=2;for(let minute=0;minute<=720;minute++){const f=Fire.frame({fuelUntil:now+Fire.MAX_MS},now+minute*60000);assert.ok(f.flame<=power);power=f.flame}
 const ctx=context();let room=new c.Room(ctx,{});await ctx.ready;
 const a=socket(ctx,'A','숭열'),b=socket(ctx,'B','현주'),unready=socket(ctx,'X','입장 전',false);
 const send=(ws,m)=>room.webSocketMessage(ws,JSON.stringify(m));
 const state=async(ws,x,z,p='stand',space='garden')=>send(ws,{t:'state',s:{space,x,z,h:0,p}});
 const begin=async(ws,count=1)=>{now+=2000;await state(ws,5.9,0);await send(ws,{t:'fire_begin',request:request(),count});return last(ws,'fire_ready').token};
 const deposit=async(ws,token)=>{now+=3000;await state(ws,3.1,0,'woodfeed');await send(ws,{t:'fire_add',token,name:'가짜 이름',fuelUntil:now+999999999})};
 const before=ctx.values.get('campfire').fuelUntil;
 await send(unready,{t:'fire_begin',request:request()});assert.equal(last(unready,'fire_ready'),undefined);
 await state(a,20,0);await send(a,{t:'fire_begin',request:request()});assert.equal(last(a,'fire_error').code,'pile');
 now+=2000;await state(a,5.9,0,'stand','listening');await send(a,{t:'fire_begin',request:request()});assert.equal(last(a,'fire_error').code,'space');
 let token=await begin(a);await send(a,{t:'fire_add',token});assert.equal(last(a,'fire_error').code,'early');
 now+=3000;await send(a,{t:'fire_add',token});assert.equal(last(a,'fire_error').code,'fire');
 await state(a,3.1,0,'woodfeed');await send(a,{t:'fire_add',token,name:'가짜 이름'});
 let saved=ctx.values.get('campfire');assert.equal(saved.fuelUntil,before+Fire.LOG_MS);assert.equal(saved.rev,1);assert.equal(saved.last.name,'숭열');assert.equal(saved.last.kind,'added');
 assert.equal(last(b,'fire_state').fire.rev,1);assert.ok(!Object.hasOwn(last(b,'fire_state').fire,'recent'));assert.equal(a.a.fireCarry,undefined);
 await send(a,{t:'fire_add',token});assert.equal(ctx.values.get('campfire').rev,1);
 now+=2000;await state(a,5.9,0);await send(a,{t:'fire_begin',request:request()});assert.equal(last(a,'fire_error').code,'cooldown');
 // Cancel and expiration cannot leave delayed fuel behind.
 token=await begin(b);await send(b,{t:'fire_cancel',request:b.a.fireCarry.request});await deposit(b,token);assert.equal(last(b,'fire_error').code,'expired');assert.equal(ctx.values.get('campfire').rev,1);
 token=await begin(b);now+=46000;await deposit(b,token);assert.equal(last(b,'fire_error').code,'expired');
 token=await begin(b);await send(b,{t:'background'});await deposit(b,token);assert.equal(last(b,'fire_error').code,'space');assert.equal(b.a.fireCarry,undefined);await send(b,{t:'foreground'});
 // Two friends adding concurrently retain both logs and a retry cannot count twice.
 now+=Fire.COOLDOWN_MS;const ta=await begin(a),tb=await begin(b);now+=3000;
 await state(a,3.1,0,'woodfeed');await state(b,3.1,0,'woodfeed');const fuelBefore=ctx.values.get('campfire').fuelUntil;
 await Promise.all([send(a,{t:'fire_add',token:ta}),send(b,{t:'fire_add',token:tb}),send(a,{t:'fire_add',token:ta})]);
 saved=ctx.values.get('campfire');assert.equal(saved.rev,3);assert.equal(saved.fuelUntil,fuelBefore+Fire.LOG_MS*2);
 // Storage errors roll back and leave the same action eligible for retry.
 now+=Fire.LOG_MS+Fire.COOLDOWN_MS;token=await begin(a);ctx.fail=true;await deposit(a,token);assert.equal(last(a,'fire_error').code,'storage');assert.equal(ctx.values.get('campfire').rev,3);
 ctx.fail=false;now+=2000;await send(a,{t:'fire_add',token});assert.equal(ctx.values.get('campfire').rev,4);
 // Absence and object restart do not refill the fire. The last caretaker survives.
 saved=ctx.values.get('campfire');now=saved.fuelUntil+1000;room=new c.Room(ctx,{});await ctx.ready;
 assert.equal(Fire.frame(room.campfire,now).stage,'out');assert.equal(room.campfire.last.name,'숭열');
 token=await begin(b);await deposit(b,token);saved=ctx.values.get('campfire');assert.equal(saved.last.kind,'relit');assert.equal(saved.last.name,'현주');assert.equal(saved.fuelUntil,now+Fire.LOG_MS);
 // Welcome exposes durable last care and no private action receipts.
 const newcomer=socket(ctx,'C','다음 친구',false);await send(newcomer,{t:'hello',name:'다음 친구',s:{x:0,z:14,p:'woodcarry'}});
 assert.equal(last(newcomer,'welcome').features.campfire,1);assert.equal(last(newcomer,'welcome').shared.campfire.last.name,'현주');assert.ok(!Object.hasOwn(last(newcomer,'welcome').shared.campfire,'recent'));assert.equal(newcomer.a.s.p,'stand');
 now+=Fire.COOLDOWN_MS;room.campfire.fuelUntil=now+Fire.MAX_MS;ctx.values.set('campfire',structuredClone(room.campfire));await state(a,5.9,0);await send(a,{t:'fire_begin',request:request()});assert.equal(last(a,'fire_error').code,'full');
 // Full capacity also holds if others add while this person is carrying.
 room.campfire.fuelUntil=now+Fire.MAX_MS-Fire.LOG_MS*2;ctx.values.set('campfire',structuredClone(room.campfire));token=await begin(a);
 const filled=Fire.add(room.campfire,now,{id:'other',name:'친구'},'other',2);room.campfire=filled;ctx.values.set('campfire',structuredClone(filled));await deposit(a,token);assert.equal(last(a,'fire_error').code,'full');assert.equal(Fire.frame(ctx.values.get('campfire'),now).logs,5);
 // Batch count is server-validated and one concurrent batch cannot overfill another.
 now+=Fire.COOLDOWN_MS;room.campfire={...Fire.initial(now),fuelUntil:now};ctx.values.set('campfire',structuredClone(room.campfire));
 const a3=await begin(a,3),b3=await begin(b,3);assert.equal(last(a,'fire_ready').count,3);assert.equal(last(b,'fire_ready').count,3);now+=3000;await state(a,3.1,0,'woodfeed');await state(b,3.1,0,'woodfeed');assert.equal(a.a.s.wc,3);
 await Promise.all([send(a,{t:'fire_add',token:a3}),send(b,{t:'fire_add',token:b3})]);assert.equal(Fire.frame(room.campfire,now).logs,3);assert.equal(last(b,'fire_error').code,'full');assert.equal(room.campfire.last.count,3);
 const b2=await begin(b,2);await deposit(b,b2);assert.equal(Fire.frame(room.campfire,now).logs,5);assert.equal(room.campfire.last.count,2);const revision=room.campfire.rev;await send(b,{t:'fire_add',token:b2,count:999});assert.equal(room.campfire.rev,revision);
 now+=2000;await state(a,5.9,0);await send(a,{t:'fire_begin',request:request(),count:6});assert.equal(last(a,'fire_error').code,'invalid');
 // Legacy six-log fuel is clipped to the new five-log ceiling at wake, without losing last care.
 const legacy={...room.campfire,fuelUntil:now+Fire.LOG_MS*6};ctx.values.set('campfire',legacy);room=new c.Room(ctx,{});await ctx.ready;assert.equal(room.campfire.fuelUntil,now+Fire.MAX_MS);assert.equal(room.campfire.last.name,'현주');
 await send(a,{t:'stoke'});assert.equal(last(a,'fire_error').code,'refresh');
 console.log('PASS: real-time burn/embers/out, gradual fuel intensity, shared durable fuel, proximity/pose/timing gates, actor identity, validated 1–5 log batches / five-log capacity, cooldown, cancellation/background/expiry, idempotent concurrent adds, storage rollback/retry, restart without refilling, relighting and newcomer last-care text.');
})().catch(e=>{console.error(e);process.exitCode=1});
