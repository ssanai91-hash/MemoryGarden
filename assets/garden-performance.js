// Display cadence is independent of Web Audio, server time and physics steps.
export function frameLimit({moving=false,recentMotion=false,resting=false,idle=false,effect=false,power=false}={}){
 let cap=idle?15:resting?20:30;
 if(moving||recentMotion)cap=60;
 if(effect)cap=Math.max(30,cap);
 if(power)cap=Math.min(cap,resting&&!moving&&!recentMotion&&!effect?15:30);
 return cap;
}
export function createFramePacer(now=0){
 let lastActivity=now,lastMotion=-Infinity,next=0,lastCap=0;
 return{input(time,motion=false){lastActivity=time;if(motion)lastMotion=time},
 cap(time,state){return frameLimit({...state,recentMotion:time-lastMotion<1500,idle:time-lastActivity>=60000&&!state.moving})},
 due(time,cap){if(cap!==lastCap){next=0;lastCap=cap}if(time+.15<next)return false;next=time+1000/cap;return true},
 reset(){next=0;lastCap=0}};
}
export function qualityDecision({level,touch,mean,p90,bad,good,elapsed}){
 bad=mean>22||p90>32?bad+elapsed:0;good=mean<9&&p90<14?good+elapsed:0;
 const max=touch?1:2;
 if(bad>=6000&&level>0)return{level:level-1,bad:0,good:0};
 if(good>=30000&&level<max)return{level:level+1,bad:0,good:0};
 return{level,bad,good};
}

export function disableActorShadows(root){root.traverse(o=>{if(o.isMesh)o.castShadow=false});return root}
export function createShadowBudget(){
 let last=-Infinity,gx=Infinity,gz=Infinity,key='',direction=null;
 return{plan(now,position,dir,scene='garden'){
  const x=Math.round(position.x/4)*4,z=Math.round(position.z/4)*4,len=Math.hypot(dir.x,dir.y,dir.z)||1,n={x:dir.x/len,y:dir.y/len,z:dir.z/len};
  const turned=!direction||n.x*direction.x+n.y*direction.y+n.z*direction.z<Math.cos(Math.PI/360);
  const update=scene!==key||x!==gx||z!==gz||turned||now-last>=1000;
  if(update){last=now;gx=x;gz=z;direction=n;key=scene}
  return{update,x,z};
 },reset(){last=-Infinity;key=''}};
}

export function powerSavingState(mode,battery){return mode==='on'||mode==='auto'&&!!battery&&!battery.charging&&Number.isFinite(battery.level)&&battery.level<=.3}
export function createPowerSaving({storage,getBattery,onChange=()=>{},notify=()=>{}}){
 const key='garden.powerSaving.v1',valid=v=>['auto','on','off'].includes(v),saved=storage.get(key);let mode=valid(saved)?saved:'auto',battery=null,active=mode==='on',notified=false,disposed=false;
 function announce(){if(active&&!notified){notified=true;notify()}}
 function refresh(){const next=powerSavingState(mode,battery);if(next!==active){active=next;onChange(active)}announce()}
 const api={get mode(){return mode},get active(){return active},get supported(){return !!battery},setMode(value){if(!valid(value))return;mode=value;storage.set(key,value);refresh()},
 async start(){announce();if(typeof getBattery!=='function')return;try{const value=await getBattery();if(disposed)return;battery=value;for(const type of['levelchange','chargingchange'])battery.addEventListener(type,refresh);refresh()}catch{}},
 dispose(){disposed=true;if(battery)for(const type of['levelchange','chargingchange'])battery.removeEventListener(type,refresh)}};
 return api;
}
