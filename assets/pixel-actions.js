import * as THREE from 'three';

export const ACTION_POSES=Object.freeze(['stand','sit','lie','prone','wave','standing_pray','pray2','shake','pray','bow','coffee','beer','fuel','woodpick','woodcarry','woodfeed','soda','soju','cheers','makgeolli']);
const DRINKS=new Set(['coffee','beer','soda','soju','makgeolli']),CHAIR_ACTIONS=new Set(['sit','coffee','beer','soda','soju','makgeolli','cheers','wave','shake']);
const PROP_KEYS=['cup','can','soda','shot','riceCup','beerGlass','sodaGlass','wood'];
// Resting bodies live in the garden's ground plane, rather than Sprite's camera plane.
// Image-left (the head) points along the person's +Z heading. Reuse the atlas/color.
export function createPixelRest(P,sprite){
  const material=new THREE.MeshBasicMaterial({map:sprite.material.map,alphaTest:.5,transparent:false,side:THREE.DoubleSide,fog:false,toneMapped:false});material.color=sprite.material.color;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material),basis=new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,Math.PI/2)),turn=new THREE.Quaternion(),axis=new THREE.Vector3(0,0,1),offset=new THREE.Vector3();
  mesh.name='pixel-rest';mesh.castShadow=mesh.receiveShadow=false;mesh.frustumCulled=false;mesh.visible=false;P.g.add(mesh);
  return{mesh,update(active){
    sprite.visible=!active;mesh.visible=active;if(!active)return;
    mesh.scale.copy(sprite.scale);mesh.quaternion.copy(basis).multiply(turn.setFromAxisAngle(axis,sprite.material.rotation));
    offset.set((.5-sprite.center.x)*sprite.scale.x,(.5-sprite.center.y)*sprite.scale.y,0).applyQuaternion(mesh.quaternion);mesh.position.copy(sprite.position).add(offset);
  },dispose(){P.g.remove(mesh);mesh.geometry.dispose();material.dispose()}};
}
export function selectPixelAction(entry,pose,view,{phase=0,seated=false,walkT=0,speed=0}={}){
  const have=key=>entry.frames[key]?key:null,dir=key=>have(key+'_'+view)||have(key+'_front');
  if(pose==='bow'){const p=THREE.MathUtils.clamp(Number.isFinite(phase)?phase:0,0,1),i=p<.08?0:p<.28?1:p<.42?2:p<.64?3:p<.9?4:5;return have('bow_'+view+'_'+i)}
  if(pose==='sit')return seated?dir('chair'):(view==='front'?'sit':have('sit_'+view)||'sit');
  if(DRINKS.has(pose))return dir('drink');
  if(['standing_pray','pray','wave','shake','cheers','woodcarry'].includes(pose))return dir(pose);
  if(pose==='pray2')return view==='front'?have('pray2_front'):dir('standing_pray');
  if(pose==='woodpick')return have('woodpick_side');
  if(pose==='woodfeed'||pose==='fuel')return have('woodfeed_side');
  if(pose==='lie'||pose==='prone')return have(pose);
  const cycle=entry.animations?.walk?.[view];return speed>.3&&Array.isArray(cycle)&&cycle.length?cycle[Math.floor(walkT/(Math.PI*2)*cycle.length)%cycle.length]:view;
}

