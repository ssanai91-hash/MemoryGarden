// node tests/bow-halo-world.mjs .preview-deps/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),c={THREE};vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('../assets/bow-halo.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replace('export function','function'),c);
const actor=()=>{const g=new THREE.Group(),rig=new THREE.Group(),head=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:0x224466}),body=new THREE.Mesh(new THREE.SphereGeometry(.5),material);g.add(rig);rig.add(head,body);head.position.y=1.7;return{g,rig,head,body,material}};
const now=1000,white=now+3*86400000,red=now+7*86400000;
// Mesh body: an inverted-hull outline, no ring or disc anywhere.
const p=actor(),marks=[],v=c.createBowHalo(p.head,(m,n)=>marks.push([m,n]),{person:p});assert.equal(v.group.parent,p.g);assert.equal(v.group.visible,false);assert.equal(v.group.children.length,0);
v.update(white,now,1,false,1);assert.equal(v.group.visible,true);assert.ok(v.outlines.length>0);assert.equal(v.overlays.length,0);
for(const o of v.outlines){assert.equal(o.mesh.visible,true);assert.equal(o.mesh.parent,p.body);assert.equal(o.mesh.geometry,p.body.geometry);assert.equal(o.material.side,THREE.BackSide);assert.ok(o.mesh.scale.x>1);assert.equal(o.material.color.getHex(),0xfff1c2);assert.equal(o.material.depthWrite,false);assert.equal(o.material.toneMapped,false)}
p.g.traverse(n=>{if(n.geometry)assert.ok(!(n.geometry instanceof THREE.TorusGeometry)&&!(n.geometry instanceof THREE.RingGeometry)&&!(n.geometry instanceof THREE.CircleGeometry),'no ring or disc halo')});
v.update(red,now,2,false,2);assert.ok(v.outlines.every(o=>o.material.color.getHex()===0xff3434));assert.ok(v.overlays.length>0);assert.ok(v.overlays.every(n=>n.mesh.visible));assert.equal(p.material.color.getHex(),0x224466);assert.equal(p.material.emissive.getHex(),0);
v.update(white,now,4,true,1);assert.ok(v.overlays.every(n=>!n.mesh.visible));assert.ok(v.outlines.every(o=>o.mesh.visible));v.update(white,white,4,false,1);assert.equal(v.group.visible,false);assert.ok(v.outlines.every(o=>!o.mesh.visible));v.update(1e15,now,5,false,2);assert.equal(v.group.visible,false);
let geometryDisposed=0;p.body.geometry.addEventListener('dispose',()=>geometryDisposed++);assert.ok(p.body.children.length>0);v.dispose();assert.equal(p.body.children.length,0);assert.equal(geometryDisposed,0);assert.equal(p.g.children.length,1);
// The hull shader swells along normals with the upward flame pattern; red burns harder, reduced motion calms it.
const q=actor(),hh=c.createBowHalo(q.head,()=>{},{person:q});hh.update(white,now,0,false,1);const hull=hh.outlines.at(-1).material;
const sh={vertexShader:THREE.ShaderLib.basic.vertexShader,fragmentShader:THREE.ShaderLib.basic.fragmentShader,uniforms:{}};hull.onBeforeCompile(sh);assert.ok(sh.vertexShader.includes('bowFlame('));assert.equal(sh.uniforms.uBowTime,hh.uniforms.uBowTime);assert.equal(hull.customProgramCacheKey(),'bow-halo-hull-flame');
assert.equal(hh.outlines.length,3);assert.ok(hh.outlines[2].mesh.scale.y>hh.outlines[2].mesh.scale.x,'flame layer rises upward');
hh.update(red,now,3,false,2);assert.equal(hh.uniforms.uBowFlame.value,1);assert.equal(hh.uniforms.uBowTime.value,3);hh.update(white,now,3,false,1);assert.ok(hh.uniforms.uBowFlame.value<1);hh.update(white,now,9,true,1);assert.equal(hh.uniforms.uBowTime.value,0);
hh.dispose();
console.log('PASS: real r170 flickering flame body-outline glow (inverted hulls), white/red colours, red body tint, 3/7-day expiry, no ring/disc, no material/texture mutation, complete cleanup.');
