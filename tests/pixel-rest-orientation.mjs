// node tests/pixel-rest-orientation.mjs /path/to/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),context={THREE};vm.createContext(context);
for(const file of ['pixel-rest','pixel-actions','pixel-characters','bow-halo'])vm.runInContext(fs.readFileSync(new URL('../assets/'+file+'.js',import.meta.url),'utf8').replace(/^import .*;$/mg,'').replaceAll('export ',''),context);
const manifest=JSON.parse(fs.readFileSync(new URL('../chars/manifest.json',import.meta.url),'utf8')),camera=new THREE.PerspectiveCamera(55,412/860,.1,400);
const makePerson=()=>{const g=new THREE.Group(),rig=new THREE.Group(),tag=new THREE.Object3D();g.add(rig,tag);return{g,rig,tag,walkT:0,speed:0}};
const systemFor=m=>context.createPixelCharacters({getManifest:()=>m,loadTexture:()=>new THREE.Texture()});
const near=(a,b,message)=>assert.ok(a.distanceTo(b)<1e-8,message);
function samples(mesh){mesh.updateWorldMatrix(true,false);const a=mesh.geometry.attributes.position;return Array.from({length:24},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,Math.floor(i*(a.count-1)/23)).applyMatrix4(mesh.matrixWorld))}
let checks=0;
for(const legacy of [false,true]){
 const m=structuredClone(manifest);if(legacy)for(const e of m.characters){delete e.actionVersion;delete e.animations}
 const system=systemFor(m);
 for(const entry of m.characters){
  const P=makePerson(),other=makePerson();system.attach(P,entry.id);await P.pixel.promise;system.attach(other,entry.id);await other.pixel.promise;
  const body=P.pixel.rest.mesh,geometry=body.geometry,material=body.material;assert.equal(other.pixel.rest.mesh.geometry,geometry,'same-character volume is shared');
  assert.ok(body.isMesh&&!body.isSprite);assert.ok(material.isMeshStandardMaterial&&material.vertexColors,'volume receives the actual garden lights');assert.equal(material.map,null,'body is colored solid geometry, not an image plane');assert.equal(body.castShadow,false);assert.equal(material.color,P.pixel.sprite.material.color);
  const size=geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x>.7&&size.y>1.8&&size.z>.6,'substantial width, length and thickness');assert.ok(geometry.index.count/3<10000,'one mesh with a bounded triangle budget');
  const pos=geometry.attributes.position,normals=geometry.attributes.normal,idx=geometry.index,color=geometry.attributes.color;assert.ok(new Set(Array.from(color.array)).size>30,'preserve the character palette');
  for(let i=0;i<idx.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,idx.getX(i)),b=new THREE.Vector3().fromBufferAttribute(pos,idx.getX(i+1)),c=new THREE.Vector3().fromBufferAttribute(pos,idx.getX(i+2)),normal=new THREE.Vector3().fromBufferAttribute(normals,idx.getX(i));assert.ok(b.sub(a).cross(c.sub(a)).dot(normal)>0,'all solid faces have outward winding')}
  const halo=context.createBowHalo(P.pixel.anchor,()=>{});halo.update(86400000,0,0,true);
  for(const heading of [0,.72,Math.PI,-Math.PI/2])for(const pose of ['lie','prone'])for(const [ground,surface]of [[0,0],[0,.1],[.32,.32],[.46,.46]]){
   P.g.position.set(4,ground,-7);P.g.rotation.y=heading;
   const options={pose,dt:1/30,time:0,camera,groundHeight:ground,surfaceHeight:surface,seated:true,seatHeight:.88};let initial,head;
   for(let i=0;i<36;i++){
    const angle=i*Math.PI/18;camera.position.set(4+Math.sin(angle)*8,ground+2+(i%3)*4,-7+Math.cos(angle)*8);camera.lookAt(4,ground,-7);camera.updateMatrixWorld(true);
    system.update(P,{...options,time:i/30,reduced:i%2===0});P.g.updateMatrixWorld(true);const points=samples(body),anchor=P.pixel.anchor.getWorldPosition(new THREE.Vector3()),bounds=new THREE.Box3().setFromObject(body);
    assert.equal(P.pixel.sprite.visible,false);assert.equal(body.visible,true);assert.equal(body.geometry,geometry);assert.equal(body.material,material);assert.ok(Math.abs(bounds.min.y-(surface+.012))<1e-8,'lowest real volume vertex stays on the actual floor');assert.ok(bounds.max.y-bounds.min.y>.6,'no return to a flat ground picture');assert.ok(anchor.y<P.tag.getWorldPosition(new THREE.Vector3()).y);
    if(i===0){initial=points;head=anchor}else{points.forEach((v,j)=>near(v,initial[j],'orbit cannot move body geometry'));near(anchor,head,'head/halo remains at the same garden position')}
    const faceUp=new THREE.Vector3(0,0,1).applyQuaternion(body.quaternion);assert.ok(pose==='lie'?faceUp.y>.99:faceUp.y<-.99,'supine face up, prone back up');assert.ok(new THREE.Box3().setFromObject(halo.group).min.y>surface,'halo stays above the floor');checks++;
   }
   const forward=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),heading);assert.ok(head.clone().sub(P.g.position).dot(forward)>.5,'head stays on the character heading side');
   const box=new THREE.Box3().setFromObject(body),center=box.getCenter(new THREE.Vector3());
   for(const direction of [new THREE.Vector3(0,-1,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,-1)]){const ray=new THREE.Raycaster(center.clone().addScaledVector(direction,-3),direction);assert.ok(ray.intersectObject(body).length>0,'solid body visible from above, side and head')}
   system.update(P,{...options,pose:'stand'});assert.equal(body.visible,false);assert.equal(P.pixel.sprite.visible,true);system.update(P,{...options,pose:'sit',seated:true,seatHeight:.52});assert.equal(body.visible,false);assert.equal(P.pixel.sprite.visible,true);
  }
  halo.dispose();let disposed=0;geometry.addEventListener('dispose',()=>disposed++);system.detach(P);assert.equal(disposed,0,'shared geometry lives until the last user detaches');system.detach(other);assert.equal(disposed,1);assert.equal(body.parent,null);assert.equal(P.rig.visible,true);
 }
}
const old=structuredClone(manifest);delete old.characters[0].restVolume;const system=systemFor(old),P=makePerson();system.attach(P,'soongyeol');await P.pixel.promise;
assert.equal(system.update(P,{pose:'lie',camera,dt:.05,time:0}),false,'old sheet falls back to the articulated 3D body');assert.equal(P.rig.visible,true);assert.equal(P.pixel.sprite.visible,false);assert.equal(system.update(P,{pose:'stand',camera,dt:.05,time:0}),true);assert.equal(P.rig.visible,false);assert.equal(P.pixel.sprite.visible,true);system.detach(P);
console.log('PASS: '+checks+' r170 solid-rest camera orbits; actual 3-axis volume and outward geometry, real lit material, bounded triangles, fixed floor/head/heading, supine/prone orientation, 3-way raycasts, halo and pose transitions, shared resources/disposal and old-sheet 3D fallback.');
