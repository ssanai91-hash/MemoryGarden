const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function client(count=0){
 let now=1800000000000,saves=0;const saved=new Map([['garden.bows',String(count)]]),buttons=new Map();
 const c={Date:class extends Date{static now(){return now}},Number,Math,parseInt,me:{g:{position:{x:24,z:-3},rotation:{y:0}},speed:2},sendDirty:false,pose:'stand',worldSpace:'garden',move:{x:1,y:1},keys:{KeyW:true},target:{x:25,z:-2},marker:{visible:true},knob:{style:{}},pendingStoke:true,fuelTimer:0,userMoved:false,store:{get:k=>saved.get(k),set:(k,v)=>saved.set(k,v)},serverNow:()=>now,saveVisit(){saves++},toast(){},setTimeout(){},clearTimeout(){},cancelFireCare(){},closePoseMenu(){},syncPoseButtons(){},$:id=>{if(!buttons.has(id))buttons.set(id,{setAttribute(){}});return buttons.get(id)}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../assets/prayer-rules.js','utf8')+';this.Prayer=GardenPrayer;this.ALTAR_SPOTS=[Prayer.LAYOUT.buddha,Prayer.LAYOUT.mary];',c);
 vm.runInContext(html.slice(html.indexOf('const BOW_HALO_MS='),html.indexOf('// Background time never counts'))+';this.practice=practice;',c);
 return{c,saved,buttons,get saves(){return saves},get now(){return now}};
}
// Reproduce the reported return visit with 108 already saved: neither action may stay locked.
const done=client(108);assert.equal(done.buttons.get('bowBtn').disabled,false);assert.equal(done.buttons.get('autoBowBtn').disabled,false);assert.equal(done.buttons.get('autoBowBtn').textContent,'108배 다시 하기');
done.c.practice.haloUntil=done.now+3600000;const expiry=done.c.practice.haloUntil;
done.buttons.get('bowBtn').onclick();assert.equal(done.c.pose,'bow');assert.equal(done.c.practice.mode,'single');assert.equal(done.c.target,null);assert.equal(done.c.move.x,0);assert.equal(done.c.move.y,0);assert.equal(done.c.me.speed,0);assert.equal(done.c.keys.KeyW,undefined);assert.equal(done.buttons.get('bowCounter').hidden,false);
done.c.updatePractice(8);assert.equal(done.c.practice.mode,'idle');assert.equal(done.c.practice.count,108);assert.equal(done.c.practice.haloUntil,expiry);assert.equal(done.saves,0); // one extra bow cannot renew the reward
// The labelled restart begins a fresh sequence, retaining the existing absolute halo expiry.
done.buttons.get('autoBowBtn').onclick();assert.equal(done.c.practice.mode,'auto');assert.equal(done.c.practice.count,0);assert.equal(done.saved.get('garden.bows'),'0');assert.equal(done.saves,1);assert.equal(done.c.practice.haloUntil,expiry);
done.c.updatePractice(8);assert.equal(done.c.practice.count,1);done.buttons.get('pauseBtn').onclick();done.c.updatePractice(8);assert.equal(done.c.practice.count,1);done.buttons.get('pauseBtn').onclick();done.c.updatePractice(8);assert.equal(done.c.practice.count,2);done.buttons.get('finishBtn').onclick();assert.equal(done.c.practice.mode,'idle');
const partial=client(37);partial.buttons.get('autoBowBtn').onclick();assert.equal(partial.c.practice.count,37);partial.c.updatePractice(8);assert.equal(partial.c.practice.count,38);
const last=client(107);last.buttons.get('autoBowBtn').onclick();last.c.updatePractice(8);assert.equal(last.c.practice.count,108);assert.equal(last.c.practice.haloUntil,last.now+86400000);assert.equal(last.saves,1);last.buttons.get('bowBtn').onclick();last.c.updatePractice(8);assert.equal(last.saves,1);
console.log('PASS: real prayer button handlers after saved 108, one extra bow without halo renewal, explicit restart, in-place movement stop, partial resume, pause/finish and fresh 107→108 reward.');
