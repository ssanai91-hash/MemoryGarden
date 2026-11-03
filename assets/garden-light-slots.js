import * as THREE from 'three';

// Four permanently visible lights keep NUM_POINT_LIGHTS stable, including while intensity is zero.
export function createGardenLightSlots(scene,count=4){
 const sources=[],slots=Array.from({length:count},(_,i)=>{const light=new THREE.PointLight(0xffffff,0,1,2);light.name='garden-light-slot-'+i;light.castShadow=false;scene.add(light);return{light,source:null,target:null,at:-Infinity}});
 const position=new THREE.Vector3();let nextSelection=-Infinity,selections=0;
 function eligible(source,camera,actor){
  if(!source.parent||!(source.intensity>0))return null;
  for(let p=source;p;p=p.parent)if(!p.visible)return null;
  source.getWorldPosition(source.userData.slotPosition||(source.userData.slotPosition=new THREE.Vector3()));
  const p=source.userData.slotPosition,d=Math.min(p.distanceTo(camera),p.distanceTo(actor));
  if(source.distance>0&&d>=source.distance)return null;
  const kept=slots.some(s=>s.target===source);
  return{source,score:source.intensity/(1+d*d)*(kept?1.12:1),pinned:source.userData.gardenLightKind==='fireMain'&&Math.hypot(p.x-actor.x,p.z-actor.z)<30};
 }
 function choose(now,camera,actor){
  const list=sources.map(s=>eligible(s,camera,actor)).filter(Boolean).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.score-a.score).slice(0,count).map(x=>x.source),wanted=new Set(list);
  const free=[];for(const slot of slots){if(slot.target&&wanted.has(slot.target))wanted.delete(slot.target);else free.push(slot)}
  const replacements=list.filter(s=>wanted.has(s));
  for(let i=0;i<free.length;i++){const slot=free[i],target=replacements[i]||null;if(slot.target!==target){slot.source=slot.at+0.15<now?slot.target:slot.source;slot.target=target;slot.at=now}}
  selections++;
 }
 return{slots,sources,register(source){if(!sources.includes(source))sources.push(source);return source},
 update(now,camera,actor){
  if(now>=nextSelection){choose(now,camera,actor);nextSelection=now+.25}
  for(const slot of slots){
   const age=now-slot.at,first=age<.15,source=first?slot.source:slot.target,weight=age>=.3?1:first?Math.max(0,1-age/.15):Math.min(1,(age-.15)/.15);
   if(source){source.getWorldPosition(position);slot.light.position.copy(position);slot.light.color.copy(source.color);slot.light.distance=source.distance;slot.light.decay=source.decay;slot.light.intensity=source.intensity*weight}else slot.light.intensity=0;
   if(age>=.3)slot.source=slot.target;
  }
 },diagnostics(){return{slots:slots.length,lit:slots.filter(s=>s.light.intensity>0).length,virtual:sources.length,selections}},
 dispose(){for(const s of slots)scene.remove(s.light);sources.length=0}};
}
