import * as THREE from 'three';

// 원형 광배 + 위로 타오르는 빛. 왼쪽 백색/은빛, 오른쪽 진홍색.
// 불상 뒤쪽 반원형 막에만 불꽃을 그린다. 앞면을 덮는 스프라이트·실제 조명은 추가하지 않는다.
const VERTEX=`
varying vec2 vAuraUv;
varying vec3 vAuraPosition;
void main(){
  vAuraUv=uv;vAuraPosition=position;
  vec3 transformed=position;
  #include <project_vertex>
}`;
const COMMON=`
uniform float uTime,uStrength;
uniform vec3 uCore,uEdge,uAccent;
varying vec2 vAuraUv;
varying vec3 vAuraPosition;
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise21(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),
    mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
}
`;
const OUTPUT=`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const FLAME=COMMON+`
void main(){
  vec2 uv=vAuraUv;float t=uTime;
  // 천천히 상승하는 두 겹의 흐름. 밝은 불꽃 심과 반투명 가장자리를 나눈다.
  float flow=noise21(vec2(uv.x*8.5,uv.y*5.2-t*.38));
  float detail=noise21(vec2(uv.x*19.+flow,uv.y*10.-t*.63));
  float bend=sin(uv.y*10.-t*.72)*.25+sin(uv.y*19.+t*.47)*.11+(flow-.5)*.65;
  float strand=abs(fract(uv.x*8.+bend)-.5);
  float width=mix(.16,.035,smoothstep(.2,1.,uv.y));
  float veil=exp(-strand*strand/(width*width))*(.45+.55*detail);
  float filament=exp(-strand*strand/.0009);
  float secondary=abs(fract(uv.x*13.-bend*.7+uv.y*.8)-.5);
  float thread=exp(-secondary*secondary/.0015)*.26;
  float tip=.78+.19*sin(uv.x*29.+flow*2.5)+.06*sin(t*.4+uv.x*14.);
  float fade=smoothstep(0.,.12,uv.y)*(1.-smoothstep(tip-.15,tip,uv.y));
  fade*=smoothstep(0.,.045,uv.x)*(1.-smoothstep(.955,1.,uv.x));
  float energy=(veil*.34+filament*.52+thread)*fade;
  if(energy<.007)discard;
  vec3 edge=mix(uEdge,uAccent,.5+.5*sin(uv.y*5.+t*.16));
  vec3 color=mix(edge,uCore,clamp(filament*.8+veil*.34,0.,1.));
  gl_FragColor=vec4(color*1.45,clamp(energy*uStrength,0.,.82));
`+OUTPUT+`}`;
const HALO=COMMON+`
uniform float uHaloStrength;
uniform vec3 uHaloColor;
void main(){
  float r=length(vAuraPosition.xy),angle=atan(vAuraPosition.y,vAuraPosition.x);
  // 실선 발광관을 주광으로 삼는다. 기존 가는 선은 낮/먼 거리에서 거의 사라졌다.
  float aa=max(fwidth(r),.001),d=abs(r-.94);
  float tube=1.-smoothstep(.022,.022+aa,d);
  float inner=1.-smoothstep(.006,.006+aa,abs(r-.845));
  float outer=1.-smoothstep(.006,.006+aa,abs(r-1.035));
  float glow=exp(-pow(d/.042,2.))*.18;
  glow+=exp(-pow((r-1.035)/.025,2.))*.07;
  // 발광관은 항상 켜 두고 주위 빛만 천천히 숨 쉬듯 흐르게 한다.
  float breath=.95+.05*sin(uTime*.65);
  float sweep=.5+.5*sin(angle*2.-uTime*.32);
  float alpha=clamp(tube+inner*.72+outer*.72+glow*breath,0.,1.);
  if(alpha<.003)discard;
  float hot=exp(-pow(d/.009,2.));
  vec3 color=mix(uHaloColor,uCore,hot*.22);
  float radiance=(2.3+tube*.7+hot*.3+glow*sweep*.18)*uHaloStrength;
  gl_FragColor=vec4(color*radiance,alpha);
`+OUTPUT+`}`;
const POOL=COMMON+`
void main(){
  float r=length(vAuraPosition.xy);
  float a=exp(-pow((r-.85)*16.,2.))*.12;
  a*=uStrength*(.92+.08*sin(uTime*.7));
  if(a<.003)discard;
  gl_FragColor=vec4(uEdge,a);
`+OUTPUT+`}`;
const EMBER_VERTEX=`
uniform float uTime,uStrength,uHeight,uRadius,uDepth;
attribute vec4 auraSeed;
varying float vLife,vTwinkle;
void main(){
  float age=fract(auraSeed.x+uTime*(.028+auraSeed.y*.016));
  float angle=auraSeed.z*3.14159265;
  float r=uRadius*(.88+.1*sin(age*9.+auraSeed.w*6.));
  vec3 transformed=vec3(cos(angle)*r,age*uHeight*1.2,
    -sin(angle)*uDepth-.35);
  transformed.x+=sin(age*12.+auraSeed.w*17.)*.17;
  vLife=smoothstep(0.,.1,age)*(1.-smoothstep(.78,1.,age))*uStrength;
  vTwinkle=.6+.4*sin(uTime*(1.+auraSeed.y)+auraSeed.w*37.);
  #include <project_vertex>
  gl_PointSize=clamp((2.+auraSeed.w*3.)*16./max(1.,-mvPosition.z),1.,10.);
}`;
const EMBER_FRAGMENT=`
uniform vec3 uCore,uEdge;
varying float vLife,vTwinkle;
void main(){
  vec2 p=gl_PointCoord-.5;float r=length(p);
  if(r>.5)discard;
  float a=exp(-r*r*25.)*vLife*vTwinkle;
  gl_FragColor=vec4(mix(uEdge,uCore,exp(-r*r*65.))*1.6,a*.72);
`+OUTPUT+`}`;

function material(fragment,uniforms,markBloom,vertex=VERTEX){
  const m=new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,
    transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
  // 이미 선형 RGB이므로 후처리에서 기존 raw shader 색 변환을 다시 적용하지 않는다.
  m.userData.gardenPostLinear=true;markBloom(m,.95);return m;
}
function flameGeometry(){
  const columns=48,rows=56,positions=[],uv=[],indices=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
    const u=x/columns,v=y/rows,angle=u*Math.PI;
    const radius=.34+.065*Math.sin(v*Math.PI)+.025*v;
    positions.push(Math.cos(angle)*radius,v*1.22,-Math.sin(angle)*.19-.035);
    uv.push(u,v);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const a=y*(columns+1)+x,b=a+columns+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeBoundingSphere();return g;
}
function emberGeometry(){
  const count=88,seeds=new Float32Array(count*4);
  // 고정 분포와 GPU 이동으로 매 프레임 CPU 배열 갱신을 피한다.
  for(let i=0;i<count;i++){
    seeds[i*4]=(i*.61803398875)%1;seeds[i*4+1]=(i*.41421356237)%1;
    seeds[i*4+2]=(i+.5)/count;seeds[i*4+3]=(i*.754877666)%1;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
  g.setAttribute('auraSeed',new THREE.BufferAttribute(seeds,4));return g;
}

export function createStatueAura(holder,side,markBloom=m=>m){
  const red=side==='right',root=new THREE.Group();root.name='sayu-aura-'+side;root.visible=false;holder.add(root);
  const uniforms={uTime:{value:red?13:0},uStrength:{value:.5},uHeight:{value:9},uRadius:{value:3.2},uDepth:{value:1.7},
    uHaloStrength:{value:1},uHaloColor:{value:new THREE.Color(red?0xff2345:0xf0f6ff)},
    uCore:{value:new THREE.Color(red?0xffbac0:0xf7f7ff)},
    uEdge:{value:new THREE.Color(red?0xf92249:0x98bdff)},
    uAccent:{value:new THREE.Color(red?0xa40c35:0xc5b7ff)}};
  const flames=new THREE.Mesh(flameGeometry(),material(FLAME,uniforms,markBloom));
  markBloom(flames.material,.42);
  const haloMaterial=material(HALO,uniforms,markBloom);
  // 실선은 투명한 가는 빛 대신 또렷한 LED 발광면으로, 번짐은 기존 블룸과 함께 표현한다.
  haloMaterial.blending=THREE.NormalBlending;markBloom(haloMaterial,.35);
  const halo=new THREE.Mesh(new THREE.RingGeometry(.62,1.28,192,6),haloMaterial);
  const pool=new THREE.Mesh(new THREE.RingGeometry(.55,1.1,80,1),material(POOL,uniforms,markBloom));pool.rotation.x=-Math.PI/2;
  const embers=new THREE.Points(emberGeometry(),material(EMBER_FRAGMENT,uniforms,markBloom,EMBER_VERTEX));
  // 셰이더에서 이동하는 입자를 원본의 영점 좌표로 잘못 숨기지 않는다.
  embers.frustumCulled=false;
  root.add(flames,halo,pool,embers);
  const bounds=new THREE.Sphere(),center=new THREE.Vector3(),box=new THREE.Box3();
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  let ready=false,height=9;
  return{
    root,
    fit(model){
      // holder에 넣기 전 모델의 배치 치수를 읽어 미리보기·고화질 교체에 맞춘다.
      box.setFromObject(model);height=box.max.y-box.min.y;
      if(!Number.isFinite(height)||height<=0)return;
      const total=box.max.y;
      flames.scale.setScalar(total);flames.position.y=.06;
      // 뒤쪽 광배가 가슴 높이로 내려가 보이지 않도록 중심을 머리 뒤로 올린다.
      halo.scale.setScalar(height*.245);halo.position.set(0,box.min.y+height*.94,box.min.z-.22);
      pool.scale.setScalar(Math.max(3.4,(box.max.x-box.min.x)*.65));pool.position.y=.075;
      uniforms.uHeight.value=total;uniforms.uRadius.value=total*.365;uniforms.uDepth.value=total*.19;
      ready=true;
    },
    update(night,camera){
      if(!ready)return;
      // 정원 최대 곡률을 포함한 넓은 구로 화면 밖을 숨긴다. 먼 거리의 입자는 먼저 끈다.
      holder.getWorldPosition(center);center.y+=height*.55;
      const distance=camera?camera.position.distanceTo(center):0;
      let visible=holder.visible&&distance<115;
      if(camera&&visible){
        projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
        bounds.set(center,height*.85+6);visible=frustum.intersectsSphere(bounds);
      }
      root.visible=visible;if(!visible)return;
      uniforms.uStrength.value=.45+Math.min(1,Math.max(0,night||0))*.34;
      // 밤에는 정원 블룸이 강해지므로 발광관 자체를 조금 낮춰 얼굴 앞 눈부심을 막는다.
      uniforms.uHaloStrength.value=1-Math.min(1,Math.max(0,night||0))*.12;
      uniforms.uTime.value=reduced?.matches?(red?13:0):performance.now()*.001+(red?13:0);
      embers.visible=!reduced?.matches&&distance<65;
    }
  };
}
