/* Shared by the garden and room server. Care uses real milliseconds, not gardenHour(). */
(function(root){
  const LOG_MS=2*60*60*1000,MAX_LOGS=5,MAX_MS=LOG_MS*MAX_LOGS,COOLDOWN_MS=30000;
  const PILE=Object.freeze({x:7.6,z:0,r:2.25}),FEED=Object.freeze({x:3.1,z:0});
  function initial(now){return{version:1,fuelUntil:now+LOG_MS*2,rev:0,last:null,recent:{}}}
  function frame(state,now){
    const left=Math.max(0,Math.min(MAX_MS,(state?.fuelUntil||0)-now));
    const q=left/LOG_MS;
    const flame=q<=.04?0:.16+.84*Math.pow((q-.04)/(MAX_LOGS-.04),.5);
    const heat=Math.min(1,q/.12);
    const stage=left===0?'out':q<=.04?'embers':q<.3?'low':q<1?'steady':'bright';
    return{left,flame,heat,stage,logs:Math.ceil(q),level:Math.ceil(q),room:Math.max(0,Math.floor((MAX_MS-left)/LOG_MS+1e-7))};
  }
  function canAdd(state,now,count=1){return Number.isInteger(count)&&count>=1&&count<=MAX_LOGS&&count<=frame(state,now).room}
  function add(state,now,actor,token,count=1){
    if(!canAdd(state,now,count))throw new RangeError('firewood capacity');
    const left=frame(state,now).left;
    const recent=Object.fromEntries(Object.entries(state.recent||{}).filter(([,v])=>v.at>now-COOLDOWN_MS*2));
    recent[actor.id]={at:now,token};
    return{version:1,fuelUntil:now+Math.min(MAX_MS,left+LOG_MS*count),rev:(state.rev||0)+1,
      last:{name:actor.name,at:now,count,kind:left===0?'relit':'added'},recent};
  }
  function visual(frame,saving=false){
    const f=Math.max(0,Math.min(1,frame.flame||0)),heat=Math.max(0,Math.min(1,frame.heat||0)),density=saving?.65:1;
    return{body:f>0?Math.ceil((180+380*f)*density):0,core:f>0?Math.ceil((65+155*f)*density):0,sparks:heat>0?Math.ceil((12+188*f)*density):0,
      height:2+4.5*f,coreHeight:1.4+2.8*f,sparkHeight:5+10*f,width:.5+.55*f,sway:.24+.43*f};
  }
  function publicState(state){const{recent,...value}=state;return value}
  root.GardenCampfire=Object.freeze({LOG_MS,MAX_LOGS,MAX_MS,COOLDOWN_MS,PILE,FEED,initial,frame,canAdd,add,visual,publicState});
})(globalThis);
