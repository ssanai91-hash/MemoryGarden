import * as THREE from 'three';

// 사유의 방 반가사유상 2점을 기도 광장의 옛 불상·성모상 자리에 세운다.
// 원본: 국립중앙박물관 공개 3D 스캔(공공누리 제1유형). sayuRoom 저장소 GLB를 정원용으로 경량화했다
// (12만 → 약 8만 삼각형, 색·노멀 2048px, ORM 1024px — 3배 크기에 맞춘 고화질). 자세한 내용은 SAYU_STATUES_HANDOFF.md.
//
// 빠른 입장: 정원 화면은 불상을 기다리지 않는다. 받침대는 바로 세우고, 불상은 뒤에서 받아 나타난다.
// 한 번 받은 파일은 기기의 Cache Storage에 보관해 다음 입장부터 네트워크 없이 즉시 꺼낸다.
// 주소의 ?v=<내용 해시 8자>가 바뀌면 새 파일을 받고, 옛 버전은 보관함에서 지운다.
export const SAYU_STATUES=Object.freeze([
  Object.freeze({side:'left',url:'./assets/sayu-left-hq.glb?v=144e7b2f',label:'금동미륵보살반가사유상 (본관2789)'}),
  Object.freeze({side:'right',url:'./assets/sayu-right-hq.glb?v=a2f539ae',label:'금동미륵보살반가사유상 (덕수3312)'})
]);
export const SAYU_CACHE='garden-statues-v1';
// 실물 0.815/0.908m를 같은 배율로 키운다(약 8.3/9.3m). 받침대 윗면 위에 앉힌다.
export const SAYU_SCALE=10.2,SAYU_PEDESTAL_TOP=1.2;

async function cachedBytes(url){
  let cache=null;
  try{if(globalThis.caches&&/[?&]v=[0-9a-f]{8}/.test(url))cache=await caches.open(SAYU_CACHE)}catch(_){cache=null}
  if(cache){try{const hit=await cache.match(url);if(hit)return{bytes:await hit.arrayBuffer(),cached:true}}catch(_){}}
  const response=await fetch(url);
  if(!response.ok)throw new Error('응답 '+response.status+' '+url);
  const bytes=await response.arrayBuffer();
  if(cache){try{await cache.put(url,new Response(bytes.slice(0),{headers:{'Content-Type':'model/gltf-binary'}}))}catch(_){}}
  return{bytes,cached:false};
}
async function pruneCache(keep){
  try{if(!globalThis.caches)return;const cache=await caches.open(SAYU_CACHE),wanted=new Set(keep.map(u=>new URL(u,location.href).href));
    for(const req of await cache.keys())if(!wanted.has(req.url))await cache.delete(req)}catch(_){}
}

function plaqueTexture(){
  const c=document.createElement('canvas');c.width=1024;c.height=160;const p=c.getContext('2d');
  p.fillStyle='#4a4136';p.fillRect(0,0,1024,160);p.strokeStyle='#8a7c66';p.lineWidth=6;p.strokeRect(8,8,1008,144);
  p.fillStyle='#efe3c8';p.textAlign='center';p.font='bold 54px "Gowun Batang",serif';p.fillText('반가사유상',512,74);
  p.font='30px "Gowun Dodum",sans-serif';p.fillStyle='#d8caa8';p.fillText('3D 데이터 © 국립중앙박물관 · 공공누리 제1유형',512,124);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

// 불상 자체 조명: 박물관처럼 앞 위에서 비추는 따뜻한 주광과 뒤에서 윤곽을 잡는 푸른 테두리광.
// 장면에 실제 조명을 늘리면 정원의 모든 재질 셰이더가 무거워지므로, 불상 재질 안에서만 계산한다.
// 밤에 강해지고 낮에는 은은하게 남는다. 받침대 앞 두 등기구가 이 빛의 출처처럼 보이게 한다.
const KEY_DIR=new THREE.Vector3(-.32,.78,.54).normalize(),RIM_DIR=new THREE.Vector3(.25,.55,-.8).normalize();
const SAYU_LIGHT_GLSL=`
float sayuH=clamp((vSayuY-uSayuMinY)/max(uSayuMaxY-uSayuMinY,1e-4),0.,1.);
float sayuPool=mix(.5,1.15,smoothstep(.15,.92,sayuH));
float sayuKey=max(dot(normal,uSayuKeyDir),0.)*sayuPool;
float sayuFacing=max(dot(normal,normalize(vViewPosition)),0.);
float sayuRim=pow(1.-sayuFacing,2.6)*max(dot(normal,uSayuRimDir)+.35,0.);
totalEmissiveRadiance+=diffuseColor.rgb*uSayuKeyColor*(sayuKey*uSayuKey+.12*uSayuKey)+uSayuRimColor*sayuRim*uSayuRim;
`;
function addStatueLight(material,uniforms,minY,maxY){
  const own={uSayuMinY:{value:minY},uSayuMaxY:{value:maxY}};
  material.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,uniforms,own);
    sh.vertexShader='varying float vSayuY;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSayuY=position.y;');
    sh.fragmentShader='varying float vSayuY;uniform float uSayuMinY,uSayuMaxY,uSayuKey,uSayuRim;uniform vec3 uSayuKeyDir,uSayuRimDir,uSayuKeyColor,uSayuRimColor;\n'+
      sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n'+SAYU_LIGHT_GLSL);
  };
  material.customProgramCacheKey=()=>'sayu-statue-light';
  material.needsUpdate=true;
}

