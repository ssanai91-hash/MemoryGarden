// node tests/black-poodle.mjs /absolute/path/three-r170.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const THREE = await import(pathToFileURL(process.argv[2]).href);
assert.equal(THREE.REVISION, '170');
THREE.ColorManagement.enabled = false;
const context = { THREE, Math }; vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../assets/black-poodle.js', import.meta.url), 'utf8').replace(/^import .*;$/mg, '').replaceAll('export ', ''), context);
const { makeBlackPoodle, isPhotoPoodle } = context;
assert.ok(isPhotoPoodle({ b: 3, coat: 2 }));
for (const spec of [null, {}, { b: 3 }, { b: 3, coat: 4 }, { kind: 'cat', b: 3, coat: 2 }, { b: 2, coat: 2 }]) assert.ok(!isPhotoPoodle(spec));
const scene = new THREE.Scene(), options = { scene, disableActorShadows: g => g.traverse(n => { if (n.isMesh) n.castShadow = false; }) };
const started = performance.now(), dog = makeBlackPoodle(options), other = makeBlackPoodle(options);
assert.equal(dog.legs.length, 4); assert.ok(dog.head.isGroup); assert.ok(dog.tail.isGroup);
assert.equal(dog.g.parent, scene); assert.equal(other.g.parent, scene);
const lods = []; dog.g.traverse(n => { if (n.isLOD) lods.push(n); });
assert.equal(lods.length, 7);
const otherLods = []; other.g.traverse(n => { if (n.isLOD) otherLods.push(n); });
let nearTriangles = 0, farTriangles = 0, meshes = 0;
for (const [i, lod] of lods.entries()) {
  assert.equal(lod.levels.length, 3);
  nearTriangles += lod.levels[0].object.geometry.attributes.position.count / 3;
  farTriangles += lod.levels[2].object.geometry.attributes.position.count / 3;
  for (let level = 0; level < 3; level++) {
    const geometry = lod.levels[level].object.geometry;
    assert.equal(geometry, otherLods[i].levels[level].object.geometry);
    assert.ok([...geometry.attributes.position.array].every(Number.isFinite));
    assert.ok(geometry.boundingSphere.radius > 0);
  }
}
assert.ok(nearTriangles < 140000, 'close coat triangle budget');
assert.ok(farTriangles < nearTriangles / 4, 'distant coat is substantially cheaper');
dog.g.traverse(n => { if (n.isMesh) { meshes++; assert.equal(n.castShadow, false); } });
assert.ok(meshes < 50, 'bounded draw calls even including invisible LOD meshes');
dog.g.updateMatrixWorld(true);
const bounds = new THREE.Box3().setFromObject(dog.g);
assert.ok(bounds.min.y >= -.01 && bounds.max.y < 1, 'paws meet ground and pet fits garden scale');
const camera = new THREE.PerspectiveCamera();
for (const [distance, expected] of [[3, 0], [12, 1], [30, 2]]) {
  camera.position.set(0, .5, distance); camera.updateMatrixWorld(true);
  for (const lod of lods) { lod.update(camera); assert.equal(lod.getCurrentLevel(), expected); }
}
for (let i = 0; i < 600; i++) dog.updateDetail(camera, i / 60);
assert.ok(dog.eyes.every(eye => Number.isFinite(eye.scale.y)));
let disposed = 0; otherLods[0].levels[0].object.geometry.addEventListener('dispose', () => disposed++);
dog.dispose(); assert.equal(dog.g.parent, null); assert.equal(disposed, 0); assert.equal(other.g.parent, scene);
// Actual client dispatch and legacy server profile format: friends get the same
// model without requiring a protocol migration or a new breed index.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.includes('if(isPhotoPoodle(spec))return makeBlackPoodle('));
assert.ok(html.includes('D.updateDetail?.(camera,t)'));
const movement = { Math, camera, collide: (x, z) => [x, z], groundY: () => 0 }; vm.createContext(movement);
vm.runInContext('const angLerp=(a,b,k)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*k;\n' + html.slice(html.indexOf('function updateDog('), html.indexOf('/* ---------- me ---------- */')), movement);
for (let i = 0; i < 180; i++) movement.updateDog(other, i / 90, 0, 0, 'stand', true, 1 / 60, i / 60);
assert.ok(other.walk > 0 && other.g.position.x > .5, 'actual garden follower walks toward owner');
for (let i = 0; i < 240; i++) movement.updateDog(other, 2, 0, 0, 'sit', false, 1 / 60, 3 + i / 60);
assert.ok(other.rig.position.y < -.2 && other.legs[0].rotation.x < -1, 'actual garden resting pose settles');
assert.ok([other.head.rotation.x, other.tail.rotation.y, ...other.g.position].every(Number.isFinite));
const server = fs.readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
const ctx = { Number, clean: value => String(value || '').slice(0, 8) }; vm.createContext(ctx);
vm.runInContext(server.slice(server.indexOf('function cleanDog('), server.indexOf('// Cosmetic completion expiry')), ctx);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.cleanDog({ b: 3, coat: 2, n: '검은 푸들' }))), { b: 3, coat: 2, n: '검은 푸들' });
const ignore = fs.readFileSync(new URL('../.assetsignore', import.meta.url), 'utf8');
assert.ok(ignore.includes('!assets/black-poodle.js'));
console.log(`PASS: real r170 geometry, ${nearTriangles} close / ${farTriangles} far coat triangles, ${meshes} meshes including hidden LODs; shared resources, four articulated legs, ground bounds, blink, LOD, safe replacement and legacy multiplayer profile. Build/check ${(performance.now() - started).toFixed(0)}ms.`);
