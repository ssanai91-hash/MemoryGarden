import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function bloomSettings({daylight=0,dawn=0,dusk=0,rain=0,space='garden',level=1}={}){
  if(space==='listening')return{strength:.14*(level===1?.8:1),threshold:1.1,radius:.25,exposure:.9,scale:level===1?.5:1};
  const d=THREE.MathUtils.clamp(daylight,0,1),twilight=(1-d)*THREE.MathUtils.clamp(Math.max(dawn,dusk),0,1),night=1-d-twilight;
  return{strength:(.2*d+.5*twilight+.9*night)*(1-.22*rain)*(level===1?.8:1),
    threshold:.95*d+.85*twilight+.75*night,radius:.3*d+.4*twilight+.5*night,
    exposure:.88*d+.95*twilight+1.05*night,scale:level===1?.5:1};
}
export function markBloom(material,gain=2){material.userData.gardenBloom=gain;return material}

// The beauty buffer stays untouched. A depth-preserving emission mask excludes white clothes,
// snow, flowers and sky. UnrealBloomPass still occupies the normal composer bloom stage.
class GardenBloomPass extends UnrealBloomPass{
  constructor(){
    super(new THREE.Vector2(1,1),.8,.5,.75);
    this.maskTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    this.maskMaterials=new WeakMap();this.ownedMaterials=new Set();this.items=[];this.maskFrame=0;this.pointScale={value:1};
  }
  materialFor(source){
    let result=this.maskMaterials.get(source);
    if(!result){
      result=source.clone();result.toneMapped=false;result.fog=false;
      const before=source.onBeforeCompile,key=source.customProgramCacheKey();
      result.onBeforeCompile=shader=>{
        before.call(source,shader);
        // App shaders end with main(). Includes are expanded by Three afterwards.
        const end=shader.fragmentShader.lastIndexOf('}');
        if(end<0)throw new Error('Bloom mask shader has no main ending');
        const emitting=!!source.userData.gardenBloom;
        shader.uniforms.gardenBloomGain={value:source.userData.gardenBloom||0};
        if(source.userData.gardenPoint){shader.uniforms.gardenMaskScale=this.pointScale;const ve=shader.vertexShader.lastIndexOf('}');shader.vertexShader='uniform float gardenMaskScale;\n'+shader.vertexShader.slice(0,ve)+'\n gl_PointSize*=gardenMaskScale;\n'+shader.vertexShader.slice(ve)}
        shader.fragmentShader='uniform float gardenBloomGain;\n'+shader.fragmentShader.slice(0,end)+
          (emitting?(source.isMeshStandardMaterial?'\n gl_FragColor.rgb=totalEmissiveRadiance*gardenBloomGain;\n':'\n gl_FragColor.rgb*=gardenBloomGain;\n'):'\n gl_FragColor.rgb=vec3(0.);\n')+shader.fragmentShader.slice(end);
      };
      result.customProgramCacheKey=()=>key+'-garden-bloom-'+(source.userData.gardenBloom||0);
      if(source.isShaderMaterial)result.uniforms=source.uniforms;
      this.maskMaterials.set(source,result);this.ownedMaterials.add(result);
    }
    result.opacity=source.opacity;result.visible=source.visible;
    if(result.color&&source.color)result.color.copy(source.color);
    if(result.emissive&&source.emissive){result.emissive.copy(source.emissive);result.emissiveIntensity=source.emissiveIntensity}
    result.map=source.map;result.userData.lastMaskFrame=this.maskFrame;this.ownedMaterials.add(result);return result;
  }
  render(renderer,writeBuffer,readBuffer,dt,maskActive){
    const world=this.world,camera=this.worldCamera,background=world.background,fog=world.fog;
    const target=renderer.getRenderTarget(),auto=renderer.autoClear,shadow=renderer.shadowMap.autoUpdate;
    const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    this.items.length=0;this.maskFrame++;this.pointScale.value=this.maskTarget.width/renderer.getDrawingBufferSize(new THREE.Vector2()).x;
    if(this.maskFrame%300===0)for(const material of this.ownedMaterials)if(this.maskFrame-material.userData.lastMaskFrame>900){material.dispose();this.ownedMaterials.delete(material)}
    const matrixAuto=world.matrixWorldAutoUpdate;world.matrixWorldAutoUpdate=false;
    try{
      world.traverseVisible(object=>{
        if(!object.material)return;const materials=Array.isArray(object.material)?object.material:[object.material];
        this.items.push([object,object.material,object.geometry,object.visible]);
        const emitting=materials.some(m=>m.userData.gardenBloom);
        if(!emitting&&materials.every(m=>m.depthWrite===false)){object.visible=false;return}
        if(!emitting&&object.userData.gardenBloomOccluderGeometry)object.geometry=object.userData.gardenBloomOccluderGeometry;
        if(object.isPoints)for(const m of materials)m.userData.gardenPoint=true;
        object.material=Array.isArray(object.material)?materials.map(m=>this.materialFor(m)):this.materialFor(object.material);
      });
      world.background=null;world.fog=null;renderer.shadowMap.autoUpdate=false;renderer.autoClear=true;
      renderer.setClearColor(0,0);renderer.setRenderTarget(this.maskTarget);renderer.clear();renderer.render(world,camera);
    }finally{
      for(const[object,material,geometry,visible]of this.items){object.material=material;object.geometry=geometry;object.visible=visible;}
      this.items.length=0;world.matrixWorldAutoUpdate=matrixAuto;world.background=background;world.fog=fog;renderer.shadowMap.autoUpdate=shadow;
      renderer.setClearColor(clear,alpha);renderer.autoClear=auto;renderer.setRenderTarget(target);
    }
    // r170's final blend writes into the supplied read buffer. Extract from the mask first,
    // then add its combined bloom texture to the original beauty buffer (never the mask image).
    super.render(renderer,writeBuffer,this.maskTarget,dt,maskActive);
    const oldAuto=renderer.autoClear;renderer.autoClear=false;
    this.fsQuad.material=this.blendMaterial;
    this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture;
    renderer.setRenderTarget(readBuffer);this.fsQuad.render(renderer);renderer.autoClear=oldAuto;
  }
  resizeMask(width,height){this.maskTarget.setSize(Math.max(1,width),Math.max(1,height));super.setSize(width,height)}
  dispose(){super.dispose();this.maskTarget.dispose();for(const material of this.ownedMaterials)material.dispose();this.ownedMaterials.clear()}
}

