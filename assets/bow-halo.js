import * as THREE from 'three';

// 절 보상: 몸의 윤곽(테두리)이 빛난다. 108배 = 따뜻한 흰빛, 3000배 = 붉은빛 + 몸 전체 붉은 기운.
// 예전의 머리 위 고리·머리 뒤 원형 광배는 영혼처럼 보여 쓰지 않는다.
// 원래 재질·텍스처는 바꾸지 않고, 각 몸 조각에 덧그리는 별도 패스만 붙인다. 점광원도 만들지 않는다.
//  - 도트 캐릭터(스프라이트): 같은 그림의 실루엣을 조금 키워 뒤에 두 겹(가까운 테두리 + 번지는 빛)으로 깐다.
//  - 입체 몸(메시): 법선 반대면을 조금 키운 껍질(inverted hull)로 윤곽을 그린다.
// 이글이글: 바깥 겹일수록 위로 흐르는 불꽃 무늬로 빛이 끊기고 일렁이며, 맨 바깥 겹은 위로 늘어난 불기운이다.
// 108배 흰빛은 은은하게 일렁이고(FLAME 1), 3000배 붉은빛은 확실하게 이글거린다(FLAME 2).
const COLORS={1:0xfff1c2,2:0xff3434},FLAME={1:.45,2:1};
const LAYERS=[{scale:1.07,stretch:1,opacity:.85,flame:.2},{scale:1.17,stretch:1.06,opacity:.34,flame:.6},{scale:1.24,stretch:1.3,opacity:.3,flame:1}];

