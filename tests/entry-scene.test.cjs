const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const scene=html.match(/<script type="module" id="gardenSceneModule">([\s\S]*?)<\/script>/)[1].replace(/^import .*;\n/gm,'');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

for(const failed of [false,true])test('scene startup is independent of '+(failed?'failed':'pending')+' allocation',async()=>{
 let admit,started=false;
 const intent=new Promise(resolve=>{admit=resolve});
 // Execute the real module through its first Three operation. The entry
 // controller exists immediately, while its admission promise stays pending
 // after a slow request or an allocation error awaiting a retry.
 const end=scene.indexOf('THREE.ColorManagement.enabled=false;')+'THREE.ColorManagement.enabled=false;'.length;
 const prefix=scene.slice(0,end)+'sceneryReady();})();';
 const entryScreen={waitForEntry:()=>intent};
 const boot=vm.runInNewContext('(async()=>{'+prefix+'})()',{
  window:{gardenEntryReady:Promise.resolve(entryScreen)},THREE:{ColorManagement:{}},sceneryReady(){started=true},
 });
 if(failed)entryScreen.error='allocation unavailable';
 await settle();assert.equal(started,true,'3D setup must start without admission');await boot;
 admit({});
});

test('admission retains sole ownership of entry controls until saved entry intent',async()=>{
 let admit;const intent=new Promise(resolve=>{admit=resolve}),events=[];
 const gate=scene.indexOf('const entryIntent=await entryScreen.waitForEntry();');
 const start=scene.lastIndexOf('(async()=>{',gate),end=scene.indexOf('})();',gate)+5;
 const context={
  entryScreen:{waitForEntry:()=>intent,detach(){events.push('detach')},complete(){events.push('complete')}},
  bindGardenEntryForm(){events.push('bind')},personalUpdatePending:false,
  gardenIdentity:{credentials:()=>({personalCode:'12345'})},readVisit:()=>({personal:{personalCode:'12345'}}),
  async restoreVisit(options){assert.equal(options.connect,false);assert.equal(options.identity,false);events.push('restore')},
  validLook:()=>true,myLook:{},stripInvisible:s=>s,applyMyLook(){events.push('look')},visitToken:'saved-token',
  store:{set(){}},petKind:()=> 'dog',refreshMine(){},closeNameDialog(){},installGardenHistory(){},
  startGardenConnection(){events.push('connect')},saveVisit(){events.push('save')},updateWho(){},
 };
 const joined=vm.runInNewContext(scene.slice(start,end),context);
 await settle();assert.deepEqual(events,[],'pending allocation must neither detach retry/import controls nor connect');
 admit({name:'저장된 친구',gender:'male',look:{},dog:{b:3,coat:2},changed:false});await joined;
 assert.deepEqual(events,['detach','bind','restore','look','complete','connect','save']);assert.equal(context.hasEntered,true);
 // Neither statue prefetch nor the frame loop lives inside the admission gate.
 assert.ok(html.indexOf('src="./assets/sayu-prefetch.js"')<html.indexOf('id="entryScreenModule"'));
 assert.ok(scene.indexOf('createSayuStatues({')<start);
 assert.ok(scene.lastIndexOf('requestGardenFrame();')>end);
});
