import * as THREE from 'three';
import './prayer-rules.js';
const Prayer=globalThis.GardenPrayer;

// Small radial faces follow the same curved-world shader as the grass. A single
// triangle fan bends below the subdivided ground in its middle as the camera moves.
export function pavedDisk(radius,sectors=96){
  const rings=Math.ceil(radius*2),positions=[0,0,0],uv=[.5,.5],indices=[];
  for(let j=1;j<=rings;j++)for(let i=0;i<sectors;i++){const a=i/sectors*Math.PI*2,r=radius*j/rings;positions.push(Math.cos(a)*r,0,Math.sin(a)*r);uv.push(.5+Math.cos(a)*j/rings*.5,.5-Math.sin(a)*j/rings*.5)}
  for(let i=0;i<sectors;i++)indices.push(0,1+(i+1)%sectors,1+i);
  for(let j=1;j<rings;j++)for(let i=0;i<sectors;i++){const a=1+(j-1)*sectors+i,b=1+(j-1)*sectors+(i+1)%sectors,c=1+j*sectors+i,d=1+j*sectors+(i+1)%sectors;indices.push(a,b,c,b,d,c)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function makePrayerGarden({scene,stone,markBloom,obstacles,pointLight=(color,intensity,range)=>new THREE.PointLight(color,intensity,range,2)}){
  const L=Prayer.LAYOUT,group=new THREE.Group();group.name='prayer-square';scene.add(group);
  const tiles=document.createElement('canvas');tiles.width=tiles.height=512;const paint=tiles.getContext('2d');paint.fillStyle='#a29886';paint.fillRect(0,0,512,512);
  const palette=['#c9c0ae','#c2b9a7','#d0c7b6','#c5bcaa'];for(let row=0;row<12;row++)for(let col=0;col<16;col++){paint.fillStyle=palette[(row*19+col*23)%palette.length];paint.fillRect(col*32+1,row*512/12+1,30,512/12-2)}
  const map=new THREE.CanvasTexture(tiles);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const paving=new THREE.Mesh(new THREE.PlaneGeometry(L.width,L.depth,L.width*2,L.depth*2),new THREE.MeshLambertMaterial({map}));paving.rotation.x=-Math.PI/2;paving.position.set(L.x,L.floor,L.z);paving.receiveShadow=true;paving.name='prayer-paving';group.add(paving);
  const curbMat=stone(0xaea18b),wood=stone(0x795b40),metal=stone(0x393a33);
  const part=(w,h,d,x,y,z,m=wood)=>{const a=new THREE.Mesh(new THREE.BoxGeometry(w,h,d,Math.max(1,Math.ceil(w*2)),1,Math.max(1,Math.ceil(d*2))),m);a.position.set(x,y,z);a.castShadow=a.receiveShadow=true;group.add(a);return a};
  // A low perimeter with a broad open entrance at the front; no rails across the prayer area.
  part(L.width,.12,.12,L.x,.065,L.z-L.depth/2,curbMat);
  for(const side of[-1,1])part(.12,.12,L.depth,L.x+side*L.width/2,.065,L.z,curbMat);
  for(const side of[-1,1])part(6,.12,.12,L.x+side*7,.065,L.z+L.depth/2,curbMat);
  const B=L.box,BOX_SCALE=.5,cabinetStart=group.children.length,loader=new THREE.TextureLoader();
  const load=url=>{const t=loader.load(url);t.colorSpace=THREE.SRGBColorSpace;return t};
  const timber=new THREE.MeshLambertMaterial({map:load('./assets/candle-wood.webp'),color:0xd4b58b});
  // Twenty large candles: five across, four deep wooden shelves. Faces point toward the plaza.
  part(4.5,4.7,.12,B.x,2.5,B.z-.24,timber);
  for(const side of[-1,1])part(.18,4.95,.75,B.x+side*2.3,2.53,B.z,timber);
  part(4.8,.22,.85,B.x,5.02,B.z,timber);
  for(let row=0;row<4;row++)part(4.5,.12,.8,B.x,.35+row*.94,B.z+.12,timber);
  part(4.6,.28,.8,B.x,.17,B.z,timber);
  const p=slot=>({x:B.x+(slot%5-2)*.87,y:.41+(3-Math.floor(slot/5))*.94,z:B.z+.55});
  const waxMat=new THREE.MeshBasicMaterial({map:load('./assets/candle-body.webp'),transparent:true,alphaTest:.015,side:THREE.DoubleSide,toneMapped:false});
  const flameMat=markBloom(new THREE.MeshBasicMaterial({map:load('./assets/candle-flame.webp'),transparent:true,depthWrite:false,alphaTest:.01,side:THREE.DoubleSide,toneMapped:false}),1.4);
  const wax=new THREE.InstancedMesh(new THREE.PlaneGeometry(.75,.87),waxMat,Prayer.MAX),flames=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),flameMat,Prayer.MAX);
  wax.count=flames.count=0;wax.frustumCulled=flames.frustumCulled=false;group.add(wax,flames);
  const atlas=document.createElement('canvas');atlas.width=1280;atlas.height=1024;const pen=atlas.getContext('2d'),texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;
  const tagMat=new THREE.MeshBasicMaterial({map:texture,transparent:true,alphaTest:.02,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
  const tags=new THREE.Mesh(new THREE.BufferGeometry(),tagMat);tags.frustumCulled=false;group.add(tags);
  const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=160;const sp=signCanvas.getContext('2d');sp.fillStyle='#f5d49b';sp.textAlign='center';sp.font='bold 76px "Gowun Batang",serif';sp.fillText('소원을 밝히는 초함',512,108);
  const signTex=new THREE.CanvasTexture(signCanvas);signTex.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.8,.59),new THREE.MeshBasicMaterial({map:signTex,transparent:true,toneMapped:false}));sign.position.set(B.x,4.57,B.z+.58);group.add(sign);
  for(const offset of[-1.65,0,1.65])obstacles.push({x:B.x+offset*BOX_SCALE,z:B.z,r:.75*BOX_SCALE});
  const glow=pointLight(0xffb55f,0,8*BOX_SCALE);glow.position.set(B.x,2.5,B.z+1.3);group.add(glow);
  // Scale the complete cabinet around its floor anchor, keeping the plaza at full size.
  const cabinet=new THREE.Group();cabinet.name='prayer-candle-cabinet';
  cabinet.position.set(B.x*(1-BOX_SCALE),L.floor*(1-BOX_SCALE),B.z*(1-BOX_SCALE));cabinet.scale.setScalar(BOX_SCALE);
  cabinet.add(...group.children.slice(cabinetStart));group.add(cabinet);
  let snapshot={rev:0,items:[]},seen='',lastSecond=-1,nextExpiry=Infinity,live=[];const matrix=new THREE.Object3D();
  function refresh(now){
    live=Prayer.display(snapshot,now);const key=live.map(c=>c.id).join(',');if(key===seen)return;seen=key;nextExpiry=live.length?Math.min(...live.map(c=>c.expiresAt)):Infinity;
    pen.clearRect(0,0,1280,1024);const pos=[],uv=[];
    live.forEach((c,i)=>{const a=p(c.displaySlot);matrix.position.set(a.x,a.y+.358,a.z);matrix.rotation.set(0,0,0);matrix.scale.set(1,1,1);matrix.updateMatrix();wax.setMatrixAt(i,matrix.matrix);
      const tx=(i%5)*256,ty=Math.floor(i/5)*256;pen.fillStyle='#56391e';pen.textAlign='center';pen.font='bold 38px "Gowun Batang",serif';
      const chars=Array.from(c.name),words=Array.from(c.wish.replace(/\s+/g,' '));pen.fillText(chars.slice(0,6).join('')+(chars.length>6?'…':''),tx+128,ty+66,240);pen.font='30px "Gowun Dodum",sans-serif';
      for(let line=0;line<3;line++)pen.fillText(words.slice(line*7,line*7+7).join('')+(line===2&&words.length>21?'…':''),tx+128,ty+116+line*40,240);
      // Transparent writing lies directly on the cream wax face, not on a hanging label.
      const x=a.x+.75*.025,y=a.y+.87*(1-.31)-.077,z=a.z+.006,w=.75*.55,h=.87*.43,u0=tx/1280,u1=(tx+256)/1280,v0=1-(ty+256)/1024,v1=1-ty/1024;
      pos.push(x-w/2,y-h,z,x+w/2,y-h,z,x+w/2,y,z,x-w/2,y-h,z,x+w/2,y,z,x-w/2,y,z);uv.push(u0,v0,u1,v0,u1,v1,u0,v0,u1,v1,u0,v1);
    });
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();tags.geometry.dispose();tags.geometry=geo;texture.needsUpdate=true;wax.count=flames.count=live.length;wax.instanceMatrix.needsUpdate=true;
  }
  return{group,paving,wax,flames,glow,apply(s){snapshot=s;seen='!';lastSecond=-1},update(now,time){
    const sec=Math.floor(now/1000);if(sec!==lastSecond||now>=nextExpiry){lastSecond=sec;refresh(now)}
    live.forEach((c,i)=>{const a=p(c.displaySlot),f=.94+.06*Math.sin(time*9+i*2.1);matrix.position.set(a.x,a.y+.87*.77-.077+.118*f,a.z+.01);matrix.rotation.set(0,0,.045*Math.sin(time*5+i));matrix.scale.set(.185*f,.28*f,1);matrix.updateMatrix();flames.setMatrixAt(i,matrix.matrix)});
    flames.count=wax.count=live.length;flames.instanceMatrix.needsUpdate=true;glow.intensity=live.length?Math.min(5,1.2+live.length*.17)*BOX_SCALE*BOX_SCALE:0;
  }};
}
