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
// Sprite actors: enlarged silhouette layers behind the current atlas frame, following its centre, rotation and map.
const sp=actor(),map=new THREE.Texture(),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map,alphaTest:.5})),anchor=new THREE.Group();anchor.position.y=1.75;sp.g.add(sprite,anchor);sp.pixel={ready:true,sprite,anchor};
const pixels=c.createBowHalo(anchor,()=>{},{person:sp});pixels.update(white,now,0,false,1);
const layers=pixels.outlines.filter(o=>o.source===sprite);assert.equal(layers.length,3);
for(const o of layers){assert.ok(o.mesh.isSprite);assert.equal(o.mesh.parent,sprite);assert.ok(o.mesh.scale.x>1&&o.mesh.scale.y>1);assert.equal(o.material.map,map);assert.ok(o.mesh.renderOrder<sprite.renderOrder);assert.equal(o.material.blending,THREE.AdditiveBlending);assert.equal(o.material.customProgramCacheKey(),'bow-halo-silhouette-flame')}
assert.ok(layers[1].mesh.scale.x>layers[0].mesh.scale.x,'outer glow wider than the rim');assert.ok(layers[2].mesh.scale.y>layers[2].mesh.scale.x,'flame layer rises upward');
sprite.center.set(.5,.5);sprite.material.rotation=.4;const next=new THREE.Texture();sprite.material.map=next;pixels.update(white,now,1,false,1);
for(const o of layers){assert.equal(o.mesh.center.y,.5);assert.equal(o.material.rotation,.4);assert.equal(o.material.map,next)}
assert.equal(sprite.material.map,next);assert.equal(sprite.material.color.getHex(),0xffffff);
pixels.update(red,now,2,false,2);const tint=pixels.overlays.find(item=>item.source===sprite);assert.ok(tint);assert.equal(tint.material.map,next);
// The silhouette shader keeps only the texture alpha and paints a single colour.
const sh={fragmentShader:THREE.ShaderLib.sprite.fragmentShader,vertexShader:THREE.ShaderLib.sprite.vertexShader,uniforms:{}};layers[2].material.onBeforeCompile(sh);assert.ok(!sh.fragmentShader.includes('#include <map_fragment>'));assert.ok(sh.fragmentShader.includes('texture2D( map, vMapUv ).a'));assert.ok(sh.fragmentShader.includes('bowFlame('));assert.ok(sh.vertexShader.includes('vBowUv=uv'));assert.equal(sh.uniforms.uBowTime,pixels.uniforms.uBowTime);
// Flicker: time advances, red burns harder than white, reduced motion calms it.
pixels.update(red,now,3,false,2);assert.equal(pixels.uniforms.uBowFlame.value,1);assert.equal(pixels.uniforms.uBowTime.value,3);pixels.update(white,now,3,false,1);assert.ok(pixels.uniforms.uBowFlame.value<1);pixels.update(white,now,9,true,1);assert.equal(pixels.uniforms.uBowTime.value,0);
pixels.dispose();assert.equal(sprite.children.length,0);
console.log('PASS: real r170 flickering flame body-outline glow (sprite silhouette layers and mesh inverted hulls), white/red colours, red body tint, follows animated atlas frames, 3/7-day expiry, no ring/disc, no material/texture mutation, complete cleanup.');
