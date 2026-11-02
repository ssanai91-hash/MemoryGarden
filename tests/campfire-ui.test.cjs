const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),start=html.indexOf('function cancelFireCare('),end=html.indexOf("$('pWave').onclick",start);
const c={crypto,Uint8Array,console};vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../assets/campfire-rules.js','utf8'),c);
vm.runInContext(`
const Fire=GardenCampfire;let fireAction=null,hasEntered=true,visitEnded=false,worldSpace='garden',pose='stand',target=null,sharedCampfire=Fire.initial(Date.now()),fireStatusKey='';
let pendingStoke=false,pendingShake=null,fuelTimer=0,move={},userMoved=false,autoJoined=false,sendDirty=false;
const messages=[],toasts=[],elements={},knob={style:{}},keys={},marker={visible:false},me={g:{position:{x:5.5,z:0},rotation:{y:0}}},bonfire={stoke:0};
const $=id=>elements[id]||(elements[id]={open:false,textContent:''});
const room={fireVersion:1,online:true,connected(){return this.online},send(m){messages.push(m)}};
const cam={sky:false},gardenBoard={isOpen:()=>false},calm={mode:null};let rpsGame=null;
const closePoseMenu=()=>{},endPractice=()=>{pose='stand'},clearTimeout=()=>{},syncPoseButtons=()=>{},sendPresence=()=>messages.push({t:'presence',p:pose}),toast=t=>toasts.push(t),serverNow=()=>Date.now(),stripInvisible=s=>s;
`+html.slice(start,end)+`
this.ui={startFireCare,updateFireCare,receiveFireMessage,cancelFireCare,messages,toasts,me,room,elements,marker,
 get action(){return fireAction},get pose(){return pose},get fire(){return sharedCampfire},get target(){return target},
 arrive(){Object.assign(me.g.position,target);target=null},setPose(p){pose=p},setSpace(s){worldSpace=s}};
`,c);
const ui=c.ui;ui.startFireCare();assert.equal(ui.action.phase,'approach');assert.ok(ui.target.fireCare);
ui.arrive();ui.updateFireCare(.1);assert.equal(ui.action.phase,'waiting');const req=ui.messages.find(m=>m.t==='fire_begin');assert.ok(req);
ui.receiveFireMessage({t:'fire_ready',request:'old',token:'old'});assert.equal(ui.action.phase,'waiting');
ui.receiveFireMessage({t:'fire_ready',request:req.request,token:'token'});assert.equal(ui.pose,'woodpick');ui.updateFireCare(.81);assert.equal(ui.pose,'woodcarry');assert.equal(ui.target.x,3.1);
ui.arrive();ui.updateFireCare(.1);assert.equal(ui.pose,'woodfeed');ui.updateFireCare(1.11);assert.equal(ui.action.phase,'confirm');assert.equal(ui.messages.at(-1).t,'fire_add');
assert.equal(ui.messages.at(-2).t,'presence');assert.equal(ui.messages.at(-2).p,'woodfeed');
const next=c.GardenCampfire.add(ui.fire,Date.now(),{id:'A',name:'현주'},'token');ui.receiveFireMessage({t:'fire_state',token:'token',fire:c.GardenCampfire.publicState(next),event:next.last});
assert.equal(ui.action,null);assert.equal(ui.pose,'stand');assert.ok(ui.elements.campfireLastCare.textContent.includes('현주'));assert.ok(ui.elements.campfireStatus.textContent.includes('모닥불'));
// Moving away cancels before pickup, and a delayed acknowledgement cannot revive the action.
ui.me.g.position.x=5.5;ui.me.g.position.z=0;ui.startFireCare();ui.arrive();ui.updateFireCare(.1);const pending=ui.action.request;ui.cancelFireCare();ui.receiveFireMessage({t:'fire_ready',request:pending,token:'late'});assert.equal(ui.action,null);assert.equal(ui.pose,'stand');
// A changed pose, room exit or disconnection cannot submit fuel later.
for(const stop of [()=>ui.setPose('sit'),()=>ui.setSpace('listening'),()=>ui.room.online=false]){
 ui.setSpace('garden');ui.setPose('stand');ui.room.online=true;ui.startFireCare();assert.ok(ui.action);stop();ui.updateFireCare(.1);assert.equal(ui.action,null);
}
// Far-away and disconnected players cannot start the animation.
ui.room.online=true;ui.setSpace('garden');ui.me.g.position.x=30;ui.startFireCare();assert.equal(ui.action,null);ui.me.g.position.x=5.5;ui.room.online=false;ui.startFireCare();assert.equal(ui.action,null);
console.log('PASS: approach/pick/carry/feed/server-confirm sequence, shared avatar poses, presence before commit, stale acknowledgement ignored, durable caretaker text, interruption/space/offline cancellation, and contextual distance gate.');
