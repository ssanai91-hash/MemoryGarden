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
 assert.equal(owner.a.look.px,'soongyeol');assert.equal(last(observer,'join').peer.look.px,'soongyeol');
 await send(jeongin,{t:'hello',name:'정인',look:{...look,px:'soongyeol'}});assert.equal(jeongin.a.look.px,'jeongin');assert.equal(last(observer,'join').peer.look.px,'jeongin');
 await send(friend,{t:'hello',name:'친구',look:{...look,px:'soongyeol'}});assert.equal(friend.a.look.px,undefined);assert.equal(last(friend,'welcome').peers.find(p=>p.name==='숭열').look.px,'soongyeol');
 now+=3000;await send(owner,{t:'profile',name:'다른 이름',look:{...look,px:'soongyeol'}});assert.equal(owner.a.look.px,undefined);assert.equal(last(observer,'profile').look.px,undefined);
 now+=3000;await send(owner,{t:'profile',name:'숭열',look:null});assert.equal(last(observer,'profile').look.px,'soongyeol');
 assert.equal(room.visiblePeers('observer').find(p=>p.id==='owner').look.px,'soongyeol');
 assert.equal(last(friend,'welcome').peers.find(p=>p.name==='정인').look.px,'jeongin');now+=3000;await send(owner,{t:'profile',name:'정인',look:null});assert.equal(last(observer,'profile').look.px,'jeongin');now+=3000;await send(owner,{t:'profile',name:'숭열',look:null});assert.equal(last(observer,'profile').look.px,'soongyeol');
 now+=3000;await send(jeongin,{t:'profile',name:'정인님',look:{...look,px:'jeongin'}});assert.equal(last(observer,'profile').look.px,undefined);
 console.log('PASS: server hello/welcome/join/profile and observer snapshots bind 숭열/정인 to distinct sprites; forged IDs rejected; exact-name matching and rename between both characters/3D work even with an invalid look.');
})().catch(e=>{console.error(e);process.exitCode=1});
