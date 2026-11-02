const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../assets/garden-renderer.js','utf8');
const start=source.indexOf('export function bloomSettings('),end=source.indexOf('export function markBloom(',start),c={THREE:{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}}};
vm.createContext(c);vm.runInContext(source.slice(start,end).replace('export function','function')+'this.settings=bloomSettings;',c);
const night=c.settings({level:2}),day=c.settings({daylight:1,level:2});
assert.equal(night.strength,.9);assert.equal(night.exposure,1.05);assert.equal(day.strength,.2);assert.equal(day.exposure,.88);
assert.ok(c.settings({rain:1,level:2}).strength<night.strength);assert.equal(c.settings({level:1}).scale,.5);assert.equal(c.settings({level:2}).scale,1);
assert.ok(Math.abs(c.settings({level:1}).strength-night.strength*.8)<1e-12);
for(let n=0;n<=100;n++)for(let d=0;d<=100;d++){
 const s=c.settings({daylight:n/100,dawn:d/100,dusk:1-d/100,level:2});
 assert.ok(s.strength>=.2-1e-12&&s.strength<=.9+1e-12);assert.ok(s.exposure>=.88-1e-12&&s.exposure<=1.05+1e-12);
}
const twilight=c.settings({dusk:1,level:2});assert.equal(twilight.strength,.5);assert.equal(twilight.threshold,.85);
assert.ok(c.settings({space:'listening',level:2}).strength<day.strength);
console.log('PASS: day/night/twilight endpoints, bounded continuous interpolation, rain reduction, half-resolution balance and subdued indoor bloom.');
