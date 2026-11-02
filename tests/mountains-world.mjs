// node tests/mountains-world.mjs /absolute/path/to/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),c={THREE};vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('../assets/garden-mountains.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replaceAll('export function','function'),c);
const scene=new THREE.Scene(),r=c.addAlpineRange(scene),g=r.mesh.geometry;
assert.equal(scene.children.length,1);assert.equal(r.peaks.length,29);assert.equal(r.mesh.material.fog,true);assert.equal(r.mesh.material.vertexColors,true);assert.equal(r.mesh.castShadow,false);assert.equal(r.mesh.frustumCulled,false);assert.equal(g.attributes.position.count/3,8816);
assert.ok(g.boundingBox.max.y>=128);assert.ok(g.boundingSphere.radius<310);
for(const p of r.peaks){assert.ok(Math.hypot(p.x,p.z)-Math.max(p.width,p.depth)>120);assert.ok(p.height/p.width>.4)}
for(const key of['position','normal','color'])for(const x of g.attributes[key].array)assert.ok(Number.isFinite(x),key);
let snow=0,rock=0;for(let i=0;i<g.attributes.color.count;i++){const x=g.attributes.color.getX(i);if(x>.5)snow++;else rock++}assert.ok(snow>100&&rock>100);
const a=c.alpinePeakData({height:132,width:37,depth:31,seed:4}),b=c.alpinePeakData({height:132,width:37,depth:31,seed:4});assert.deepEqual(a.positions,b.positions);assert.equal(Math.max(...a.positions.filter((_,i)=>i%3===1)),132);
for(let i=0;i<a.normals.length;i+=3){assert.ok(Math.abs(Math.hypot(...a.normals.slice(i,i+3))-1)<1e-6);assert.ok(a.normals[i+1]>0)}
// Perspective checks: the summit clears the old foothills after the existing 5.88m horizon bend.
const camera=new THREE.PerspectiveCamera(55,1,0.1,400);camera.position.set(0,4,24);camera.lookAt(0,8,0);camera.updateMatrixWorld();
const hero=r.peaks.find(p=>p.height===132),summit=new THREE.Vector3(hero.x,128-5.88,hero.z).project(camera),foot=new THREE.Vector3(hero.x,42-5.88,hero.z).project(camera);
assert.ok(summit.y>foot.y+.4);assert.ok(summit.y<1&&summit.y>-.2);assert.ok(summit.z<1);
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify({positions:Array.from(g.attributes.position.array),colors:Array.from(g.attributes.color.array),normals:Array.from(g.attributes.normal.array)}));
console.log('PASS: actual r170 12 asymmetric summits and joined shoulders, sharp 132m summit, snow/rock facets, one draw call / 8816 triangles, finite upward normals, garden clearance, deterministic RNG and summit projection.');

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),begin=html.indexOf('  const mGeo=new THREE.SphereGeometry(1,10,6'),end=html.indexOf('  const pines=[],distantCrowns=[]',begin);
let calls=0;const backdrop=new THREE.Scene(),integration={THREE,scene:backdrop,F:color=>new THREE.MeshLambertMaterial({color}),rnd:()=>{calls++;return .5},addAlpineRange:c.addAlpineRange};vm.createContext(integration);vm.runInContext(html.slice(begin,end),integration);assert.equal(calls,88);assert.equal(backdrop.children.length,12);
assert.ok(html.includes("import {addAlpineRange} from './assets/garden-mountains.js'"));
console.log('PASS: actual app integration keeps 11 foothills, adds alpine range, and consumes exactly the original 88 random draws.');
