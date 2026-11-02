import * as THREE from 'three';

// Three shared, lightweight bands behind the head. No extra light or per-frame geometry.
let bands;
function geometry(){
 if(bands)return bands;
 const ring=new THREE.RingGeometry(.72,.9,80,2),colors=[];
 const p=ring.attributes.position;
 for(let i=0;i<p.count;i++){
  const a=Math.atan2(p.getY(i),p.getX(i)),c=new THREE.Color().setHSL(.43+.32*(.5+.5*Math.sin(a*2)),.68,.72);
  colors.push(c.r,c.g,c.b);
 }
 ring.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const stars=new THREE.BufferGeometry(),positions=[];
 for(let i=0;i<20;i++){const a=i/20*Math.PI*2,r=.97+.035*Math.sin(i*2.4);positions.push(Math.cos(a)*r,Math.sin(a)*r,0)}
 stars.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 return bands={ring,gold:new THREE.TorusGeometry(.65,.025,6,80),stars};
}
export function createBowHalo(head,markBloom){
 const geo=geometry(),group=new THREE.Group();group.position.set(0,.08,-.52);group.visible=false;head.add(group);
 const options={transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide};
 const gold=new THREE.MeshBasicMaterial({...options,color:0xffdf8c,opacity:.95});
 const aurora=new THREE.MeshBasicMaterial({...options,vertexColors:true,opacity:.65});
 const dust=new THREE.PointsMaterial({...options,color:0xffe5a6,size:.037,opacity:.75,sizeAttenuation:true});
 for(const mat of[gold,aurora,dust])markBloom(mat,1.8);
 const inner=new THREE.Mesh(geo.gold,gold),veil=new THREE.Mesh(geo.ring,aurora),stars=new THREE.Points(geo.stars,dust);
 veil.position.z=-.035;stars.position.z=-.055;group.add(veil,inner,stars);
 return{group,update(until,now,t,reduced=false){
  group.visible=Number.isFinite(until)&&until>now&&until<=now+86400000;
  if(!group.visible)return;
  const wave=reduced?0:Math.sin(t*.9),breath=1+wave*.025;
  group.scale.setScalar(breath);veil.rotation.z=reduced?0:t*.12;stars.rotation.z=reduced?0:-t*.08;
  aurora.opacity=.64+wave*.1;gold.opacity=.92+wave*.06;dust.opacity=.65+wave*.12;
 },dispose(){head.remove(group);for(const mat of[gold,aurora,dust])mat.dispose()}};
}
