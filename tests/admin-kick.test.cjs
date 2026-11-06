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
 const send=(w,m)=>room.webSocketMessage(w,JSON.stringify(m));
 const hello=(w,personalCode,personalAction,extra={})=>send(w,{t:'hello',personalCode,personalAction,resumeToken:'a'.repeat(64),name:w.a.id,look,dog,s:{x:24,z:-3,p:'stand'},...extra});
 assert.equal(P.ADMIN_CODE,'99999');assert.ok(P.isAdminCode('99999'));assert.ok(!P.isAdminCode('99998'));
 // A normal visitor cannot kick anyone; the allocator never issues the admin code.
 const friend=socket(ctx,'friend');await hello(friend,'BCDE-FGHJ-KLMN-PQRS-TUVW','create');assert.equal(last(friend,'welcome').admin,0);
 const friend2=socket(ctx,'friend2');await hello(friend2,'CDEF-GHJK-LMNP-QRST-UVWX','create');
 await send(friend,{t:'kick_all'});assert.equal(friend2.a.ready,true);assert.equal(last(friend2,'kicked'),undefined);
 c.crypto={subtle:crypto.subtle,randomUUID:crypto.randomUUID,getRandomValues:array=>{array.fill(99999);return array}};
 const origin='https://garden.test',res=await c.handler.fetch(new Request(origin+'/personal/allocate',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'x'},body:JSON.stringify({request:'d'.repeat(64)})}),{ASSETS:{fetch(){throw Error('no')}},ROOMS:{idFromName:()=>'id',get:()=>({fetch:r=>room.fetch(r)})}});
 assert.equal((await res.json()).code,'00000');
 c.crypto=crypto;
 // The developer code enters as admin without a reservation, creating the profile on first use.
 const dev=socket(ctx,'dev');await hello(dev,'99999','restore');const w=last(dev,'welcome');assert.ok(w,'admin welcome');assert.equal(w.admin,1);const devId=dev.a.id;
 assert.ok(ctx.values.get('person.'+devId));
 // A friend who is away (disconnected) is also cleared.
 const sleeper=socket(ctx,'sleeper');await hello(sleeper,'DEFG-HJKL-MNPQ-RSTU-VWXY','create');const sleeperId=sleeper.a.id;await room.webSocketClose(sleeper);sleeper.readyState=3;
 assert.ok(ctx.values.get('visits')[sleeperId].peer);
 const fId=friend.a.id,f2Id=friend2.a.id;
 await send(dev,{t:'kick_all'});
 assert.equal(last(friend,'kicked').t,'kicked');assert.equal(last(friend2,'kicked').t,'kicked');assert.equal(friend.a.ready,false);assert.equal(friend2.a.ready,false);
 assert.equal(last(dev,'kick_done').count,3);assert.equal(dev.a.ready,true);assert.equal(last(dev,'kicked'),undefined);
 const visits=ctx.values.get('visits');for(const id of [fId,f2Id,sleeperId])assert.equal(visits[id].revoked,true);
 // Records are kept and the same code comes straight back.
 assert.ok(ctx.values.get('person.'+fId));const back=socket(ctx,'friend-back');await hello(back,'BCDE-FGHJ-KLMN-PQRS-TUVW','restore');assert.equal(back.a.id,fId);assert.ok(last(back,'welcome'));
 // The admin code returns to the same profile on another device.
 const dev2=socket(ctx,'dev2');await hello(dev2,'99999','restore');assert.equal(dev2.a.id,devId);assert.equal(last(dev2,'welcome').admin,1);
 console.log('PASS: developer code 99999 is admin, never issued, kick_all saves and removes everyone else (live and away), records kept and re-entry works.');
})().catch(e=>{console.error(e);process.exitCode=1});
