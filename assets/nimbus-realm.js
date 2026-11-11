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
// 어깨·팔꿈치·손목의 굵기를 이어서 일정 굵기의 관처럼 보이지 않게 한다.
function sculptedLimb(parent,points,radii,material,segments=48){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geometry=new THREE.TubeGeometry(curve,segments,1,12,false),positions=geometry.attributes.position;
  for(let i=0;i<=segments;i++){
    const t=i/segments,center=curve.getPointAt(t),part=t*(radii.length-1),k=Math.min(radii.length-2,Math.floor(part));
    const radius=THREE.MathUtils.lerp(radii[k],radii[k+1],part-k);
    for(let j=0;j<=12;j++){
      const n=i*13+j;
      positions.setXYZ(n,center.x+(positions.getX(n)-center.x)*radius,center.y+(positions.getY(n)-center.y)*radius,center.z+(positions.getZ(n)-center.z)*radius);
    }
  }
  geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);parent.add(mesh);return mesh;
}
function createBlessingHand(stone,crease){
  const hand=new THREE.Group();hand.name='great-buddha-blessing-hand';
  // 몸 비례에 맞춘 얇은 손: 둥근 손목에서 손가락 뿌리까지 하나의 윤곽으로 잇는다.
  const outline=new THREE.Shape();outline.moveTo(-1.25,-1.2);
  outline.bezierCurveTo(-1.7,.1,-2.65,1.6,-2.7,3.8);
  outline.bezierCurveTo(-2.75,4.8,-2.4,5.2,-1.9,5.3);
  outline.bezierCurveTo(-.4,5.65,1.25,5.55,2.1,5.1);
  outline.bezierCurveTo(2.8,4.6,2.75,2.8,2.2,1.3);
  outline.bezierCurveTo(1.8,.3,1.5,-.6,1.25,-1.2);outline.closePath();
  const geometry=new THREE.ExtrudeGeometry(outline,{depth:1.1,bevelEnabled:true,bevelSize:.32,bevelThickness:.35,bevelSegments:4,steps:1,curveSegments:12});
  geometry.translate(0,0,-.55);hand.add(new THREE.Mesh(geometry,stone));
  const fingers=[[-2.05,4.65,8.55,.53,-.16],[-.72,5.05,10.2,.62,-.06],[.7,5.08,10.9,.65,.05],[2.02,4.65,10,.59,.12]];
  for(const [x,start,end,r,lean] of fingers){
    sculptedLimb(hand,[[x,start,0],[x+lean*.4,(start+end)*.5,.1],[x+lean,end,.24]],[r,r*.94,r*.75],stone,20);
    oval(hand,stone,x+lean,end,.24,r*.75,r*.86,r*.75);
  }
  // 엄지는 손바닥 옆에서 완만히 굽힌다. 손가락을 크게 벌리거나 앞으로 내밀지 않는다.
  sculptedLimb(hand,[[2,1.7,.05],[3.25,2.55,.12],[4.05,4.3,.22]],[.9,.73,.52],stone,24);
  oval(hand,stone,4.05,4.3,.22,.52,.65,.52);
  stroke(hand,[[-1.8,3,.93],[-.6,2.55,1.02],[.8,2.75,1.01],[1.7,3.55,.92]],.035,crease,18);
  stroke(hand,[[1.8,1.6,.9],[1.1,2.2,1.02],[1.15,3.5,.99]],.03,crease,14);
  return hand;
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
  const sleeve=stone.clone();sleeve.color.setHex(0xf3f6fc);
  const crease=new THREE.MeshStandardMaterial({color:0xccd3df,roughness:1,emissive:0xacb5c4,emissiveIntensity:.25,fog:false});
  const body=new THREE.Group();body.position.set(L.x,4,L.boundaryZ);root.add(body);
  // 얼굴·법의 명암과 투명 실루엣을 보존한 흰 양각. 원화의 누런 색은 표면과 발광 모두에서 뺀다.
  new THREE.TextureLoader().load('./assets/great-buddha-relief.png',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const nx=96,ny=144,c=document.createElement('canvas');c.width=nx+1;c.height=ny+1;
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
    const whiteCanvas=document.createElement('canvas');whiteCanvas.width=texture.image.width;whiteCanvas.height=texture.image.height;
    const whiteCtx=whiteCanvas.getContext('2d');whiteCtx.drawImage(texture.image,0,0);
    const whitePixels=whiteCtx.getImageData(0,0,whiteCanvas.width,whiteCanvas.height),rgba=whitePixels.data;
    for(let k=0;k<rgba.length;k+=4){
      const light=Math.min(255,Math.round((rgba[k]*.2126+rgba[k+1]*.7152+rgba[k+2]*.0722)*1.18));
      rgba[k]=rgba[k+1]=rgba[k+2]=light;
    }
    whiteCtx.putImageData(whitePixels,0,0);
    const whiteTexture=new THREE.CanvasTexture(whiteCanvas);whiteTexture.colorSpace=THREE.SRGBColorSpace;whiteTexture.anisotropy=4;texture.dispose();
    const material=new THREE.MeshStandardMaterial({map:whiteTexture,emissiveMap:whiteTexture,emissive:0xffffff,
      emissiveIntensity:.6,roughness:.93,metalness:0,alphaTest:.7,side:THREE.DoubleSide,fog:false});
    const relief=new THREE.Mesh(geometry,material);relief.name='great-buddha-raised-relief';relief.frustumCulled=false;body.add(relief);
    root.userData.reliefReady=true;
  },undefined,()=>{root.userData.reliefError=true;onError()});
  // 시무외인: 오른팔을 몸 옆에서 굽혀 손을 가슴 가까이 세운다. 전방의 거대한 손바닥은 제거한다.
  const bz=L.boundaryZ;
  sculptedLimb(root,[[L.x-22,54,bz+4],[L.x-26,40,bz+7],[L.x-23,30,bz+9]],[4.6,4.1,3.5],sleeve);
  sculptedLimb(root,[[L.x-23,30,bz+9],[L.x-19,37,bz+11],[L.x-17,48,bz+12]],[3.5,2.8,1.65],stone);
  oval(root,sleeve,L.x-23,30,bz+9,3.5,3.8,3.4);
  const hand=createBlessingHand(stone,crease);hand.position.set(L.x-17,48,bz+12);hand.rotation.set(-.08,-.15,-.06);root.add(hand);
  // 반대쪽 팔은 법의 옆으로 내려와 복부 앞에 편안하게 모은다.
  sculptedLimb(root,[[L.x+23,53,bz+4],[L.x+26,35,bz+6],[L.x+21,22,bz+9],[L.x+12,18,bz+11]],[4.5,4,3.3,1.65],sleeve,56);
  const restingHand=createBlessingHand(stone,crease);restingHand.name='great-buddha-resting-hand';
  restingHand.position.set(L.x+12,18,bz+11);restingHand.scale.setScalar(.85);restingHand.rotation.set(-.2,.1,Math.PI/2+.12);root.add(restingHand);
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
