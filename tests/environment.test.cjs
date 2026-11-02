const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const start=html.indexOf('function createGardenEnvironment('),end=html.indexOf('const gardenEnvironment=createGardenEnvironment(',start);
const context={Date,Math,Number,RangeError};vm.createContext(context);vm.runInContext(html.slice(start,end)+';this.make=createGardenEnvironment;',context);
const make=opts=>context.make(opts),env=make({epoch:0,dayMinutes:24}),at=h=>h*60000;
assert.equal(env.dayMs,24*60000);assert.equal(env.hour(at(24)),0);assert.equal(env.hour(-1)<24,true);assert.equal(env.hour(-1)>=0,true);
for(const h of [0,6.5,8.5,16.5,19.5,23.99])assert.ok(Math.abs(env.hour(at(h))-h)<1e-9);
assert.equal(env.frame(at(6)).period,'night');assert.equal(env.frame(at(7)).period,'dawn');assert.equal(env.frame(at(12)).period,'day');assert.equal(env.frame(at(18)).period,'dusk');assert.equal(env.frame(at(20)).period,'night');
let counts={night:0,dawn:0,day:0,dusk:0};for(let minute=0;minute<1440;minute++)counts[env.frame(minute*1000).period]++;
assert.deepEqual(counts,{night:660,dawn:120,day:480,dusk:180});
for(const boundary of [0,6.5,8.5,16.5,19.5,24]){
 const before=env.frame(at(boundary)-1),after=env.frame(at(boundary)+1);assert.ok(Math.abs(before.daylight-after.daylight)<.0001);
}
assert.ok(env.frame(at(13)).sun.y>.8);assert.ok(env.frame(at(1)).sun.y<0);assert.ok(env.frame(at(1)).moon.y>.8);
assert.equal(env.frame(at(23.999)).moonPhase,env.frame(at(24.001)).moonPhase);assert.equal(env.frame(at(19)).moonPhase,env.frame(at(30)).moonPhase);
const slow=make({epoch:0,dayMinutes:48}),another=make({epoch:0,dayMinutes:24});assert.equal(slow.hour(at(12)),6);
let rains=0,active=0;
for(let slot=-20;slot<180;slot++){
 const f=env.front(slot);if(f.active){active++;if(f.kind==='rain')rains++;assert.ok(f.duration>=180000&&f.duration<360000)}
 for(const offset of [0,1,180000,800000,1799999]){
  const t=slot*env.weatherPeriod+offset,w=env.weather(t),w2=another.weather(t);assert.equal(JSON.stringify(w),JSON.stringify(w2));assert.equal(JSON.stringify(w),JSON.stringify(slow.weather(t)));
  for(const k of ['rain','snow','cloud','density','brightness','storm'])assert.ok(Number.isFinite(w[k])&&w[k]>=0&&w[k]<=1,k);
  assert.ok(!(w.rain>.0001&&w.snow>.0001));assert.ok(Number.isFinite(w.wind));
 }
 const t=(slot+1)*env.weatherPeriod,before=env.weather(t-1),after=env.weather(t+1);
 for(const k of ['rain','snow','cloud','wind'])assert.ok(Math.abs(before[k]-after[k])<.001,`boundary ${slot} ${k}`);
}
assert.ok(active>100&&active<160);assert.ok(rains>90&&rains<150);
const transition={from:'rain',to:'snow',at:1000000};
for(let t=transition.at;t<=transition.at+30000;t+=500){const w=env.weather(t,'snow',transition);assert.ok(!(w.rain>.00001&&w.snow>.00001))}
assert.equal(env.weather(transition.at+31000,'snow',transition).rain,0);
// The photographic surface keeps stars visible behind the lunar night side.
for(const phase of [.25,.75]){
 const dark=env.moonPixel(phase===.25?-.5:.5,0,phase),bright=env.moonPixel(phase===.25?.5:-.5,0,phase);
 assert.ok(dark.alpha<=.0061);assert.ok(bright.alpha>.99);assert.ok(bright.shade>.4);
}
assert.equal(env.moonPixel(1.1,0,.5).alpha,0);assert.ok(env.moonPixel(0,0,.5).alpha>.99);assert.ok(env.moonPixel(0,0,0).alpha<.007);
assert.ok(html.includes('window.gardenHour=gardenHour;'));assert.ok(html.includes('const GARDEN_DAY_MINUTES=24;'));
assert.ok(html.includes('texture.generateMipmaps=false;'));assert.ok(html.includes('const MOON_SURFACE_SIZE=512'));
assert.ok(!html.includes('NIGHT_ALWAYS'));assert.ok(!html.includes('MOON_INTERVAL'));
const worker=fs.readFileSync(__dirname+'/../worker/src/index.js','utf8');assert.ok(worker.includes('weatherTransition={from:'));
console.log('PASS: 24-minute clock, 11/2/8/3 phase durations, continuous light, sun/moon arcs, stable nightly phase, shared independent 3–6 minute weather fronts, dry block boundaries, manual rain/snow separation, and transparent lunar night side.');
