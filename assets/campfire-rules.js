/* Shared by the garden and room server. Care uses real milliseconds, not gardenHour(). */
(function(root){
  const LOG_MS=2*60*60*1000,MAX_MS=12*60*60*1000,COOLDOWN_MS=30000;
  const PILE=Object.freeze({x:7.6,z:0,r:2.25}),FEED=Object.freeze({x:3.1,z:0});
  function initial(now){return{version:1,fuelUntil:now+LOG_MS*2,rev:0,last:null,recent:{}}}
  function frame(state,now){
    const left=Math.max(0,Math.min(MAX_MS,(state?.fuelUntil||0)-now));
    const q=left/LOG_MS;
    const flame=Math.pow(Math.min(1,Math.max(0,(q-.04)/5.96)),.35);
    const heat=Math.min(1,q/.12);
    const stage=left===0?'out':q<=.04?'embers':q<.3?'low':q<1?'steady':'bright';
    return{left,flame,heat,stage,logs:Math.ceil(q)};
  }
  function add(state,now,actor,token){
    const left=frame(state,now).left;
    const recent=Object.fromEntries(Object.entries(state.recent||{}).filter(([,v])=>v.at>now-COOLDOWN_MS*2));
    recent[actor.id]={at:now,token};
    return{version:1,fuelUntil:now+Math.min(MAX_MS,left+LOG_MS),rev:(state.rev||0)+1,
      last:{name:actor.name,at:now,kind:left===0?'relit':'added'},recent};
  }
  function publicState(state){const{recent,...value}=state;return value}
  root.GardenCampfire=Object.freeze({LOG_MS,MAX_MS,COOLDOWN_MS,PILE,FEED,initial,frame,add,publicState});
})(globalThis);
