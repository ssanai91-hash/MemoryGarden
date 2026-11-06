import * as THREE from 'three';

// Head-top rings and a red additive body pass. No point lights or shared actor
// material changes: earning a reward never recolours another person's clothes.
let shared;
function geometry(){
  return shared||(shared={ring:new THREE.TorusGeometry(.34,.022,6,64),veil:new THREE.RingGeometry(.29,.4,64)});
}
export function createBowHalo(head,markBloom,{person=null}={}){
  const geo=geometry(),group=new THREE.Group(),root=person?.g||head,point=new THREE.Vector3(),worldRotation=new THREE.Quaternion();
  group.name='personal-head-halo';group.visible=false;root.add(group);
  const options={transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide};
  const ringMaterial=new THREE.MeshBasicMaterial({...options,color:0xffffff,opacity:.95}),veilMaterial=new THREE.MeshBasicMaterial({...options,color:0xffffff,opacity:.18});
  markBloom(ringMaterial,1.7);markBloom(veilMaterial,1.4);
  const ring=new THREE.Mesh(geo.ring,ringMaterial),veil=new THREE.Mesh(geo.veil,veilMaterial);ring.rotation.x=veil.rotation.x=-Math.PI/2;group.add(ring,veil);
  const overlays=[];let bodyBuilt=false;
  function addBodyGlow(){
    if(bodyBuilt||!person)return;bodyBuilt=true;
    const nodes=[];person.rig.traverse(n=>{if(n.isMesh&&!n.userData.handProp&&!n.isInstancedMesh)nodes.push(n)});
    if(person.pixel?.ready){for(const n of person.g.children)if(n!==person.tag&&n!==person.bubble&&(n.isSprite||n===person.pixel.rest?.mesh))nodes.push(n)}
    for(const source of nodes){
      const original=Array.isArray(source.material)?source.material[0]:source.material;
      if(!original)continue;
      const opts={...options,color:0xff3838,opacity:.28,map:original.map||null,alphaTest:original.alphaTest||0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1};
      const material=source.isSprite?new THREE.SpriteMaterial(opts):new THREE.MeshBasicMaterial(opts);
      const mesh=source.isSprite?new THREE.Sprite(material):new THREE.Mesh(source.geometry,material);
      mesh.name='personal-body-glow';mesh.castShadow=mesh.receiveShadow=false;mesh.visible=false;mesh.renderOrder=source.renderOrder+.1;
      source.add(mesh);markBloom(material,1.6);overlays.push({source,mesh,material});
    }
  }
  return{group,overlays,update(until,now,t,reduced=false,level=1){
    const active=Number.isFinite(until)&&until>now&&until<=now+(level===2?7:3)*86400000;
    group.visible=active;const red=active&&level===2;if(red)addBodyGlow();
    for(const item of overlays){item.mesh.visible=red;item.material.opacity=.25+(reduced?0:Math.sin(t*1.4)*.045);if(item.source.isSprite){item.mesh.center.copy(item.source.center);item.material.rotation=item.source.material.rotation;item.material.map=item.source.material.map}}
    if(!active)return;
    const wave=reduced?0:Math.sin(t*.9),size=level===2?1.3:1;
    group.scale.setScalar(size*(1+wave*.018));ringMaterial.color.setHex(red?0xff3030:0xffffff);veilMaterial.color.copy(ringMaterial.color);veilMaterial.opacity=(red?.25:.14)+wave*.035;
    // Keep the ring horizontally above the actual head, including bowing,
    // seated sprites and lying volumes, rather than behind the face.
    if(person){head.getWorldPosition(point);point.y+=person.pixel?.ready ? .38 : .58;root.worldToLocal(point);group.position.copy(point);root.getWorldQuaternion(worldRotation);group.quaternion.copy(worldRotation).invert()}
    else group.position.set(0,.62,0);
  },dispose(){root.remove(group);ringMaterial.dispose();veilMaterial.dispose();for(const {source,mesh,material}of overlays){source.remove(mesh);material.dispose()}}};
}