export function createPixelActions(P,state){
  const {entry,sprite}=state,unit=entry.actionConversion.pixelWorldSize,lower=new THREE.Sprite(sprite.material.clone()),arm=new THREE.Sprite(sprite.material.clone());
  for(const part of[lower,arm]){part.material.map=sprite.material.map.clone();part.material.map.needsUpdate=true;part.castShadow=part.receiveShadow=false;part.visible=false;P.g.add(part)}
  const saved=[];for(const key of PROP_KEYS){const prop=P[key];if(!prop)continue;saved.push({prop,parent:prop.parent,position:prop.position.clone(),quaternion:prop.quaternion.clone(),scale:prop.scale.clone()});P.g.add(prop);prop.visible=false}
  const q=new THREE.Quaternion(),inverse=new THREE.Quaternion(),offset=new THREE.Vector3(),lightPoint=new THREE.Vector3(),warm=new THREE.Color(0xffd4a1);let previous=null,elapsed=0;
  function rect(object,key,flip,y0=0,y1=null,x0=0,x1=null){
    const [x,y,w,h]=entry.frames[key];y1??=h;x1??=w;const map=object.material.map;
    map.repeat.set((flip?-1:1)*(x1-x0)/entry.size[0],(y1-y0)/entry.size[1]);map.offset.set((x+x0+(flip?x1-x0:0))/entry.size[0],1-(y+y1)/entry.size[1]);object.scale.set((x1-x0)*unit,(y1-y0)*unit,1);object.material.rotation=0;
  }
  function point(object,p,pivot,origin,flip,depth=0){
    offset.set((p[0]-pivot[0])*unit*(flip?-1:1),(pivot[1]-p[1])*unit,depth).applyQuaternion(q);object.position.copy(origin).add(offset);object.quaternion.copy(q);
  }
  function update({pose,dt,time,camera,reduced=false,seated=false,seatHeight=null,groundHeight=0,surfaceHeight=groundHeight,pocha=false,daylight=1,slots=[]},direction){
    if(previous!==pose){previous=pose;elapsed=0}elapsed+=dt;
    P.walkT+=Math.max(0,P.speed)*dt*2.6;
    const onChair=seated&&Number.isFinite(seatHeight)&&CHAIR_ACTIONS.has(pose),key=selectPixelAction(entry,pose,direction.frame,{phase:P.bowPhase,seated:onChair,walkT:P.walkT,speed:P.speed});
    if(!key||!entry.frames[key])return false;
    const [,,w,h]=entry.frames[key],info=entry.frameInfo[key],side=key.includes('_side')||key==='side',resting=key==='lie'||key==='prone',flip=side&&direction.flip;
    camera.getWorldQuaternion(q);P.g.getWorldQuaternion(inverse);q.premultiply(inverse.invert());
    let pivot=info.ground.slice(),origin=new THREE.Vector3(0,Math.max(groundHeight,surfaceHeight)-groundHeight+.012,0),part=onChair&&pose!=='sit',lowerKey=null;
    // Center the resting footprint on the person, without lifting it by transparent padding.
    if(resting)pivot[1]=(info.top+info.ground[1])/2;
    const carryWalk=pose==='woodcarry'&&P.speed>.3&&entry.animations?.walk?.[direction.frame]?.length;
    if(onChair){pivot=info.hip.slice();origin.y=seatHeight-groundHeight;lowerKey='chair_'+direction.frame;}
    else if(carryWalk){lowerKey=selectPixelAction(entry,'stand',direction.frame,{walkT:P.walkT,speed:P.speed});const li=entry.frameInfo[lowerKey];pivot=info.hip.slice();origin.y+=(li.ground[1]-li.hip[1])*unit;part=true}
    rect(sprite,key,flip);sprite.center.set(flip?1-pivot[0]/w:pivot[0]/w,1-pivot[1]/h);sprite.position.copy(origin);lower.visible=false;arm.visible=false;
    if(part&&entry.frames[lowerKey]){
      const upperEnd=Math.min(h,pivot[1]+1);rect(sprite,key,flip,0,upperEnd);sprite.center.y=1-pivot[1]/upperEnd;
      const li=entry.frameInfo[lowerKey],[,,lw,lh]=entry.frames[lowerKey],start=Math.max(0,li.hip[1]-1);rect(lower,lowerKey,flip,start);lower.center.set(flip?1-li.hip[0]/lw:li.hip[0]/lw,1-(li.hip[1]-start)/(lh-start));lower.position.copy(origin);lower.visible=true;lower.renderOrder=sprite.renderOrder-1;
    }
    if(info.arm){
      const cut=info.arm.cut,end=part?Math.min(h,pivot[1]+1):h,[ax,ay]=info.arm.pivot,bodyStart=info.arm.left?cut:0,bodyEnd=info.arm.left?w:cut,armStart=info.arm.left?0:cut,armEnd=info.arm.left?cut:w;
      rect(sprite,key,false,0,end,bodyStart,bodyEnd);sprite.center.set((pivot[0]-bodyStart)/(bodyEnd-bodyStart),1-pivot[1]/end);
      rect(arm,key,false,0,end,armStart,armEnd);arm.center.set((ax-armStart)/(armEnd-armStart),1-ay/end);point(arm,[ax,ay],pivot,origin,false);arm.visible=true;arm.material.rotation=reduced?0:Math.sin(time*(pose==='wave'?7:10))*(pose==='wave'?.16:.07);
    }
    if(!reduced&&pose==='stand'&&P.speed>.3){const bob=Math.abs(Math.sin(P.walkT))*.008;sprite.position.y+=bob;if(lower.visible)lower.position.y+=bob;origin.y+=bob}
    state.rest.update(resting);if(resting)q.copy(state.rest.mesh.quaternion);
    const tagY=resting?origin.y+.65:origin.y+(pivot[1]-info.top)*unit+.18;P.tag.position.y=tagY;point(state.anchor,info.head,pivot,origin,flip,resting?.12:-.02);
    // The halo's negative-Z offset must sit above a lying head, not below the floor.
    if(resting)state.anchor.rotateY(Math.PI);
    const d=THREE.MathUtils.clamp(daylight,0,1);sprite.material.color.setRGB(.65+d*.35,.72+d*.28,.85+d*.15);let warmth=0;
    for(const slot of slots||[]){const light=slot.light||slot;if(!light.visible||light.intensity<=0||!light.distance)continue;light.getWorldPosition(lightPoint);const distance=lightPoint.distanceTo(P.g.position);if(distance<light.distance)warmth+=Math.min(.3,light.intensity/(distance*distance+1)*.025)}sprite.material.color.lerp(warm,Math.min(.5,warmth));lower.material.color.copy(sprite.material.color);arm.material.color.copy(sprite.material.color);
    for(const {prop}of saved)prop.visible=false;
    if(['beer','soda','soju','makgeolli'].includes(pose))P.lastDrink=pose;
    const held=pose==='cheers'?(P.lastDrink||'soju'):pose;
    const propKey=held==='coffee'?'cup':held==='beer'?(pocha?'beerGlass':'can'):held==='soda'?(pocha?'sodaGlass':'soda'):held==='soju'?'shot':held==='makgeolli'?'riceCup':null;
    if(propKey&&P[propKey]){const prop=P[propKey],old=saved.find(s=>s.prop===prop);prop.visible=true;point(prop,info.hand,pivot,origin,flip,direction.frame==='back'?-.035:.04);prop.scale.copy(old.scale).multiplyScalar(1.4);if(!reduced&&pose!=='cheers')prop.rotateZ(Math.max(0,Math.sin(time*.7))*.15)}
    if(P.wood&&['woodpick','woodcarry','woodfeed','fuel'].includes(pose)){
      P.wood.visible=pose==='woodcarry'||pose==='woodpick'&&elapsed>.35||(pose==='woodfeed'||pose==='fuel')&&elapsed<.85;
      if(P.wood.children[0]?.isInstancedMesh)P.wood.children[0].count=Math.max(1,Math.min(5,P.woodCount||1));point(P.wood,info.hand,pivot,origin,flip,direction.frame==='back'?-.08:.08);P.wood.scale.set(1,1,1);
      if(pose==='woodfeed'||pose==='fuel'){const deposit=Math.min(1,elapsed/.85);offset.set(deposit*.35,-deposit*.25,0).applyQuaternion(q);P.wood.position.add(offset)}
    }
    state.frame=key;state.flip=flip;state.walking=pose==='stand'&&P.speed>.3||!!carryWalk;state.step=state.walking?Math.floor(P.walkT/(Math.PI*2)*6)%6:null;state.seatBound=onChair;
    return true;
  }
  return{update,dispose(){for(const part of[lower,arm]){P.g.remove(part);part.material.map.dispose();part.material.dispose()}for(const s of saved){s.parent?.add(s.prop);s.prop.position.copy(s.position);s.prop.quaternion.copy(s.quaternion);s.prop.scale.copy(s.scale);s.prop.visible=false}}};
}
