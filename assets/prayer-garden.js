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
export function makePrayerGarden({scene,stone,markBloom,obstacles}){
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
  const B=L.box;
  // Eight shelves, sixteen individually identified candle places. The bank is to
  // Buddha's right and stops well before Mary's pedestal.
  for(const side of[-1,1])part(.10,2.65,.46,B.x+side*2.18,1.39,B.z,metal);
  part(4.48,.14,.62,B.x,2.78,B.z,wood);
  for(let row=0;row<8;row++)part(4.4,.065,.46,B.x,.43+row*.28,B.z,metal);
  part(4.4,.25,.55,B.x,.24,B.z,wood);
  const p=(slot)=>({x:B.x+(slot%16-7.5)*.255,y:.51+Math.floor(slot/16)*.28,z:B.z+.06});
  const waxMat=stone(0xffedcc),flameMat=markBloom(new THREE.MeshBasicMaterial({color:0xffc366,toneMapped:false}),2.3);
  const wax=new THREE.InstancedMesh(new THREE.CylinderGeometry(.052,.057,.19,7),waxMat,Prayer.MAX);
  const flames=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),flameMat,Prayer.MAX);
  wax.count=flames.count=0;wax.frustumCulled=flames.frustumCulled=false;wax.castShadow=false;group.add(wax,flames);
  const atlas=document.createElement('canvas');atlas.width=atlas.height=1024;const pen=atlas.getContext('2d'),texture=new THREE.CanvasTexture(atlas);texture.colorSpace=THREE.SRGBColorSpace;
  const tagMat=new THREE.MeshLambertMaterial({map:texture,transparent:true,alphaTest:.1,side:THREE.DoubleSide});
  let tags=new THREE.Mesh(new THREE.BufferGeometry(),tagMat);group.add(tags);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=96;const sp=signCanvas.getContext('2d');sp.fillStyle='#eddec3';sp.fillRect(0,0,512,96);sp.fillStyle='#594a35';sp.textAlign='center';sp.font='bold 43px sans-serif';sp.fillText('소원을 밝히는 초함',256,62);
  const signTex=new THREE.CanvasTexture(signCanvas);signTex.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(3.5,.51),new THREE.MeshLambertMaterial({map:signTex}));sign.position.set(B.x,3.15,B.z+.08);group.add(sign);
  obstacles.push({x:B.x-1.65,z:B.z,r:.75},{x:B.x,z:B.z,r:.75},{x:B.x+1.65,z:B.z,r:.75});
  const glow=new THREE.PointLight(0xffc17d,0,6,2);glow.position.set(B.x,2,B.z+1);group.add(glow);
  let snapshot={rev:0,items:[]},seen='',lastSecond=-1,nextExpiry=Infinity;const matrix=new THREE.Object3D();
  function refresh(now){
    const live=Prayer.active(snapshot,now),key=live.map(c=>c.id).join(',');if(key===seen)return live;seen=key;
    nextExpiry=live.length?Math.min(...live.map(c=>c.expiresAt)):Infinity;
    pen.clearRect(0,0,1024,1024);const pos=[],uv=[];
    live.forEach((c,i)=>{const a=p(c.slot);matrix.position.set(a.x,a.y,a.z);matrix.rotation.set(0,0,0);matrix.scale.set(1,1,1);matrix.updateMatrix();wax.setMatrixAt(i,matrix.matrix);
      const tx=(c.slot%16)*64,ty=Math.floor(c.slot/16)*128;pen.fillStyle='#f5e4bf';pen.fillRect(tx,ty,64,80);pen.fillStyle='#69462d';pen.textAlign='center';pen.font='bold 12px sans-serif';
      const chars=Array.from(c.name),words=Array.from(c.wish.replace(/\s+/g,' '));pen.fillText(chars.slice(0,4).join(''),tx+32,ty+23,60);pen.fillText(chars.slice(4,8).join('')+(chars.length>8?'…':''),tx+32,ty+39,60);pen.font='9px sans-serif';pen.fillText(words.slice(0,6).join(''),tx+32,ty+58,60);pen.fillText(words.slice(6,12).join('')+(words.length>12?'…':''),tx+32,ty+73,60);
      const x=a.x,y=a.y-.015,z=a.z+.067,w=.17,h=.18,u0=tx/1024,u1=(tx+64)/1024,v0=1-(ty+80)/1024,v1=1-ty/1024;
      pos.push(x-w/2,y-h,z,x+w/2,y-h,z,x+w/2,y,z,x-w/2,y-h,z,x+w/2,y,z,x-w/2,y,z);uv.push(u0,v0,u1,v0,u1,v1,u0,v0,u1,v1,u0,v1);
    });
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.computeVertexNormals();tags.geometry.dispose();tags.geometry=geo;tags.frustumCulled=false;texture.needsUpdate=true;
    wax.count=flames.count=live.length;wax.instanceMatrix.needsUpdate=true;return live;
  }
  return{group,paving,wax,flames,glow,apply(s){snapshot=s;seen='!';lastSecond=-1},update(now,time){
    const sec=Math.floor(now/1000);if(sec!==lastSecond||now>=nextExpiry){lastSecond=sec;refresh(now)}
    const live=Prayer.active(snapshot,now);live.forEach((c,i)=>{const a=p(c.slot),f=.87+.13*Math.sin(time*9+c.slot*2.1);matrix.position.set(a.x,a.y+.135,a.z);matrix.scale.set(.032*f,.075*f,.032*f);matrix.updateMatrix();flames.setMatrixAt(i,matrix.matrix)});
    // Expiry is checked even before the server's alarm arrives on this connection.
    flames.count=wax.count=live.length;flames.instanceMatrix.needsUpdate=true;glow.intensity=live.length?Math.min(5,1+live.length*.04):0;
  }};
}