// 위로 흐르는 불꽃 무늬(0~1). 사인 겹침이라 따로 텍스처가 필요 없다.
const FLAME_GLSL=`
float bowFlame(vec2 p,float t){
  float a=sin(p.x*11.0+sin(p.y*7.0-t*3.1)*1.7+t*1.3);
  float b=sin(p.x*23.0-p.y*13.0+t*5.3+sin(p.y*4.0+t*2.2)*2.0);
  float c=sin((p.y*9.0-t*6.0)+sin(p.x*17.0+t*1.7));
  return clamp(.5+.5*(a*.45+b*.3+c*.45),0.,1.);
}
`;
// 스프라이트 그림의 알파만 쓰고 색은 한 가지로 칠한다(머리카락처럼 어두운 픽셀도 테두리가 고르게 빛나도록).
// 위쪽일수록 불꽃이 더 끊기고 일렁인다.
function silhouette(material,uniforms,flame){
  material.onBeforeCompile=sh=>{
    sh.uniforms.uBowTime=uniforms.uBowTime;sh.uniforms.uBowFlame=uniforms.uBowFlame;sh.uniforms.uBowLayer={value:flame};
    sh.vertexShader='varying vec2 vBowUv;\n'+sh.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvBowUv=uv;');
    sh.fragmentShader='varying vec2 vBowUv;uniform float uBowTime,uBowFlame,uBowLayer;\n'+FLAME_GLSL+sh.fragmentShader.replace('#include <map_fragment>',
      `#ifdef USE_MAP
  diffuseColor.a *= texture2D( map, vMapUv ).a;
#endif
  float bowAmount=uBowFlame*uBowLayer*mix(.45,1.0,vBowUv.y);
  diffuseColor.a *= mix(1.0,smoothstep(.22,.78,bowFlame(vBowUv,uBowTime)),bowAmount);`);
  };
  material.customProgramCacheKey=()=>'bow-halo-silhouette-flame';
  return material;
}
// 입체 껍질: 법선 방향으로 위로 흐르는 물결만큼 부풀었다 꺼진다.
function flameHull(material,uniforms,flame,amp){
  material.onBeforeCompile=sh=>{
    sh.uniforms.uBowTime=uniforms.uBowTime;sh.uniforms.uBowFlame=uniforms.uBowFlame;sh.uniforms.uBowLayer={value:flame};sh.uniforms.uBowAmp={value:amp};
    sh.vertexShader='uniform float uBowTime,uBowFlame,uBowLayer,uBowAmp;\n'+FLAME_GLSL+sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
  transformed+=normalize(normal)*uBowAmp*uBowFlame*uBowLayer*bowFlame(position.xy/max(uBowAmp*12.0,1e-4)+position.zx*.3,uBowTime);`);
  };
  material.customProgramCacheKey=()=>'bow-halo-hull-flame';
  return material;
}

export function createBowHalo(head,markBloom,{person=null}={}){
  // `group` remains as the reward's visibility flag for callers; the light itself lives on the body.
  const group=new THREE.Group(),root=person?.g||head;group.name='personal-body-halo';group.visible=false;root.add(group);
  const additive={transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending};
  const outlines=[],overlays=[],uniforms={uBowTime:{value:0},uBowFlame:{value:FLAME[1]}};let built=false,tintBuilt=false;
  function bodyNodes(){
    const nodes=[];if(!person)return nodes;
    person.rig?.traverse(n=>{if(n.isMesh&&!n.userData.handProp&&!n.isInstancedMesh&&!n.userData.haloPass)nodes.push(n)});
    if(person.pixel?.ready){for(const n of person.g.children)if(n!==person.tag&&n!==person.bubble&&!n.userData.haloPass&&(n.isSprite||n===person.pixel.rest?.mesh))nodes.push(n)}
    return nodes;
  }
  function buildOutline(){
    if(built||!person)return;built=true;
    const scale=new THREE.Vector3();
    for(const source of bodyNodes()){
      const original=Array.isArray(source.material)?source.material[0]:source.material;if(!original)continue;
      // 눈·눈썹·안경 같은 작은 조각의 껍질은 얼굴 위에 선을 그어서 빼고, 몸·머리·팔다리처럼 윤곽을 만드는 조각만 쓴다.
      if(!source.isSprite&&source!==person.pixel?.rest?.mesh){
        if(!source.geometry.boundingSphere)source.geometry.computeBoundingSphere();
        source.updateWorldMatrix(true,false);source.matrixWorld.decompose(new THREE.Vector3(),new THREE.Quaternion(),scale);
        if(source.geometry.boundingSphere.radius*Math.max(scale.x,scale.y,scale.z)<.13)continue;
      }
      LAYERS.forEach((layer,i)=>{
        let mesh,material;
        if(source.isSprite){
          material=silhouette(new THREE.SpriteMaterial({...additive,color:COLORS[1],opacity:layer.opacity,map:original.map||null,alphaTest:Math.min(.5,original.alphaTest||.5)*.5,polygonOffset:true,polygonOffsetFactor:2+i,polygonOffsetUnits:2+i}),uniforms,layer.flame);
          mesh=new THREE.Sprite(material);mesh.scale.set(layer.scale,layer.scale*layer.stretch,1);mesh.position.y=-(layer.scale-1)*.12;
        }else{
          const radius=source.geometry.boundingSphere?.radius||.2;
          material=flameHull(new THREE.MeshBasicMaterial({...additive,color:COLORS[1],opacity:layer.opacity,side:THREE.BackSide}),uniforms,layer.flame,radius*.09);
          mesh=new THREE.Mesh(source.geometry,material);mesh.scale.set(1+(layer.scale-1)*.85,1+(layer.scale*layer.stretch-1)*.85,1+(layer.scale-1)*.85);
        }
        mesh.name='personal-body-outline';mesh.userData.haloPass=true;mesh.castShadow=mesh.receiveShadow=false;mesh.visible=false;mesh.renderOrder=source.renderOrder-1-i;mesh.frustumCulled=false;
        source.add(mesh);markBloom(material,1.6);outlines.push({source,mesh,material,base:layer.opacity});
      });
    }
  }
  // 3000배: 윤곽 위에 몸 전체의 붉은 기운(기존 효과)을 더한다.
  function buildTint(){
    if(tintBuilt||!person)return;tintBuilt=true;
    for(const source of bodyNodes()){
      const original=Array.isArray(source.material)?source.material[0]:source.material;if(!original)continue;
      const opts={...additive,color:0xff3838,opacity:.28,map:original.map||null,alphaTest:original.alphaTest||0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:THREE.DoubleSide};
      const material=source.isSprite?new THREE.SpriteMaterial(opts):new THREE.MeshBasicMaterial(opts);
      const mesh=source.isSprite?new THREE.Sprite(material):new THREE.Mesh(source.geometry,material);
      mesh.name='personal-body-glow';mesh.userData.haloPass=true;mesh.castShadow=mesh.receiveShadow=false;mesh.visible=false;mesh.renderOrder=source.renderOrder+.1;mesh.frustumCulled=false;
      source.add(mesh);markBloom(material,1.6);overlays.push({source,mesh,material});
    }
  }
  function follow(item){
    if(!item.source.isSprite)return;
    item.mesh.center.copy(item.source.center);item.material.rotation=item.source.material.rotation;
    if(item.material.map!==item.source.material.map){item.material.map=item.source.material.map;item.material.needsUpdate=true}
  }
  return{group,outlines,overlays,uniforms,update(until,now,t,reduced=false,level=1){
    const active=Number.isFinite(until)&&until>now&&until<=now+(level===2?7:3)*86400000,red=active&&level===2;
    group.visible=active;if(active)buildOutline();if(red)buildTint();
    // 불꽃처럼 빠르고 고르지 않게 깜빡인다(움직임 줄이기 설정이면 잔잔하게 멈춘다).
    const flicker=reduced?0:Math.sin(t*1.6)*.1+Math.sin(t*7.3)*.09+Math.sin(t*12.7+1.3)*.06,color=COLORS[red?2:1];
    uniforms.uBowTime.value=reduced?0:t;uniforms.uBowFlame.value=reduced?.25:FLAME[red?2:1];
    for(const item of outlines){item.mesh.visible=active;if(!active)continue;follow(item);item.material.color.setHex(color);item.material.opacity=Math.min(1,item.base*(red?1.35:1.1)*(1+flicker*(red?1.4:1)))}
    for(const item of overlays){item.mesh.visible=red;if(!red)continue;follow(item);item.material.opacity=.25+(reduced?0:Math.sin(t*1.4)*.045)}
  },dispose(){root.remove(group);for(const {source,mesh,material}of[...outlines,...overlays]){source.remove(mesh);material.dispose()}outlines.length=overlays.length=0}};
}
