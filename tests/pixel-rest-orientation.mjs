// node tests/pixel-rest-orientation.mjs /path/to/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),context={THREE};vm.createContext(context);
for(const file of ['pixel-actions','pixel-characters'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file+'.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replaceAll('export ',''),context);
vm.runInContext(fs.readFileSync(new URL('../assets/bow-halo.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replaceAll('export ',''),context);
const manifest=JSON.parse(fs.readFileSync(new URL('../chars/manifest.json',import.meta.url),'utf8')),camera=new THREE.PerspectiveCamera(55,412/860,.1,400);
const makePerson=()=>{const g=new THREE.Group(),rig=new THREE.Group(),tag=new THREE.Object3D();g.add(rig,tag);return{g,rig,tag,walkT:0,speed:0}};
const systemFor=m=>context.createPixelCharacters({getManifest:()=>m,loadTexture:()=>new THREE.Texture()});
function vertices(mesh){mesh.updateWorldMatrix(true,false);const a=mesh.geometry.attributes.position;return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(mesh.matrixWorld))}
function near(a,b,message){assert.ok(a.distanceTo(b)<1e-9,message)}
let checks=0;
for(const legacy of [false,true]){
 const m=structuredClone(manifest);if(legacy)for(const e of m.characters){delete e.actionVersion;delete e.animations}
 const system=systemFor(m);
 for(const entry of m.characters){
  const P=makePerson();system.attach(P,entry.id);await P.pixel.promise;const rest=P.pixel.rest,body=rest.mesh,map=P.pixel.sprite.material.map,geometry=body.geometry,material=body.material;
  assert.ok(body.isMesh&&!body.isSprite,'rest must render in world space, outside the billboard shader');assert.equal(body.castShadow,false);assert.equal(material.side,THREE.DoubleSide);assert.equal(material.map,map);assert.equal(material.color,P.pixel.sprite.material.color);const halo=context.createBowHalo(P.pixel.anchor,()=>{});halo.update(86400000,0,0,true);
  for(const heading of [0,.72,Math.PI,-Math.PI/2])for(const pose of ['lie','prone'])for(const [ground,surface]of [[0,0],[0,.1],[.32,.32],[.46,.46]]){
   P.g.position.set(4,ground,-7);P.g.rotation.y=heading;
   const options={pose,dt:1/30,time:0,camera,groundHeight:ground,surfaceHeight:surface,seated:true,seatHeight:.88};
   let initial,head,uv;
   for(let i=0;i<36;i++){
    const angle=i*Math.PI/18;camera.position.set(4+Math.sin(angle)*8,ground+2+(i%3)*4,-7+Math.cos(angle)*8);camera.lookAt(4,ground,-7);camera.updateMatrixWorld(true);
    system.update(P,{...options,time:i/30,reduced:i%2===0});P.g.updateMatrixWorld(true);const points=vertices(body),anchor=P.pixel.anchor.getWorldPosition(new THREE.Vector3());
    assert.equal(P.pixel.sprite.visible,false);assert.equal(body.visible,true);assert.equal(body.geometry,geometry);assert.equal(body.material,material);assert.equal(body.material.map,map);assert.ok(points.every(v=>Math.abs(v.y-(surface+.012))<1e-9),'all four body corners stay on the actual floor');assert.ok(anchor.y>surface&&anchor.y<P.tag.getWorldPosition(new THREE.Vector3()).y);
    const currentUV=[...map.offset,...map.repeat];
    if(i===0){initial=points;head=anchor;uv=currentUV}else{points.forEach((v,j)=>near(v,initial[j],'orbit must not move any body corner'));near(anchor,head,'head/halo remains at the same garden position');assert.deepEqual(currentUV,uv,'camera must never swap head and feet through mirroring')}
    const haloBounds=new THREE.Box3().setFromObject(halo.group);assert.ok(haloBounds.min.y>surface,'resting halo must stay above the ground');assert.equal(body.material.color,P.pixel.sprite.material.color);checks++;
   }
   if(!legacy){const forward=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),heading),fromCenter=head.clone().sub(P.g.position);assert.ok(fromCenter.dot(forward)>.5,'head stays on the character heading side')}
   // The physical body remains hittable from above even after a full camera orbit.
   const center=initial.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(.25),ray=new THREE.Raycaster(center.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0));assert.ok(ray.intersectObject(body).length>0);
   system.update(P,{...options,pose:'stand'});assert.equal(body.visible,false);assert.equal(P.pixel.sprite.visible,true);assert.equal(P.pixel.sprite.material.map,map);
   system.update(P,{...options,pose:'sit',seated:true,seatHeight:.52});assert.equal(body.visible,false);assert.equal(P.pixel.sprite.visible,true);assert.ok(P.tag.position.y>.52-ground);
  }
  halo.dispose();let geometryDisposed=0,materialDisposed=0;geometry.addEventListener('dispose',()=>geometryDisposed++);material.addEventListener('dispose',()=>materialDisposed++);system.detach(P);assert.equal(body.parent,null);assert.equal(geometryDisposed,1);assert.equal(materialDisposed,1);assert.equal(P.rig.visible,true);
 }
}
console.log('PASS: '+checks+' r170 resting camera orbits for both characters and legacy sheets; fixed world vertices, head/feet, atlas UVs, all floor heights and headings; overhead raycast, stand/chair transitions, shared resources and disposal.');
