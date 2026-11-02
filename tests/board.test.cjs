const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
let now=1793536000000;
const code=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8').replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject{constructor(ctx){this.ctx=ctx}}').replace('export class GardenRoom','class GardenRoom').replace('export default {','const handler={')+'\nglobalThis.Room=GardenRoom;';
const c={crypto,TextEncoder,Date:class extends Date{static now(){return now}},URL,Headers,Response,Request,Uint32Array};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../assets/campfire-rules.js','utf8'),c);vm.runInContext(code.replace("import '../../assets/campfire-rules.js';",''),c);
function context(){
 const values=new Map(),sockets=[];let tail=Promise.resolve();const ctx={values,sockets,fail:false,getWebSockets:()=>sockets,blockConcurrencyWhile(fn){this.ready=fn()}};
 ctx.storage={async get(k){return structuredClone(values.get(k))},async put(k,v){values.set(k,structuredClone(v))},async getAlarm(){return null},async setAlarm(){},async transaction(fn){const run=tail.then(async()=>{const copy=new Map(structuredClone([...values])),txn={async get(k){return structuredClone(copy.get(k))},async put(k,v){copy.set(k,structuredClone(v));if(ctx.fail&&k==='boardIndex')throw Error('disk failure')}};const result=await fn(txn);values.clear();for(const [k,v]of copy)values.set(k,v);return result});tail=run.catch(()=>{});return run}};return ctx;
}
const socket=(ctx,id,name,ready=true)=>{const ws={readyState:1,a:{id,name,ready},messages:[],serializeAttachment(a){this.a=structuredClone(a)},deserializeAttachment(){return structuredClone(this.a)},send(s){this.messages.push(JSON.parse(s))}};ctx.sockets.push(ws);return ws};
const last=(w,t)=>w.messages.filter(m=>m.t===t).at(-1);
(async()=>{
 const ctx=context();let room=new c.Room(ctx,{});await ctx.ready;
 const a=socket(ctx,'A','숭열'),b=socket(ctx,'B','친구'),unready=socket(ctx,'X','입장 전',false);
 const send=(w,m)=>room.webSocketMessage(w,JSON.stringify(m));
 await send(unready,{t:'board_post',nonce:'f'.repeat(32),to:'친구',body:'입장 전 글'});assert.equal(ctx.values.has('boardIndex'),false);
 await send(a,{t:'board_list',request:'empty',page:0});assert.equal(last(a,'board_page').total,0);
 await send(a,{t:'board_post',nonce:'1'.repeat(32),to:'정인',body:'오늘도 수고했어.\n포차 앞에서 만나자!',from:'가짜 작성자'});
 const posted=last(a,'board_posted'),id=posted.note.id;assert.equal(posted.note.from,'숭열');assert.equal(posted.note.at,now);assert.ok(posted.note.body.includes('\n'));assert.equal(last(b,'board_changed').total,1);assert.equal(ctx.values.get('board.note.'+id).body,posted.note.body);
 const changed=b.messages.filter(m=>m.t==='board_changed').length;
 await send(a,{t:'board_post',nonce:'1'.repeat(32),to:'정인',body:'내용을 바꾼 재시도'});assert.equal(last(a,'board_posted').note.id,id);assert.equal(last(a,'board_posted').note.body,posted.note.body);assert.equal(ctx.values.get('boardIndex').length,1);assert.equal(b.messages.filter(m=>m.t==='board_changed').length,changed);
 now+=2000;await send(a,{t:'board_post',nonce:'2'.repeat(32),to:'정인',body:'   \u200b '});assert.equal(last(a,'board_error').code,'invalid');assert.equal(ctx.values.get('boardIndex').length,1);
 await send(a,{t:'board_post',nonce:'2'.repeat(32),to:'정인',body:'가'.repeat(601)});assert.equal(last(a,'board_error').code,'invalid');
 await send(a,{t:'board_post',nonce:'2'.repeat(32),to:'이름'.repeat(8),body:'긴 받는 이름'});assert.equal(last(a,'board_error').code,'invalid');
 await send(a,{t:'board_post',nonce:'2'.repeat(32),to:'정인',body:'<img src=x onerror=alert(1)>\n줄바꿈'});assert.equal(last(a,'board_posted').note.body,'<img src=x onerror=alert(1)>\n줄바꿈');
 now+=2000;await send(b,{t:'board_read',request:'read',id});assert.equal(last(b,'board_note').note.body,posted.note.body);
 await send(b,{t:'board_read',request:'bad',id:'../../visits'});assert.equal(last(b,'board_error').code,'missing');
 for(let i=3;i<=9;i++){now+=2000;await send(a,{t:'board_post',nonce:i.toString(16).padStart(32,'0'),to:'모두',body:'쪽지 '+i})}
 now+=2000;await send(b,{t:'board_list',request:'first',page:0});let p=last(b,'board_page');assert.equal(p.notes.length,6);assert.equal(p.pages,2);assert.equal(p.notes[0].preview,'쪽지 9');assert.ok(!Object.hasOwn(p.notes[0],'body'));
 await send(b,{t:'board_list',request:'second',page:1});p=last(b,'board_page');assert.equal(p.notes.length,3);assert.equal(p.notes.at(-1).id,id);
 room=new c.Room(ctx,{});await ctx.ready;now+=2000;await send(b,{t:'board_read',request:'wake',id});assert.equal(last(b,'board_note').note.id,id);
 ctx.fail=true;const before=ctx.values.get('boardIndex').length,prior=b.messages.length;await send(a,{t:'board_post',nonce:'a'.repeat(32),to:'친구',body:'실패하면 남기지 않기'});assert.equal(last(a,'board_error').code,'storage');assert.equal(ctx.values.get('boardIndex').length,before);assert.equal(b.messages.length,prior);
 ctx.fail=false;now+=2000;await send(a,{t:'board_post',nonce:'a'.repeat(32),to:'친구',body:'실패하면 남기지 않기'});assert.equal(ctx.values.get('boardIndex').length,before+1);
 now+=2000;await Promise.all([send(a,{t:'board_post',nonce:'b'.repeat(32),to:'친구',body:'동시 A'}),send(b,{t:'board_post',nonce:'c'.repeat(32),to:'친구',body:'동시 B'})]);assert.equal(ctx.values.get('boardIndex').length,before+3);
 ctx.values.set('boardIndex',Array.from({length:500},(_,i)=>String(i)));now+=2000;await send(a,{t:'board_post',nonce:'d'.repeat(32),to:'친구',body:'가득 찬 게시판'});assert.equal(last(a,'board_error').code,'full');assert.equal(ctx.values.get('boardIndex').length,500);
 console.log('PASS: joined-user gate, shared durable notes, server authorship/time, newline preservation, nonce-idempotent retry, validation, safe key lookup, six-note pagination/newest-first, wake persistence, atomic rollback/retry, concurrent posts and capacity protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
