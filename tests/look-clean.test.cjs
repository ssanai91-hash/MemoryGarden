const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let now=1800000000000;
const c={crypto,TextEncoder,Date:class extends Date{static now(){return now}},Math,URL,Headers,Response,Request,Uint32Array};vm.createContext(c);
for(const file of ['campfire-rules','prayer-rules'])vm.runInContext(fs.readFileSync(__dirname+'/../assets/'+file+'.js','utf8'),c);
const source=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace("import '../../assets/campfire-rules.js';",'').replace("import '../../assets/prayer-rules.js';",'').replace('export class GardenRoom','class GardenRoom').replace('export default {','const handler={');vm.runInContext(source+';this.Room=GardenRoom;',c);
const values=new Map(),sockets=[],ctx={getWebSockets:()=>sockets,blockConcurrencyWhile(fn){this.ready=fn()}};
ctx.storage={async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async getAlarm(){return null},async setAlarm(){},async transaction(fn){return fn(this)}};
function socket(id){const ws={readyState:1,a:{id,ready:false},messages:[],serializeAttachment(a){this.a=structuredClone(a)},deserializeAttachment(){return structuredClone(this.a)},send(s){this.messages.push(JSON.parse(s))},close(){this.readyState=3}};sockets.push(ws);return ws}
const last=(ws,t)=>ws.messages.filter(m=>m.t===t).at(-1),look={skin:1,hair:2,shirt:3,pants:4,shoe:5};
(async()=>{
 const room=new c.Room(ctx,{});await ctx.ready;const observer=socket('observer'),owner=socket('owner'),friend=socket('friend'),jeongin=socket('jeongin'),send=(ws,m)=>room.webSocketMessage(ws,JSON.stringify(m));
 await send(observer,{t:'hello',name:'관찰자',look});await send(owner,{t:'hello',name:'숭열',look});
 assert.equal(room.visiblePeers('observer').find(p=>p.id==='owner').look.px,undefined);
 // Special name-bound pixel sprites were removed: no name or forged field yields a px look.
 assert.equal(owner.a.look.px,undefined);assert.equal(last(observer,'join').peer.look.px,undefined);
 await send(jeongin,{t:'hello',name:'정인',look:{...look,px:'jeongin'}});assert.equal(jeongin.a.look.px,undefined);assert.equal(last(observer,'join').peer.look.px,undefined);
 await send(friend,{t:'hello',name:'친구',look:{...look,px:'soongyeol'}});assert.equal(friend.a.look.px,undefined);assert.ok(last(friend,'welcome').peers.every(p=>p.look?.px===undefined));
 now+=3000;await send(owner,{t:'profile',name:'숭열',look:{...look,px:'soongyeol'}});assert.equal(owner.a.look.px,undefined);assert.equal(last(observer,'profile').look.px,undefined);
 console.log('PASS: every visitor uses the shared 3D character; name-bound and forged pixel looks are never stored or relayed.');
})().catch(e=>{console.error(e);process.exitCode=1});
