const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function client(saved=new Map()){
 let now=1800000000000,saves=0;const buttons=new Map();
 const c={Date:class extends Date{static now(){return now}},Number,Math,parseInt,me:{},sendDirty:false,store:{get:k=>saved.get(k),set(k,v){saved.set(k,v)}},serverNow:()=>now,saveVisit(){saves++},toast(){},practiceUI(){},setTimeout(){},$:id=>{if(!buttons.has(id))buttons.set(id,{});return buttons.get(id)}};
 vm.createContext(c);
 const init=html.slice(html.indexOf('const BOW_HALO_MS='),html.indexOf('function bowFrame('));
 const update=html.slice(html.indexOf('function updatePractice(dt){'),html.indexOf('// Background time never counts'));
 const reset=html.slice(html.indexOf('let resetArmed=0;'),html.indexOf('function updatePractice(dt){'));
 vm.runInContext(init+"\nfunction endPractice(){practice.mode='idle';practice.elapsed=0;practice.paused=false}\n"+reset+update+';this.practice=practice;this.update=updatePractice;this.valid=validBowHaloUntil;',c);
 return{c,saved,buttons,setNow:n=>now=n,get now(){return now},get saves(){return saves}};
}
const a=client(new Map([['garden.bows','107']]));a.c.practice.mode='auto';a.c.practice.elapsed=7.9;a.c.update(.2);
assert.equal(a.c.practice.count,108);assert.equal(a.c.practice.haloUntil,a.now+86400000);assert.equal(a.c.me.haloUntil,a.c.practice.haloUntil);assert.equal(a.saves,1);assert.equal(a.c.sendDirty,true);
const expiry=a.c.practice.haloUntil;a.setNow(a.now+60000);a.c.update(1);assert.equal(a.c.practice.haloUntil,expiry);
const restored=client(a.saved);assert.equal(restored.c.practice.haloUntil,expiry);restored.c.update(1);assert.equal(restored.c.practice.haloUntil,expiry);
restored.buttons.get('resetBtn').onclick();restored.buttons.get('resetBtn').onclick();assert.equal(restored.c.practice.count,0);assert.equal(restored.c.practice.haloUntil,expiry);
restored.setNow(expiry-1);restored.c.update(0);assert.equal(restored.c.me.haloUntil,expiry);restored.setNow(expiry);restored.c.update(0);assert.equal(restored.c.me.haloUntil,0);
const old=client(new Map([['garden.bows','108']]));old.c.update(1);assert.equal(old.c.practice.haloUntil,0); // no fresh reward on every reload
const paused=client(new Map([['garden.bows','107']]));paused.c.practice.mode='auto';paused.c.practice.paused=true;paused.c.practice.elapsed=7.9;paused.c.update(.5);assert.equal(paused.c.practice.count,107);assert.equal(paused.c.practice.haloUntil,0);
const worker=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8'),start=worker.indexOf('function cleanBowHalo('),end=worker.indexOf('\nfunction cleanState(',start);
vm.runInContext(worker.slice(start,end)+';this.serverClean=cleanBowHalo;',a.c);
assert.equal(a.c.serverClean(a.now+86400000),a.now+86400000);assert.equal(a.c.serverClean(a.now),0);assert.equal(a.c.serverClean(a.now+86400001),0);assert.equal(a.c.serverClean('forever'),0);
assert.ok(worker.includes('haloUntil:cleanBowHalo(s.haloUntil)'));assert.ok(html.includes('haloUntil:validBowHaloUntil(local.haloUntil,serverNow())'));
console.log('PASS: actual 107→108 completion, absolute 24-hour expiry, no renewal on reload/idle, reset preserves reward, pause does not earn, server expiry bounds and shared presence.');
