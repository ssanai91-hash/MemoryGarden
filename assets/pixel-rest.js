import * as THREE from 'three';

const volumes=new WeakMap();
function unpack(runs,length){const pixels=new Uint8Array(length);let at=0;for(let i=0;i<runs.length;i+=2){pixels.fill(runs[i+1],at,at+runs[i]);at+=runs[i]}if(at!==length)throw Error('rest volume size');return pixels}
// Reconstruct rounded cross-sections from the front silhouette and side depth.
// Greedy meshing emits only exterior faces and merges neighboring equal colors.
export function buildRestVolume(data){
  const [W,H,D]=data.size,front=unpack(data.views.front,W*H),back=unpack(data.views.back,W*H),side=unpack(data.views.side,W*H),cells=new Uint8Array(W*H*D),rows=[];
  const index=(x,y,z)=>(y*D+z)*W+x,inside=(x,y,z)=>x>=0&&x<W&&y>=0&&y<H&&z>=0&&z<D?cells[index(x,y,z)]:0;
  for(let y=0;y<H;y++){
    let lo=W,hi=-1;for(let x=0;x<W;x++)if(side[y*W+x]){lo=Math.min(lo,x);hi=x}rows.push([lo,hi]);
    for(let x=0;x<W;){
      if(!front[y*W+x]){x++;continue}const start=x;while(x<W&&front[y*W+x])x++;const end=x,center=(start+end)/2,radius=(end-start)/2;
      const depth=Math.min(D/2-.5,Math.max(2,(hi-lo+1)*.46));
      for(let xx=start;xx<end;xx++){
        const nx=(xx+.5-center)/Math.max(1,radius),rz=Math.max(1,depth*Math.sqrt(Math.max(0,1-nx*nx)));
        for(let z=0;z<D;z++)if(Math.abs(z+.5-D/2)<=rz)cells[index(xx,y,z)]=front[y*W+xx];
      }
    }
  }
  const colorAt=(x,y,z,axis,sign)=>{
    const fallback=sign>0?front[y*W+x]:back[y*W+W-1-x];
    if(axis===2)return fallback||front[y*W+x];
    const [lo,hi]=rows[y],sx=Math.max(0,Math.min(W-1,Math.round(lo+(hi-lo)*(z+.5)/D)));
    return side[y*W+sx]||fallback||front[y*W+x];
  };
  const positions=[],normals=[],colors=[],indices=[],dims=[W,H,D],rgb=data.palette.map(hex=>new THREE.Color(hex)),p=[0,0,0];
  for(let axis=0;axis<3;axis++){
    const u=(axis+1)%3,v=(axis+2)%3,mask=new Int16Array(dims[u]*dims[v]);
    for(let slice=0;slice<=dims[axis];slice++){
      let n=0;
      for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];i++){
        p[u]=i;p[v]=j;p[axis]=slice-1;const a=inside(...p);p[axis]=slice;const b=inside(...p);
        if(!!a===!!b){mask[n++]=0;continue}const sign=a?1:-1;p[axis]=a?slice-1:slice;mask[n++]=colorAt(...p,axis,sign)*sign;
      }
      for(let j=0;j<dims[v];j++)for(let i=0;i<dims[u];){
        const at=j*dims[u]+i,code=mask[at];if(!code){i++;continue}let w=1,h=1;
        while(i+w<dims[u]&&mask[at+w]===code)w++;
        outer:while(j+h<dims[v]){for(let k=0;k<w;k++)if(mask[at+h*dims[u]+k]!==code)break outer;h++}
        const first=positions.length/3,normal=[0,0,0],color=rgb[Math.abs(code)];normal[axis]=(code>0?1:-1)*(axis===1?-1:1);
        for(const [du,dv]of[[0,0],[w,0],[w,h],[0,h]]){p[axis]=slice;p[u]=i+du;p[v]=j+dv;positions.push((p[0]-data.foot[0])*data.unit,(data.foot[1]-p[1])*data.unit,(p[2]-D/2)*data.unit);normals.push(...normal);colors.push(color.r,color.g,color.b)}
        indices.push(...(code>0?[first,first+2,first+1,first,first+3,first+2]:[first,first+1,first+2,first,first+2,first+3]));
        for(let yy=0;yy<h;yy++)mask.fill(0,at+yy*dims[u],at+yy*dims[u]+w);i+=w;
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
export function createPixelRest(P,sprite,entry,anchor){
  const data=entry.restVolume;
  // Older sheets without volume data use their existing articulated 3D body.
  if(!data)return{mesh:null,update(active){sprite.visible=!active;P.rig.visible=active;return !active},dispose(){}};
  let shared=volumes.get(entry);if(!shared){shared={geometry:buildRestVolume(data),refs:0};volumes.set(entry,shared)}shared.refs++;
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0});material.color=sprite.material.color;
  const mesh=new THREE.Mesh(shared.geometry,material),bounds=shared.geometry.boundingBox,center=bounds.getCenter(new THREE.Vector3()),head=new THREE.Vector3((data.head[0]-data.foot[0])*data.unit,(data.foot[1]-data.head[1])*data.unit,0),headPoint=new THREE.Vector3();
  const upright=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0)),supine=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/2,0,0))),halo=new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2,0,0));
  mesh.name='pixel-rest-volume';mesh.castShadow=mesh.receiveShadow=false;mesh.visible=false;P.g.add(mesh);
  return{mesh,update(active,pose='lie',surface=0){
    sprite.visible=!active;mesh.visible=active;if(!active)return true;
    mesh.quaternion.copy(pose==='prone'?upright:supine);mesh.position.copy(center).applyQuaternion(mesh.quaternion).multiplyScalar(-1);mesh.position.y=surface+.012+(bounds.max.z-bounds.min.z)/2;
    headPoint.copy(head).applyQuaternion(mesh.quaternion).add(mesh.position);anchor.position.copy(headPoint);anchor.quaternion.copy(halo);P.tag.position.y=surface+.012+(bounds.max.z-bounds.min.z)+.2;
    return true;
  },dispose(){P.g.remove(mesh);material.dispose();if(--shared.refs===0){shared.geometry.dispose();volumes.delete(entry)}}};
}
