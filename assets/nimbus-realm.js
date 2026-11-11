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

// 단일 정원 안에 붙이는 양각 반신상 + 입체 팔·손바닥. 뒤쪽은 플레이 공간이 없다.
export function createBuddhaRealm({scene,markBloom=m=>m,onError=()=>{}}){
  const root=new THREE.Group();root.name='great-buddha-garden-boundary';scene.add(root);
  const stone=new THREE.MeshStandardMaterial({color:0xe5cba2,roughness:.84,metalness:.015,
    emissive:0xe1c8a0,emissiveIntensity:.24,fog:false});
  const sleeve=stone.clone();sleeve.color.setHex(0xdac29d);
  const crease=new THREE.MeshStandardMaterial({color:0xb39a76,roughness:1,emissive:0x8b7353,emissiveIntensity:.14,fog:false});
  const body=new THREE.Group();body.position.set(L.x,4,L.boundaryZ);root.add(body);
  // 얼굴과 법의의 원화는 유지하고, 표면을 약 7m 돌출시킨 높이 필드 양각.
  new THREE.TextureLoader().load('./assets/great-buddha-relief.png',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
    const nx=96,ny=144,c=document.createElement('canvas');c.width=nx+1;c.height=ny+1;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(texture.image,0,0,c.width,c.height);
    const data=ctx.getImageData(0,0,c.width,c.height).data,vertices=[],uv=[],indices=[];
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const u=i/nx,v=1-j/ny,k=(j*(nx+1)+i)*4,lum=(data[k]*.2126+data[k+1]*.7152+data[k+2]*.0722)/255;
      const center=Math.sqrt(Math.max(0,1-((u-.5)/.52)**2));
      const profile=2.4+3.6*center+Math.exp(-(((v-.68)/.15)**2))*center;
      vertices.push((u-.5)*L.width,v*L.height,profile+lum*.8);uv.push(u,v);
    }
    const solid=k=>data[k*4+3]>180;
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
      const a=j*(nx+1)+i,b=a+1,d=a+nx+1,e=d+1;
      if(solid(a)&&solid(d)&&solid(b))indices.push(a,d,b);
      if(solid(b)&&solid(d)&&solid(e))indices.push(b,d,e);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const material=new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:0xffffff,
      emissiveIntensity:.42,roughness:.93,metalness:0,alphaTest:.7,side:THREE.DoubleSide,fog:false});
    const relief=new THREE.Mesh(geometry,material);relief.name='great-buddha-raised-relief';relief.frustumCulled=false;body.add(relief);
    root.userData.reliefReady=true;
  },undefined,()=>{root.userData.reliefError=true;onError()});
  // 오른쪽 어깨(보는 쪽 왼쪽)에서 손목으로. 손은 두 불상 위로 내민다.
  stroke(root,[[L.x-27,70,L.boundaryZ+5],[L.x-34,47,-91],[L.x-15,33,-77],[L.x,35,-73]],6.1,sleeve,48);
  stroke(root,[[L.x-29,66,L.boundaryZ+11],[L.x-29,46,-87],[L.x-12,36,-76]],.16,crease,40);
  const palm=new THREE.Group();palm.name='great-buddha-open-palm';palm.position.set(L.x,L.y,L.z);root.add(palm);
  oval(palm,stone,0,-2.65,0,21,2.65,17);oval(palm,stone,0,-3.4,-16,8,3.3,10);
  for(let i=0;i<4;i++){
    const x=-11.6+i*7.4,len=[12,17,16,12][i];
    stroke(palm,[[x,-3,10],[x,-2.8,18],[x+.2,-2.1,18+len*.55],[x+.3,-1,18+len]],3.25,stone,32);
    oval(palm,stone,x+.3,-1,18+len,3.25,3.25,3.25);
    for(const z of[19,24])stroke(palm,[[x-2.2,-.2,z],[x,.4,z+.6],[x+2.2,-.2,z]],.065,crease,12);
  }
  const thumb=oval(palm,stone,-20,-1.7,-1,9,3.1,4.8);thumb.rotation.y=-.72;
  stroke(palm,[[-13,-.05,4],[-7,.06,-2],[3,.05,-5],[12,-.05,-1]],.065,crease);
  stroke(palm,[[-10,-.05,-6],[-2,.06,-9],[9,-.05,-7]],.055,crease);
  // 구름 바다는 확장부의 바닥을 감싸며 54개 형상을 한 번에 그린다.
  const cloudMat=new THREE.MeshStandardMaterial({color:0xece4ed,roughness:1,emissive:0xc0b6cf,emissiveIntensity:.23,fog:false});
  const banks=new THREE.InstancedMesh(new THREE.SphereGeometry(1,16,10),cloudMat,54),dummy=new THREE.Object3D();
  banks.name='nimbus-cloud-sea';banks.frustumCulled=false;root.add(banks);
  for(let i=0;i<54;i++){
    const a=i*2.39996,r=23+(i%7)*5.8;
    dummy.position.set(L.x+Math.cos(a)*r,18+(i%4)*2,L.z+Math.sin(a)*r*.72);
    dummy.scale.set(10+(i%5)*2.6,3+(i%3),8+(i%4)*2);dummy.updateMatrix();banks.setMatrixAt(i,dummy.matrix);
  }
  const haloMat=markBloom(new THREE.MeshBasicMaterial({color:0xffe5b0,transparent:true,opacity:.52,fog:false,depthWrite:false}),.65);
  for(const radius of[23.5,24.1]){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(radius,.085,6,128),haloMat);
    ring.position.set(L.x,94,L.boundaryZ+1);ring.name='great-buddha-halo';root.add(ring);
  }
  const boundary=new THREE.Mesh(new THREE.PlaneGeometry(L.width+10,10,48,2),stone);
  boundary.position.set(L.x,-.8,L.boundaryZ+2);root.add(boundary);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(L.width,.18,.3),stone);edge.position.set(L.x,.1,L.gateZ);root.add(edge);
  const rayFloor=new THREE.Mesh(new THREE.PlaneGeometry(L.rx*2,L.rz*2),new THREE.MeshBasicMaterial({visible:false}));
  rayFloor.rotation.x=-Math.PI/2;rayFloor.position.set(L.x,L.y+1.05,L.z);root.add(rayFloor);
  return{scene,root,rayFloor,update(t,reduced=false){banks.position.y=reduced?0:Math.sin(t*.13)*.17}};
}
