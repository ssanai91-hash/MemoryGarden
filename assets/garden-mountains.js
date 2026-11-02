import * as THREE from 'three';

// Stable private RNG: changing the skyline never moves the garden's trees or flowers.
function mountainRandom(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296}}
export function alpinePeakData({height,width,depth,seed=1,snowCap=true}){
 const random=mountainRandom(seed),sides=16,levels=[0,.12,.26,.4,.53,.65,.76,.85,.92,.97],phase=random()*6.283;
 const leanX=(random()-.5)*width*.32,leanZ=(random()-.5)*depth*.28,rings=[];
 for(let j=0;j<levels.length;j++){
  const t=levels[j],ring=[];
  for(let k=0;k<sides;k++){
   const a=k/sides*Math.PI*2,ridge=.71+.25*Math.cos(a*4+phase)+.065*Math.sin(a*7-phase);
   const radius=Math.pow(1-t,.84)*ridge*(1+(random()-.5)*.15*(1-t));
   // Tall buttresses and irregular saddles, with a single sharp, leaning summit.
   const ledge=Math.sin(a*3+phase+j*.65)*height*.035*Math.sin(t*Math.PI)+Math.max(0,Math.sin(a*2+phase))*height*.095*Math.exp(-Math.pow((t-.55)/.23,2));
   ring.push([Math.cos(a)*width*radius+leanX*t*t,height*t+ledge,Math.sin(a)*depth*radius+leanZ*t*t]);
  }
  rings.push(ring);
 }
 const positions=[],colors=[],normals=[],rock=new THREE.Color(0x566377).convertSRGBToLinear(),shadow=new THREE.Color(0x354359).convertSRGBToLinear(),snow=new THREE.Color(0xe7edf3).convertSRGBToLinear(),ice=new THREE.Color(0x9db4d0).convertSRGBToLinear();
 const ab=new THREE.Vector3(),ac=new THREE.Vector3(),normal=new THREE.Vector3();
 function triangle(a,b,c){
  ab.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);ac.set(c[0]-a[0],c[1]-a[1],c[2]-a[2]);normal.crossVectors(ab,ac).normalize();
  const y=(a[1]+b[1]+c[1])/(3*height),angle=Math.atan2(a[2]+b[2]+c[2],a[0]+b[0]+c[0]);
  const snowline=.57+.07*Math.sin(angle*3+phase)+.045*Math.cos(angle*7-phase),slope=normal.y;
  // Snow fills ledges; steep faces expose dark rock well into the summit cap.
  const snowy=snowCap&&y>snowline&&(slope>.15||Math.sin(angle*4+phase)>.3||y>.915),lit=.5+.5*normal.dot(new THREE.Vector3(-.5,.7,.5).normalize());
  const color=snowy?ice.clone().lerp(snow,.4+lit*.6):shadow.clone().lerp(rock,.25+lit*.7);
  color.multiplyScalar(.92+random()*.15);
  for(const p of[a,b,c]){positions.push(...p);colors.push(color.r,color.g,color.b);normals.push(normal.x,normal.y,normal.z)}
 }
 for(let j=0;j<rings.length-1;j++)for(let k=0;k<sides;k++){
  const n=(k+1)%sides,a=rings[j][k],b=rings[j][n],c=rings[j+1][k],d=rings[j+1][n];
  triangle(a,c,b);triangle(b,c,d);
 }
 const top=[leanX,height,leanZ],last=rings.at(-1);for(let k=0;k<sides;k++)triangle(last[k],top,last[(k+1)%sides]);
 return{positions,colors,normals,height,width,depth};
}
export function addAlpineRange(scene){
 const positions=[],colors=[],normals=[],peaks=[],random=mountainRandom(0x45564552);
 const heights=[78,96,86,112,91,132,106,121,88,102,82,94];
 function append(spec,x,z,rotation){
  const d=alpinePeakData(spec),c=Math.cos(rotation),s=Math.sin(rotation);
  for(let i=0;i<d.positions.length;i+=3){const px=d.positions[i],pz=d.positions[i+2];positions.push(x+px*c+pz*s,d.positions[i+1]-4,z-px*s+pz*c);const nx=d.normals[i],nz=d.normals[i+2];normals.push(nx*c+nz*s,d.normals[i+1],-nx*s+nz*c)}
  colors.push(...d.colors);peaks.push({...spec,x,z,rotation});
 }
 for(let i=0;i<heights.length;i++){
  const a=-Math.PI*.98+i/(heights.length-1)*Math.PI*.96,r=211+random()*21,x=Math.cos(a)*r,z=Math.sin(a)*r;
  const width=40+random()*16,depth=29+random()*13;
  if(i){const prev=peaks.find(p=>p.seed===701+(i-1)*37),dx=x-prev.x,dz=z-prev.z;append({height:Math.min(heights[i],heights[i-1])*.52,width:Math.hypot(dx,dz)*.7+20,depth:35,seed:3001+i*23,snowCap:false},(x+prev.x)/2,(z+prev.z)/2,Math.atan2(-dz,dx))}
  append({height:heights[i],width,depth,seed:701+i*37},x,z,a+Math.PI/2);
  // A lower shoulder joins each pair, avoiding a row of identical isolated cones.
  if(i%2===0)append({height:heights[i]*.57,width:width*.76,depth:depth*.83,seed:1501+i*19},x+Math.cos(a+.4)*18,z+Math.sin(a+.4)*18,a+.7);
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=new THREE.MeshLambertMaterial({vertexColors:true,fog:true});
 const mesh=new THREE.Mesh(geometry,material);mesh.name='alpine-snow-ridges';mesh.castShadow=false;mesh.receiveShadow=false;
 // App bends vertices in camera space; the CPU sphere does not include that deformation.
 mesh.frustumCulled=false;scene.add(mesh);return{mesh,peaks};
}
