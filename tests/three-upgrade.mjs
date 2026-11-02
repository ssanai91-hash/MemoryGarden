// Run against an independently downloaded, unmodified three@0.170.0/build/three.module.js.
// node tests/three-upgrade.mjs /absolute/path/three-r170.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
if(!process.argv[2])throw new Error('Pass the pinned r170 module path; no network download occurs in this test.');
const THREE=await import(pathToFileURL(process.argv[2]).href);
assert.equal(THREE.REVISION,'170');
THREE.ColorManagement.enabled=false;
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const imports=JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]).imports;
assert.equal(imports.three,'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js');
assert.equal(imports['three/addons/'],'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/');
assert.ok(html.includes('import { GLTFLoader }'));
for(const match of html.matchAll(/THREE\.([A-Za-z0-9_]+)/g))assert.ok(match[1] in THREE,match[1]+' must exist in r170');
for(const match of html.matchAll(/#include <([a-z0-9_]+)>/g))assert.equal(typeof THREE.ShaderChunk[match[1]],'string',match[1]);
assert.ok(!/\.encoding\s*=|outputEncoding|sRGBEncoding|lights_lambert_vertex|THREE\.GLTFLoader/.test(html));
assert.ok(html.includes('THREE.ColorManagement.enabled=false'));
assert.ok(html.includes('renderer.outputColorSpace=THREE.SRGBColorSpace'));
// Execute the real application patches against the real r170 chunks; missing anchors throw.
const start=html.indexOf('const CURVE_K='),end=html.indexOf('let renderer;',start);
const c={THREE,Math};vm.createContext(c);vm.runInContext(html.slice(start,end)+`;this.api={patchShader,swayMaterial,gardenPointLight,setGardenLight,GARDEN_LIGHT_GAIN};`,c);
assert.ok(THREE.ShaderChunk.project_vertex.includes('float cd=min(length(mvPosition.xz),70.0)'));
assert.ok(THREE.ShaderLib.sprite.vertexShader.includes('mvPosition.y-=cd*cd*0.0012'));
for(const chunk of ['lights_lambert_pars_fragment','lights_physical_pars_fragment'])assert.ok(THREE.ShaderChunk[chunk].includes('toonStep( dotNL ) * directLight.color'));
assert.throws(()=>c.api.patchShader('changed shader','missing','replacement','test'),/shader anchor/);
const a=c.api.swayMaterial(new THREE.MeshStandardMaterial(),.1,false),b=c.api.swayMaterial(new THREE.MeshStandardMaterial(),.2,false),rooted=c.api.swayMaterial(new THREE.MeshStandardMaterial(),.1,true);
assert.notEqual(a.customProgramCacheKey(),b.customProgramCacheKey());assert.notEqual(a.customProgramCacheKey(),rooted.customProgramCacheKey());
const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader};a.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('transformed.x+=sw*hgt*0.100'));assert.ok(shader.uniforms.uWind);
for(const kind of Object.keys(c.api.GARDEN_LIGHT_GAIN)){
 const light=c.api.gardenPointLight(kind,0xffaa55,1,12);assert.equal(light.decay,2);assert.equal(light.distance,12);
 c.api.setGardenLight(light,.3);assert.equal(light.intensity,.3*c.api.GARDEN_LIGHT_GAIN[kind]);c.api.setGardenLight(light,0);assert.equal(light.intensity,0);
}
const directional=new THREE.DirectionalLight();c.api.setGardenLight(directional,.7);assert.equal(directional.intensity,.7*Math.PI);
const mstart=html.indexOf('function instanced('),mend=html.indexOf('/* ---------- local rendering quality',mstart);
const g={THREE,dummy:new THREE.Object3D(),scene:new THREE.Scene()};vm.createContext(g);vm.runInContext(html.slice(mstart,mend)+'this.make=instanced;',g);
const mesh=g.make(new THREE.BoxGeometry(),new THREE.MeshLambertMaterial(),[{x:10,y:1,z:3,sx:2,c:new THREE.Color(0xffaa00)}],true);
assert.equal(mesh.frustumCulled,false);assert.ok(mesh.boundingSphere.radius>0);const color=new THREE.Color();mesh.getColorAt(0,color);assert.equal(color.getHex(),0xffaa00);
console.log('PASS: exact r170 imports/API inventory, real ShaderChunk anchors, curved meshes/sprites, Lambert/PBR toon bands, wind uniforms/cache isolation, calibrated animated lights/extinction, instance colours and curved-world culling.');