export function createGardenRenderer(renderer){
  const gl=renderer.getContext();
  const supported=renderer.extensions.has('EXT_color_buffer_float');
  const supportedSamples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES)||[]);
  const samples=Math.max(0,...supportedSamples.filter(n=>n<=4));
  const postLinear={value:0};
  const overlay=new THREE.Scene(),labels=new Map(),scratchP=new THREE.Vector3(),scratchQ=new THREE.Quaternion(),scratchS=new THREE.Vector3();
  let composer=null,renderPass=null,bloom=null,output=null,lastLevel=-1,cssWidth=1,cssHeight=1;
  const api={supported,samples,strengthScale:1,toneMapping:THREE.ACESFilmicToneMapping,active:false,settings:null,
    label:'직접',diagnostics(){return{samples,active:api.active,labels:labels.size,target:composer?[composer.renderTarget1.width,composer.renderTarget1.height]:null,bloom:bloom?[bloom.renderTargetBright.width,bloom.renderTargetBright.height]:null,passes:composer?composer.passes.map(pass=>pass.constructor.name):[]}},registerLabel(source){
      source.layers.set(1);const copy=new THREE.Sprite(source.material);copy.matrixAutoUpdate=false;copy.frustumCulled=false;
      overlay.add(copy);labels.set(source,copy);return source;
    },
    setSize(width,height,level){
      cssWidth=width;cssHeight=height;
      if(level===0){dispose();api.active=false;api.label='끔';return}
      if(!composer)return;
      composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(width,height);
      const scale=level===1?.5:1,ratio=renderer.getPixelRatio();
      bloom.resizeMask(Math.round(width*ratio*scale),Math.round(height*ratio*scale));lastLevel=level;
    },
    draw(world,camera,dt,frame){
      const settings=bloomSettings(frame);api.settings=settings;
      if(!world.userData.gardenRawPrepared){
        world.traverse(object=>{for(const material of Array.isArray(object.material)?object.material:[object.material]){
          if(!material?.isShaderMaterial||material.userData.gardenPostLinear)continue;
          material.userData.gardenPostLinear=true;const before=material.onBeforeCompile,key=material.customProgramCacheKey();
          material.onBeforeCompile=shader=>{before.call(material,shader);shader.uniforms.gardenPostLinear=postLinear;const end=shader.fragmentShader.lastIndexOf('}');
            shader.fragmentShader='uniform float gardenPostLinear;\n'+shader.fragmentShader.slice(0,end)+'\n if(gardenPostLinear>.5){vec3 c=clamp(gl_FragColor.rgb,vec3(0.),vec3(1.));gl_FragColor.rgb=mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}\n'+shader.fragmentShader.slice(end)};
          material.customProgramCacheKey=()=>key+'-post-linear';material.needsUpdate=true;
        }});world.userData.gardenRawPrepared=true;
      }
      const enabled=supported&&frame.level>0&&api.strengthScale>0;
      postLinear.value=enabled?1:0;
      renderer.toneMapping=api.toneMapping;renderer.toneMappingExposure=enabled?settings.exposure:.9;
      if(enabled){
        ensure(world,camera);if(lastLevel!==frame.level)api.setSize(cssWidth,cssHeight,frame.level);
        renderPass.scene=world;renderPass.camera=camera;bloom.world=world;bloom.worldCamera=camera;
        bloom.strength=settings.strength*api.strengthScale;bloom.threshold=settings.threshold;bloom.radius=settings.radius;
        composer.render(dt);api.active=true;api.label=frame.level===1?'블룸 ½':'블룸';
      }else{renderer.setRenderTarget(null);renderer.render(world,camera);api.active=false;api.label='끔'}
      // Proxies keep the original parent hierarchy, visibility and curved-world position.
      for(const[source,copy]of labels){
        let root=source,visible=source.visible;while(root.parent){root=root.parent;visible=visible&&root.visible}
        if(!root.isScene){overlay.remove(copy);labels.delete(source);continue}
        copy.visible=visible&&root===world;
        if(!copy.visible)continue;
        source.matrixWorld.decompose(scratchP,scratchQ,scratchS);copy.matrix.compose(scratchP,scratchQ,scratchS);copy.matrixWorldNeedsUpdate=true;
        copy.center.copy(source.center);copy.renderOrder=source.renderOrder;
      }
      const auto=renderer.autoClear;renderer.autoClear=false;
      try{renderer.clearDepth();renderer.render(overlay,camera)}finally{renderer.autoClear=auto}
    },dispose};
  function ensure(world,camera){
    if(composer)return;
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples,depthBuffer:true});
    composer=new EffectComposer(renderer,target);renderPass=new RenderPass(world,camera);bloom=new GardenBloomPass();output=new OutputPass();
    composer.addPass(renderPass);composer.addPass(bloom);composer.addPass(output);lastLevel=-1;
  }
  function dispose(){if(!composer)return;bloom.dispose();output.dispose();renderPass.dispose();composer.dispose();composer=renderPass=bloom=output=null;lastLevel=-1}
  return api;
}
