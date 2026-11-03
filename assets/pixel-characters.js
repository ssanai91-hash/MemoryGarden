import * as THREE from 'three';
export const POSE_FRAMES=Object.freeze({sit:'sit',coffee:'sit',beer:'sit',soda:'sit',soju:'sit',makgeolli:'sit',cheers:'sit',pray:'sit',bow:'sit',lie:'sit',prone:'sit',woodpick:'sit',fuel:'sit',standing_pray:'front',pray2:'front',wave:'front',shake:'front',woodfeed:'front'});
const SEATED_POSES=new Set(['sit','coffee','beer','soda','soju','makgeolli','cheers']);
export function pixelLookForName(name,look){const next={...look},who=String(name||'').trim().normalize('NFC');delete next.px;if(who==='숭열')next.px='soongyeol';else if(who==='정인')next.px='jeongin';return next}
export function directionFrame(heading,viewHeading){const angle=Math.atan2(Math.sin(heading-viewHeading),Math.cos(heading-viewHeading)),a=Math.abs(angle);return a<Math.PI/4?{frame:'front',flip:false}:a>Math.PI*.75?{frame:'back',flip:false}:{frame:'side',flip:angle<0}}
export function createPixelCharacters({manifestUrl='./chars/manifest.json',loadTexture=url=>new THREE.TextureLoader().loadAsync(url),getManifest=()=>fetch(manifestUrl,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('manifest');return r.json()})}={}){
  const textures=new Map(),warm=new THREE.Color(0xffd4a1),point=new THREE.Vector3();
  const ready=Promise.resolve().then(getManifest).then(m=>new Map((m.characters||[]).filter(c=>/^[a-z0-9_-]{1,24}$/.test(c.id)&&c.file==='chars/'+c.id+'.png'&&c.size?.length===2&&['front','back','side','sit'].every(k=>Array.isArray(c.frames?.[k])&&c.frames[k].length===4&&c.frames[k].every(Number.isFinite))).map(c=>[c.id,c]))).catch(()=>new Map());
  async function textureFor(entry){if(!textures.has(entry.id))textures.set(entry.id,Promise.resolve().then(()=>loadTexture('./'+entry.file+(entry.revision?'?v='+encodeURIComponent(entry.revision):''))).then(texture=>{texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;return texture}));return textures.get(entry.id)}
  function detach(P){const state=P.pixel;if(!state)return;state.disposed=true;if(state.sprite){P.g.remove(state.sprite,state.anchor);state.sprite.material.map.dispose();state.sprite.material.dispose()}P.pixel=null;P.rig.visible=true}
  function attach(P,id){detach(P);if(!/^[a-z0-9_-]{1,24}$/.test(id||''))return;const state={id,ready:false,disposed:false};P.pixel=state;
    state.promise=ready.then(entries=>{const entry=entries.get(id);if(!entry)return;return textureFor(entry).then(texture=>{
      if(state.disposed||P.pixel!==state)return;
      const map=texture.clone();map.needsUpdate=true;const material=new THREE.SpriteMaterial({map,alphaTest:.5,transparent:false,fog:false,toneMapped:false});
      const sprite=new THREE.Sprite(material);sprite.name='pixel-character-'+id;sprite.center.set(.5,0);sprite.castShadow=sprite.receiveShadow=false;sprite.frustumCulled=false;
      const anchor=new THREE.Group();anchor.position.y=1.75;P.g.add(sprite,anchor);P.halo?.dispose();P.halo=null;P.rig.visible=false;
      Object.assign(state,{entry,sprite,anchor,ready:true});
    })}).catch(()=>{if(state.disposed||P.pixel!==state)return;state.failed=true;P.rig.visible=true});
  }
  function update(P,{pose,dt,time,camera,reduced=false,seated=false,seatHeight=null,groundHeight=0,daylight=1,slots=[]}){
    const state=P.pixel;if(!state?.ready)return false;
    const sprite=state.sprite,direction=directionFrame(P.g.rotation.y,Math.atan2(camera.position.x-P.g.position.x,camera.position.z-P.g.position.z));
    P.walkT+=dt*Math.max(0,P.speed)*2.6;
    const moving=P.speed>.3&&!POSE_FRAMES[pose],cycle=state.entry.animations?.walk?.[direction.frame],hasWalk=Array.isArray(cycle)&&cycle.length>1&&cycle.every(key=>state.entry.frames[key]);
    const count=hasWalk?cycle.length:1,step=Math.floor(P.walkT/(Math.PI*2)*count)%count;
    const seatBound=seated&&Number.isFinite(seatHeight)&&SEATED_POSES.has(pose),seatFrame=direction.frame==='front'?'sit':'sit_'+direction.frame;
    const walking=moving&&hasWalk,frame=seatBound?(state.entry.frames[seatFrame]?seatFrame:'sit'):walking?cycle[step]:(POSE_FRAMES[pose]||direction.frame),flip=(walking?direction.frame==='side':frame==='side'||frame==='sit_side')&&direction.flip,sittingFrame=frame.startsWith('sit');
    const [x,y,w,h]=state.entry.frames[frame],map=sprite.material.map,[aw,ah]=state.entry.size;
    if(state.frame!==frame||state.flip!==flip){map.repeat.set((flip?-1:1)*w/aw,h/ah);map.offset.set((x+(flip?w:0))/aw,1-(y+h)/ah);state.frame=frame;state.flip=flip}
    state.walking=walking;state.step=walking?step:null;const phase=Math.abs(Math.sin(P.walkT)),land=moving&&!reduced?Math.pow(1-phase,8):0;
    let height=sittingFrame?(seated?1.75:1.5):2,scaleY=1,scaleX=1,yLift=.02,rotation=0,tagY=sittingFrame?(seated?2.05:1.8):2.25;
    if(!reduced){if(walking){yLift+=phase*.008;if(direction.frame==='side')rotation=(flip?-1:1)*.008}else if(moving){yLift+=phase*.05;scaleY-=land*.05;scaleX+=land*.04;if(frame==='side')rotation=(flip?-1:1)*.025}else if(!sittingFrame)scaleY+=Math.sin(time*Math.PI*2/3.6)*.006}
    sprite.center.set(.5,0);
    if(pose==='lie'||pose==='prone'){sprite.center.set(.5,.5);yLift=.45;rotation=(pose==='lie'?1:-1)*Math.PI/2;tagY=.95}
    else if(pose==='bow'){const lean=Math.sin((P.bowPhase||0)*Math.PI);scaleY*=1-lean*.35;if(!reduced)rotation=.1*lean;tagY=1.6}
    else if(!reduced&&pose==='pray2'){yLift+=Math.abs(Math.sin(time*4.4))*.42;tagY+=.5}
    else if(!reduced&&pose==='wave')rotation=Math.sin(time*8)*.07;
    else if(pose==='shake')rotation=reduced?0:.04+Math.sin(time*10)*.025;
    else if(pose==='woodpick'||pose==='woodfeed'||pose==='fuel')rotation=reduced?0:.12;
    // Remove empty bottom padding from the foot anchor without cropping the atlas frame.
    const footprint=(state.entry.feetBaseline??h)/h;sprite.position.y=yLift-height*(1-footprint)*scaleY;
    if(seatBound){
      // Anchor the pelvis, not the feet, to the actual chair surface in world space.
      const anchor=state.entry.seatAnchors?.[frame]||[w/2,(state.entry.feetBaseline??h)-h*.12];
      sprite.center.set(flip?1-anchor[0]/w:anchor[0]/w,1-anchor[1]/h);sprite.position.y=seatHeight-groundHeight;
      tagY=sprite.position.y+height*(1-sprite.center.y)+.15;
    }
    sprite.scale.set(height*w/h*scaleX,height*scaleY,1);sprite.material.rotation=rotation;
    const d=THREE.MathUtils.clamp(daylight,0,1);sprite.material.color.setRGB(.65+d*.35,.72+d*.28,.85+d*.15);
    let warmth=0;for(const slot of slots||[]){const light=slot.light||slot;if(!light.visible||light.intensity<=0||!light.distance)continue;light.getWorldPosition(point);const distance=point.distanceTo(P.g.position);if(distance<light.distance)warmth+=Math.min(.3,light.intensity/(distance*distance+1)*.025)}
    sprite.material.color.lerp(warm,Math.min(.5,warmth));P.tag.position.y=tagY;state.anchor.position.y=seatBound?sprite.position.y+height*(.83-sprite.center.y):yLift+height*scaleY*.83;
    if(P.umbrella)P.umbrella.visible=false;return true;
  }
  return{ready,attach,detach,update};
}
