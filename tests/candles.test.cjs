const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let now=Date.UTC(2026,10,2,9);const c={crypto,TextEncoder,Date:class extends Date{static now(){return now}},URL,Headers,Request,Response,Uint32Array};vm.createContext(c);
for(const file of ['campfire-rules.js','prayer-rules.js'])vm.runInContext(fs.readFileSync(__dirname+'/../assets/'+file,'utf8'),c);
const source=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace(/import '\.\.\/\.\.\/assets\/(campfire|prayer)-rules\.js';/g,'').replace('export class GardenRoom','class GardenRoom').replace('export default {','const handler={');vm.runInContext(source+';this.Room=GardenRoom;',c);
function context(){const values=new Map(),sockets=[];let tail=Promise.resolve();const ctx={values,sockets,fail:false,alarm:null,getWebSockets:()=>sockets,blockConcurrencyWhile(fn){this.ready=fn()}};
 ctx.storage={async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async getAlarm(){return ctx.alarm},async setAlarm(at){ctx.alarm=at},async deleteAlarm(){ctx.alarm=null},async transaction(fn){const task=tail.then(async()=>{const copy=new Map(structuredClone([...values])),txn={async get(k){return structuredClone(copy.get(k))},async put(k,v){if(ctx.fail)throw Error('storage');copy.set(k,structuredClone(v))}};const r=await fn(txn);values.clear();for(const[k,v]of copy)values.set(k,v);return r});tail=task.catch(()=>{});return task}};return ctx}
function socket(ctx,id,ready=true){const w={readyState:1,a:{id,name:'방문자 '+id,ready,s:{space:'garden',x:29.2,z:-6,p:'stand'}},messages:[],serializeAttachment(a){this.a=structuredClone(a)},deserializeAttachment(){return structuredClone(this.a)},send(s){this.messages.push(JSON.parse(s))}};ctx.sockets.push(w);return w}
const last=(s,t)=>s.messages.filter(m=>m.t===t).at(-1),nonce=i=>i.toString(16).padStart(32,'0');
(async()=>{
 const ctx=context();let room=new c.Room(ctx,{});await ctx.ready;const a=socket(ctx,'a'),b=socket(ctx,'b'),guest=socket(ctx,'guest',false);
 const send=(w,m)=>room.webSocketMessage(w,JSON.stringify(m)),light=(w,i,other={})=>send(w,{t:'candle_light',nonce:nonce(i),issuedAt:now,name:'아버지',wish:'건강하고 평안하세요.\n항상 함께해요.',createdAt:0,expiresAt:now+1,litBy:'가짜',...other});
 await light(guest,1);assert.equal(ctx.values.has('prayerCandles'),false);
 a.a.s.x=0;await light(a,1);assert.equal(last(a,'candle_error').code,'far');a.a.s.x=29.2;
 a.a.s.space='listening';await light(a,1);assert.equal(last(a,'candle_error').code,'far');a.a.s.space='garden';
 await light(a,1,{name:' ',wish:' '});assert.equal(last(a,'candle_error').code,'invalid');now+=2000;
 await light(a,1,{wish:'x'.repeat(161)});assert.equal(last(a,'candle_error').code,'invalid');
 await light(a,1,{issuedAt:now-300001});assert.equal(last(a,'candle_error').code,'stale');
 await light(a,1);let lit=last(a,'candle_lit');assert.equal(lit.candle.createdAt,now);assert.equal(lit.candle.expiresAt,now+86400000);assert.equal(lit.candle.litBy,'방문자 a');assert.ok(lit.candle.wish.includes('\n'));assert.equal(lit.candle.slot,0);assert.equal(ctx.values.get('prayerCandles').items.length,1);assert.equal(last(b,'candles_state').state.items.length,1);assert.equal(ctx.alarm,lit.candle.expiresAt);
 assert.ok(!Object.hasOwn(lit.candle,'nonce')&&!Object.hasOwn(lit.candle,'by'));const created=lit.candle.createdAt,expiry=lit.candle.expiresAt,id=lit.candle.id;
 now+=2000;await light(a,1,{name:'바뀐 이름',wish:'재시도로 바꾸지 않기'});lit=last(a,'candle_lit');assert.equal(lit.candle.id,id);assert.equal(lit.candle.createdAt,created);assert.equal(lit.candle.expiresAt,expiry);assert.equal(lit.candle.name,'아버지');
 room=new c.Room(ctx,{});await ctx.ready;await send(b,{t:'candles_sync'});assert.equal(last(b,'candles_state').state.items[0].id,id);
 now+=2000;await Promise.all([light(a,2),light(a,2),light(b,2)]);const stored=ctx.values.get('prayerCandles');assert.equal(stored.items.length,3);assert.equal(new Set(stored.items.map(c=>c.slot)).size,3);
 now+=2000;ctx.fail=true;const broadcasts=b.messages.length;await light(a,3);assert.equal(last(a,'candle_error').code,'storage');assert.equal(ctx.values.get('prayerCandles').items.length,3);assert.equal(b.messages.length,broadcasts);
 ctx.fail=false;await light(a,3);assert.equal(ctx.values.get('prayerCandles').items.length,4);
 // A garden day is 24 minutes, but candles use 24 real hours and survive disconnect/wake.
 now=created+24*60000;await send(b,{t:'candles_sync'});assert.ok(last(b,'candles_state').state.items.some(c=>c.id===id));
 now=expiry;await room.alarm();assert.ok(!ctx.values.get('prayerCandles').items.some(c=>c.id===id));assert.ok(!last(b,'candles_state').state.items.some(c=>c.id===id));
 now+=2000;await light(a,1,{issuedAt:created});assert.equal(last(a,'candle_error').code,'stale');
 await light(a,4);assert.equal(last(a,'candle_lit').candle.slot,0);
 const full=ctx.values.get('prayerCandles');full.items=Array.from({length:20},(_,slot)=>({...full.items[0],slot,id:nonce(slot+100),by:'full',nonce:nonce(slot+100),expiresAt:now+100000}));ctx.values.set('prayerCandles',full);room=new c.Room(ctx,{});await ctx.ready;now+=2000;
 await light(a,50);assert.equal(last(a,'candle_error').code,'full');assert.equal(ctx.values.get('prayerCandles').items.length,20);
 console.log('PASS: joined/proximity/space gates, server-authoritative 24 real hours, nonce idempotency, immutable wishes/timestamps on retry, hibernation, concurrent slot allocation, atomic rollback/retry, expiry alarm, stale retries, slot reuse, private metadata and capacity.');
})().catch(e=>{console.error(e);process.exitCode=1});
