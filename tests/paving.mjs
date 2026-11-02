// node tests/paving.mjs /absolute/path/to/pinned/three-r170.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),c={THREE};vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('../assets/prayer-rules.js',import.meta.url),'utf8'),c);
vm.runInContext(fs.readFileSync(new URL('../assets/prayer-garden.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replaceAll('export ',''),c);
const geometry=c.pavedDisk(11),position=geometry.attributes.position,index=geometry.index.array,normal=geometry.attributes.normal;
let maxEdge=0,maxBend=0;
for(let i=0;i<index.length;i+=3){
 const v=Array.from(index.slice(i,i+3),k=>new THREE.Vector3().fromBufferAttribute(position,k));
 for(let j=0;j<3;j++)maxEdge=Math.max(maxEdge,v[j].distanceTo(v[(j+1)%3]));
 const center=v.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/3);
 const bend=(p)=>-.0012*(p.x*p.x+p.z*p.z);
 maxBend=Math.max(maxBend,bend(center)-v.reduce((a,b)=>a+bend(b),0)/3);
}
for(let i=0;i<normal.count;i++)assert.ok(normal.getY(i)>.999);
assert.ok(maxEdge<1.5);assert.ok(maxBend<.003);
const old=new THREE.CircleGeometry(11,96),p=old.attributes.position,a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,1),d=new THREE.Vector3().fromBufferAttribute(p,2),mid=a.clone().add(b).add(d).multiplyScalar(1/3),bend=v=>-.0012*(v.x*v.x+v.y*v.y);
const oldError=bend(mid)-(bend(a)+bend(b)+bend(d))/3;assert.ok(oldError>.03);
const L=c.GardenPrayer.LAYOUT;assert.ok(L.x-L.width/2>5.5);assert.ok(L.box.x>L.buddha.x);assert.ok(L.box.x+2.2<L.mary.x-1.5);
for(const t of [L.buddha,L.mary,L.box])assert.ok(c.GardenPrayer.inside(t.x,t.z));
console.log('PASS: upward-facing dense circular paving, max curved-ground sag '+maxBend.toFixed(6)+'m (old '+oldError.toFixed(6)+'m), east-side square and separated statue/candle bank bounds.');
