// node tests/listening-layout.mjs /absolute/path/to/three-r170.mjs
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.equal(THREE.REVISION,'170');
const pen=new Proxy({createLinearGradient(){return{addColorStop(){}}},createRadialGradient(){return{addColorStop(){}}}},{get:(o,k)=>o[k]||(()=>{})});
const c={THREE,Math,document:{createElement:()=>({getContext:()=>pen})},BOX:new THREE.BoxGeometry(1,1,1),dummy:new THREE.Object3D(),scene:new THREE.Scene(),C:hex=>new THREE.Color(hex),markBloom:m=>m,gardenPointLight:(kind,color,strength,range)=>new THREE.PointLight(color,strength,range),listening:{state:{track:'bluehour',power:false}}};
vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('function part('),html.indexOf('/* ---------- local rendering quality;'))+html.slice(html.indexOf('const LISTENING_SEATS='),html.indexOf('function syncListeningActors()'))+';this.seats=LISTENING_SEATS;this.tv=LISTENING_TV;',c);
const sc=c.makeListeningScene();sc.updateMatrixWorld(true);assert.equal(c.seats.length,3);assert.equal(c.listening.chairs.length,3);assert.ok(c.seats.every(p=>p.z===c.seats[0].z));assert.equal(c.seats[1].x-c.seats[0].x,c.seats[2].x-c.seats[1].x);assert.equal(c.makeListeningScene(),sc);
const screen=sc.getObjectByName('listening-screen'),tiles=sc.getObjectByName('listening-acoustic-diffuser');assert.ok(screen&&tiles?.isInstancedMesh);assert.ok(c.listening.audioTargets.includes(screen));
const screenBox=new THREE.Box3().setFromObject(screen),tvBox=new THREE.Box3(new THREE.Vector3(c.tv.x-c.tv.width/2-c.tv.gap,c.tv.y-c.tv.height/2-c.tv.gap,-6),new THREE.Vector3(c.tv.x+c.tv.width/2+c.tv.gap,c.tv.y+c.tv.height/2+c.tv.gap,-4));
const matrix=new THREE.Matrix4();let deepest=-Infinity;for(let i=0;i<tiles.count;i++){tiles.getMatrixAt(i,matrix);const box=new THREE.Box3().copy(tiles.geometry.boundingBox||new THREE.Box3().setFromBufferAttribute(tiles.geometry.attributes.position)).applyMatrix4(matrix);if(box.min.z< -5){assert.equal(box.intersectsBox(tvBox),false,'rear tiles must leave the whole TV frame clear');deepest=Math.max(deepest,box.max.z)}}assert.ok(c.tv.z>deepest,'TV surface must sit ahead of every rear diffuser block');
const camera=new THREE.PerspectiveCamera(55,412/860,.1,400),ray=new THREE.Raycaster();
const start=html.indexOf("  if(worldSpace==='listening'){\n    camera.position.set"),end=html.indexOf('  }else if(cam.sky){',start);assert.ok(start>=0&&end>start);const cameraCode=html.slice(start,end)+'}';
for(const [i,p]of c.seats.entries()){
 assert.equal(c.listeningSeatAt(p.x,p.z),i);assert.equal(c.listening.chairs[i].rotation.y,Math.PI);
 Object.assign(c,{camera,worldSpace:'listening',pose:'sit',ax:p.x,az:p.z,cam:{yaw:0,pitch:.18,dist:4.2},sy:0,cy:1,cp:Math.cos(.18)});vm.runInContext(cameraCode,c);camera.updateMatrixWorld();
 for(const wall of c.listening.walls)wall.mesh.visible=wall.axis==='x'?wall.sign*camera.position.x<5.7:wall.sign*camera.position.z<5.3;
 for(const fx of[-.48,0,.48])for(const fy of[-.48,0,.48]){
  const target=new THREE.Vector3(c.tv.x+fx*(c.tv.width-.2),c.tv.y+fy*(c.tv.height-.2),c.tv.z),ndc=target.clone().project(camera);assert.ok(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1,'complete TV fits the portrait camera from seat '+i);
  ray.set(camera.position,target.clone().sub(camera.position).normalize());const hits=ray.intersectObjects(sc.children,true).filter(h=>{for(let n=h.object;n;n=n.parent)if(!n.visible)return false;return true});assert.equal(hits[0]?.object,screen,'screen must be first visible geometry from seat '+i);
 }
 // Dragging the camera around the chair must still allow looking away from the TV.
 c.sy=0;c.cy=-1;vm.runInContext(cameraCode,c);camera.updateMatrixWorld();assert.ok(camera.getWorldDirection(new THREE.Vector3()).z>.9,'seated camera orbit remains free');
}
assert.equal(c.listeningSeatAt(3.9,3.5),-1);assert.ok(html.includes("worldSpace==='listening'&&pose==='sit'&&listeningSeatAt(me.g.position.x,me.g.position.z)<0)pose='stand'"));
console.log('PASS: actual r170 three equally spaced TV-facing chairs, complete diffuser cutout, forward TV depth, 27 unobstructed screen rays and full TV in 412×860 seated cameras, free camera orbit, clickable screen and stale-seat restore guard.');