export function createSayuStatues({scene,GLTFLoader,spots,floor,stone,obstacles,markBloom=m=>m,onState=()=>{}}){
  const light={uSayuKey:{value:.2},uSayuRim:{value:.05},uSayuKeyDir:{value:KEY_DIR.clone()},uSayuRimDir:{value:RIM_DIR.clone()},
    uSayuKeyColor:{value:new THREE.Color(0xffd7a0).convertSRGBToLinear()},uSayuRimColor:{value:new THREE.Color(0xa9c3ff).convertSRGBToLinear()}};
  const lens=markBloom(new THREE.MeshStandardMaterial({color:0xfff0d0,emissive:0xffc77a,emissiveIntensity:.3,roughness:.4}),1.5);
  const housing=new THREE.MeshStandardMaterial({color:0x2c2a26,roughness:.55,metalness:.6});
  const HOUSING=new THREE.CylinderGeometry(.16,.2,.34,16),LENS=new THREE.CircleGeometry(.14,20);
  const root=new THREE.Group();root.name='sayu-statues';scene.add(root);
  const state={loaded:0,cached:0,error:null,ready:null};
  const plaque=new THREE.MeshBasicMaterial({map:plaqueTexture(),toneMapped:false});
  const holders=spots.map((spot,i)=>{
    const g=new THREE.Group();g.name='sayu-'+SAYU_STATUES[i].side;g.position.set(spot.x,floor,spot.z);root.add(g);
    // 두 단 돌 받침대. 앞면에 출처 명판을 붙인다.
    const lower=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.3,.45,56),stone(0xa59d8f));lower.position.y=.225;
    const upper=new THREE.Mesh(new THREE.CylinderGeometry(2.55,2.75,.75,56),stone(0xbab3a5));upper.position.y=.825;
    for(const m of[lower,upper]){m.castShadow=m.receiveShadow=true;g.add(m)}
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.4,.375),plaque);sign.position.set(0,.82,2.71);sign.rotation.x=-.07;g.add(sign);
    // 받침대 아랫단 앞쪽 두 등기구: 불상 얼굴 쪽을 향해 기울어 있다.
    for(const sx of[-1,1]){
      const f=new THREE.Group();f.position.set(sx*1.55,.45,2.55);f.rotation.set(-.65,sx*.35,0);g.add(f);
      const body=new THREE.Mesh(HOUSING,housing);body.rotation.x=Math.PI/2;body.position.z=-.05;body.castShadow=true;f.add(body);
      const glass=new THREE.Mesh(LENS,lens);glass.position.z=.125;f.add(glass);
    }
    obstacles.push({x:spot.x,z:spot.z,r:3.2});
    return g;
  });

  function place(gltf,holder){
    const model=gltf.scene;model.scale.setScalar(SAYU_SCALE);
    const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3());
    model.position.set(-center.x,SAYU_PEDESTAL_TOP-box.min.y,-center.z);
    model.traverse(n=>{
      if(!n.isMesh)return;n.castShadow=n.receiveShadow=true;
      const m=n.material;
      for(const t of[m&&m.map,m&&m.normalMap])if(t)t.anisotropy=8;
      if(m&&m.isMeshStandardMaterial){
        if(!n.geometry.boundingBox)n.geometry.computeBoundingBox();const b=n.geometry.boundingBox;
        m.envMapIntensity=1.1;addStatueLight(m,light,b.min.y,b.max.y);
      }
    });
    holder.add(model);
  }

  async function loadOne(item,holder){
    const {bytes,cached}=await cachedBytes(item.url);
    const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(bytes,'',resolve,reject));
    place(gltf,holder);state.loaded++;if(cached)state.cached++;onState(state);
  }
  // 첫 화면 그리기를 먼저 끝내고 받는다. 보관함에 있으면 곧바로, 없으면 하나씩 차례로 받는다.
  state.ready=new Promise(r=>setTimeout(r,300)).then(async()=>{
    for(let i=0;i<SAYU_STATUES.length;i++){
      try{await loadOne(SAYU_STATUES[i],holders[i])}catch(e){state.error=String(e&&e.message||e);onState(state)}
    }
    pruneCache(SAYU_STATUES.map(s=>s.url));
    return state;
  });
  const keyView=new THREE.Vector3(),rimView=new THREE.Vector3();
  // night 0(낮)~1(밤). 빛 방향은 카메라 기준으로 바꿔 셰이더에 넘긴다.
  function update(night,camera){
    const n=Math.min(1,Math.max(0,night||0));
    light.uSayuKey.value=.2+n*1.05;light.uSayuRim.value=.05+n*.38;lens.emissiveIntensity=.3+n*2.4;
    if(camera){camera.updateMatrixWorld();light.uSayuKeyDir.value.copy(keyView.copy(KEY_DIR).transformDirection(camera.matrixWorldInverse));
      light.uSayuRimDir.value.copy(rimView.copy(RIM_DIR).transformDirection(camera.matrixWorldInverse))}
  }
  return{root,holders,state,update,light};
}
