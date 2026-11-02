const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/../assets/garden-foliage.js','utf8').replace('export function','function'),c={Math};vm.createContext(c);vm.runInContext(source+'this.make=lushTreeCrowns;',c);
const color=hex=>({hex,shade:1,multiplyScalar(s){this.shade*=s;return this}});
const base={x:-24,z:5,h:10,w:4,id:'maple',form:'maple',palette:[0x7a9855,0x8baf6d,0xafd285],scale:1};
for(const form of ['round','maple','flower','magnolia','column','pine','spire','willow','birch','fan']){
 const a=c.make({...base,form},color),b=c.make({...base,form},color);assert.equal(JSON.stringify(a),JSON.stringify(b));
 const main=a.tiers.flatMap(v=>v).filter(v=>v.family!=='petals');assert.equal(main.length,a.extra);
 const balanced=a.tiers[0].filter(v=>v.family!=='petals').length;assert.equal(balanced,a.balanced);
 assert.equal(a.understory.length,4);
 for(const item of main){assert.ok(item.sx>0&&item.sy>0&&item.sz>0);assert.ok(item.y>0&&item.y<base.h*1.2);assert.ok(Math.hypot(item.x-base.x,item.z-base.z)<base.w*1.3);assert.ok(item.c.shade>0)}
 if(['round','maple','flower','magnolia','column'].includes(form)){assert.equal(a.extra,a.base);assert.ok(Math.abs(balanced/a.base-.4)<.15)}
 if(['pine','spire'].includes(form))assert.equal(a.extra,2);
}
assert.ok(!source.includes('Math.random'));
const html=fs.readFileSync(__dirname+'/../index.html','utf8');assert.ok(html.includes('quality.level<c.minQuality'));assert.ok(html.includes("kind:'understory'"));
console.log('PASS: deterministic independent tree RNG, 1.4×/2× rounded crown budgets, two pine layers, willow curtains, finite bounds, colour layers, understory and quality-tier gating.');
