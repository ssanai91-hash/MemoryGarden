// node tests/bow-halo-world.mjs .preview-deps/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),c={THREE};vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('../assets/bow-halo.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replace('export function','function'),c);
const head=new THREE.Group(),marks=[],v=c.createBowHalo(head,(m,n)=>marks.push([m,n]));assert.equal(v.group.parent,head);assert.ok(v.group.position.z<-.4);assert.equal(v.group.visible,false);assert.equal(marks.length,3);
v.update(86401000,1000,1);assert.equal(v.group.visible,true);const r=v.group.children[0].rotation.z;v.update(86401000,1001,2);assert.notEqual(v.group.children[0].rotation.z,r);
v.update(86401000,1002,3,true);assert.equal(v.group.children[0].rotation.z,0);assert.equal(v.group.scale.x,1);
for(const n of v.group.children){assert.equal(n.material.depthTest,true);assert.equal(n.material.depthWrite,false);assert.equal(n.material.toneMapped,false);for(const x of n.geometry.attributes.position.array)assert.ok(Number.isFinite(x))}
v.update(86401000,86401000,4);assert.equal(v.group.visible,false);v.update(1e15,1000,5);assert.equal(v.group.visible,false);
const second=c.createBowHalo(new THREE.Group(),()=>{});assert.equal(second.group.children[0].geometry,v.group.children[0].geometry);assert.notEqual(second.group.children[0].material,v.group.children[0].material);
v.dispose();assert.equal(head.children.length,0);console.log('PASS: actual r170 rear-head aura, shared geometry, independent materials, bloom/depth flags, gentle/reduced motion, exact expiry and disposal.');
