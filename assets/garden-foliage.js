// Extra crowns use a separate RNG: existing species, tree positions and collisions stay identical.
export function lushTreeCrowns(tree,color){
  const{x,z,h,w,id,form,palette,scale}=tree;
  let seed=((Math.round(x*100)*73856093)^(Math.round(z*100)*19349663)^id.split('').reduce((n,c)=>Math.imul(n,31)+c.charCodeAt(0),7))>>>0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const tiers=[[],[]],understory=[];
  const family=form==='pine'?'pinePads':form==='spire'?'needles':form==='willow'?'curtains':form==='fan'?'fanLeaves':form==='maple'?'mapleLeaves':form==='flower'?'flowerLeaves':form==='magnolia'?'broadLeaves':'leaves';
  const base=form==='flower'?6:form==='maple'?7:form==='magnolia'?4:form==='column'?9:form==='birch'?8:form==='willow'?10:form==='pine'||form==='spire'?5:7;
  const extra=form==='pine'||form==='spire'?2:base,balanced=form==='pine'||form==='spire'?1:Math.max(1,Math.round(base*.4));
  const crown=(family,px,y,pz,sx,sy,sz,i,shade=1)=>{
    const upper=Math.max(0,Math.min(1,(y/h-.4)/.55)),c=color(palette[Math.floor(random()*palette.length)]).multiplyScalar(shade*(.82+upper*.26));
    tiers[i<balanced?0:1].push({family,x:px,y,z:pz,sx,sy,sz,ry:random()*Math.PI,rx:(random()-.5)*.16,rz:(random()-.5)*.1,c});
  };
  for(let i=0;i<extra;i++){
    if(form==='willow'){
      const a=(i+.5)/extra*Math.PI*2,r=w*(.57+random()*.24);
      crown(family,x+Math.cos(a)*r,h*(.44+random()*.12),z+Math.sin(a)*r,w*.18,h*.32,w*.18,i,.95);
    }else if(form==='pine'||form==='spire'){
      const f=i/(extra-1),y=h*(.51+f*.28),size=w*(.7-f*.27);
      crown(family,x+(random()-.5)*w*.3,y,z+(random()-.5)*w*.3,size,h*(form==='pine'?.19:.32),size*.85,i);
    }else{
      const inner=i<2,small=i===extra-1||(i===extra-2&&extra>5),column=form==='column',flat=['maple','flower','fan','umbrella'].includes(form);
      const a=i*2.39996+random()*.2,r=inner?w*.15:w*(column?.28:.7+random()*.2),y=h*(inner?.66+i*.11:column?.49+i/extra*.38:flat?.73+random()*.12:.65+random()*.24);
      const size=w*(inner?.64:small?.26:.48),height=h*(inner?.13:small?.065:flat?.085:.12);
      crown(inner&&!['fan','birch'].includes(form)?'cores':family,x+Math.cos(a)*r,y,z+Math.sin(a)*r,size,height,size*(inner?.9:.8),i,inner?.83:1);
    }
  }
  if(form==='flower'||form==='magnolia'){
    const count=form==='magnolia'?20:14;
    for(let i=0;i<count;i++){
      const a=random()*Math.PI*2,r=w*(.25+random()*.65),size=(form==='magnolia'?.24:.15)*scale;
      const c=color(form==='magnolia'?(random()<.5?0xfff4de:0xe9c8d0):(id==='cherry'?(random()<.5?0xf6d4dd:0xeeb4c8):(random()<.5?0xf6f1e3:0xe6dccd)));
      tiers[i<Math.round(count*.4)?0:1].push({family:'petals',x:x+Math.cos(a)*r,y:h*(.66+random()*.23),z:z+Math.sin(a)*r,sx:size,sy:size*(form==='magnolia'?1.8:.7),sz:size,ry:a,c});
    }
  }
  for(let i=0;i<4;i++){
    const a=random()*Math.PI*2,r=(.65+random()*.7)*scale,s=(.35+random()*.22)*scale;
    understory.push({family:i<2?'shrub':'fern',x:x+Math.cos(a)*r,y:s*.55,z:z+Math.sin(a)*r,sx:s,sy:s*(i<2?.6:1.1),sz:s*.8,ry:a,c:color(i%2?0x5f8054:0x789963)});
  }
  return{tiers,understory,base,balanced,extra};
}
