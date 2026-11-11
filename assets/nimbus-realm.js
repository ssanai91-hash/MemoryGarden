import * as THREE from 'three';
import './prayer-rules.js';
const L=globalThis.GardenPrayer.NIMBUS_LAYOUT;
const sphere=new THREE.SphereGeometry(1,24,16);
const cream=new THREE.MeshStandardMaterial({color:0xfff6e5,roughness:.9,emissive:0xe4cfa5,emissiveIntensity:.18});
const gold=new THREE.MeshBasicMaterial({color:0xf4d99e,transparent:true,opacity:.68,depthWrite:false,fog:false});
function oval(parent,material,x,y,z,sx,sy,sz){
  const m=new THREE.Mesh(sphere,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
}
function stroke(parent,points,r,material,segments=32){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,r,6,false),material);parent.add(mesh);return mesh;
}
export function createNimbus(){
  const g=new THREE.Group();g.name='earned-nimbus';
  // 2.7m의 평평한 윗면은 기존 오체투지 동작 전체를 받친다.
  for(const p of [[0,-.26,0,1.35,.25,1.15],[-.94,-.27,.1,.6,.35,.66],[.94,-.27,.1,.6,.35,.66],
    [-.52,-.23,.82,.66,.29,.58],[.54,-.23,.82,.66,.29,.58],[0,-.24,-.8,.92,.27,.6],
    [0,-.46,.05,1.13,.18,.95],[.1,-.36,-1.38,.63,.2,.55],[.35,-.23,-1.7,.37,.22,.37]])oval(g,cream,...p);
  for(const side of[-1,1]){
    const points=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2.1,r=.3*(1-i/38);points.push([side*(.95+Math.cos(a)*r),-.25+Math.sin(a)*r,.64])}
    stroke(g,points,.012,gold);
  }
  const rim=new THREE.Mesh(new THREE.TorusGeometry(1.13,.012,5,64),gold);rim.rotation.x=Math.PI/2;rim.scale.y=.85;rim.position.y=-.3;g.add(rim);
  g.traverse(n=>{n.castShadow=n.receiveShadow=false});return g;
}

// 단일 정원 안의 흰 양각 반신상과 몸 가까이 들어 올린 상징적인 수인.
export function createBuddhaRealm({scene,markBloom=m=>m,onError=()=>{}}){
  const root=new THREE.Group();root.name='great-buddha-garden-boundary';scene.add(root);
  // 시안의 흰 석조: 낮·밤에도 황금색/갈색으로 묻히지 않도록 중성 보조 발광을 쓴다.
  const stone=new THREE.MeshStandardMaterial({color:0xfafcff,roughness:.9,metalness:0,
    emissive:0xe8edf7,emissiveIntensity:.42,fog:false});
  const body=new THREE.Group();body.position.set(L.x,4,L.boundaryZ);root.add(body);
  // 성인 비례의 손·손목·팔을 몸통과 같은 흰 석조 원화에 통합한다.
  // 납작한 도형 손을 덧붙이지 않고 원화의 손가락 관절·엄지 볼륨·법의 연결을 그대로 사용한다.
  new THREE.TextureLoader().load('./assets/great-buddha-mudra-v2.png',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const nx=128,ny=192,c=document.createElement('canvas');c.width=nx+1;c.height=ny+1;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(texture.image,0,0,c.width,c.height);
    const data=ctx.getImageData(0,0,c.width,c.height).data,vertices=[],uv=[],indices=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=1-j/ny,k=(j*(nx+1)+i)*4,lum=(data[k]*.2126+data[k+1]*.7152+data[k+2]*.0722)/255;
      const center=Math.sqrt(Math.max(0,1-((u-.5)/.52)**2));
      const profile=2.4+3.6*center+Math.exp(-(((v-.68)/.15)**2))*center;
      vertices.push((u-.5)*L.width,v*L.height,(profile+lum*.8)*.8);uv.push(u,v);
    }
    const solid=k=>data[k*4+3]>180;
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,d=a+nx+1,e=d+1;
      if(solid(a)&&solid(d)&&solid(b))indices.push(a,d,b);
      if(solid(b)&&solid(d)&&solid(e))indices.push(b,d,e);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    // 이미 흰 원화의 명암을 보존해 과도한 밝기 보정으로 손의 입체감이 사라지지 않게 한다.
    const material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,
      emissiveIntensity:.42,roughness:.93,metalness:0,alphaTest:.7,side:THREE.DoubleSide,fog:false});
    const relief=new THREE.Mesh(geometry,material);relief.name='great-buddha-raised-relief';relief.frustumCulled=false;body.add(relief);
    root.userData.reliefReady=true;
  },undefined,()=>{root.userData.reliefError=true;onError()});
  // 구름은 공중 수행 영역 아래·뒤에만 둔다. 앞쪽 광장이나 부처님 얼굴을 덮지 않는다.
  const cloudMat=new THREE.MeshStandardMaterial({color:0xe9efff,roughness:1,emissive:0xcbd7ee,emissiveIntensity:.23,fog:false});
  const banks=new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,10),cloudMat,54),dummy=new THREE.Object3D();
  banks.name='nimbus-cloud-sea';banks.frustumCulled=false;root.add(banks);
  for(let i=0;i<54;i++){
    const a=i/53*Math.PI,r=23+(i%7)*5.8;
    dummy.position.set(L.x+Math.cos(a)*r,8+(i%4)*1.2,L.z-24-Math.sin(a)*r*.6);
    dummy.scale.set(10+(i%5)*2.6,2+(i%3)*.6,8+(i%4)*2);dummy.updateMatrix();banks.setMatrixAt(i,dummy.matrix);
  }
  const haloMat=markBloom(new THREE.MeshBasicMaterial({color:0xffe5b0,transparent:true,opacity:.52,fog:false,depthWrite:false}),.65);
  for(const radius of[23.5,24.1]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius*.8,.068,6,128),haloMat);
    ring.position.set(L.x,76,L.boundaryZ+1);ring.name='great-buddha-halo';root.add(ring);
  }
  const boundary=new THREE.Mesh(new THREE.PlaneGeometry(L.width+10,10,48,2),stone);
  boundary.position.set(L.x,-.8,L.boundaryZ+2);root.add(boundary);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(L.width,.18,.3),stone);edge.position.set(L.x,.1,L.gateZ);root.add(edge);
  const rayFloor=new THREE.Mesh(new THREE.PlaneGeometry(L.rx*2,L.rz*2/Math.cos(L.palmTilt)),new THREE.MeshBasicMaterial({visible:false}));
  rayFloor.rotation.x=-Math.PI/2+L.palmTilt;rayFloor.position.set(L.x,L.y+1.05,L.z);root.add(rayFloor);
  return{scene,root,rayFloor,update(t,reduced=false){banks.position.y=reduced?0:Math.sin(t*.13)*.17}};
}
