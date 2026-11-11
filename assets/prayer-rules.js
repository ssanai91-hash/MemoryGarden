// One layout/clock contract for the client and durable room. Facing the statues is -Z;
// the viewer's right is +X, east of Mary's former position (5.5, -10.5).
(function(root){
  const LAYOUT=Object.freeze({x:29,z:-3,width:20,depth:18,floor:.065,
    buddha:Object.freeze({x:23.8,z:-8.7}),mary:Object.freeze({x:35,z:-8.7}),
    box:Object.freeze({x:29.2,z:-8.2,reach:3.3})});
  const LIFE_MS=24*60*60*1000,MAX=20;
  const clean=(s,n)=>typeof s==='string'?s.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').trim().slice(0,n):'';
  const inside=(x,z,pad=0)=>Math.abs(x-LAYOUT.x)<=LAYOUT.width/2+pad&&Math.abs(z-LAYOUT.z)<=LAYOUT.depth/2+pad;
  const nearBox=(x,z)=>Math.hypot(x-LAYOUT.box.x,z-LAYOUT.box.z)<=LAYOUT.box.reach;
  const active=(state,now)=>Array.isArray(state?.items)?state.items.filter(c=>c.expiresAt>now):[];
  const publicState=(state,now)=>({rev:state?.rev||0,items:active(state,now).map(({id,slot,name,wish,litBy,createdAt,expiresAt})=>({id,slot,name,wish,litBy,createdAt,expiresAt}))});
  const display=(state,now)=>active(state,now).slice(0,MAX).map((c,i)=>({...c,displaySlot:i}));
  const nonce=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
  const BOW_MS=8000,DAY_MS=86400000,HALO_WHITE_MS=3*DAY_MS,HALO_RED_MS=7*DAY_MS;
  const NIMBUS_BOWS=100000;
  const NIMBUS_LAYOUT=Object.freeze({x:29,z:-60,y:30,rx:14.45,rz:11.9,boundaryZ:-108,height:102.4,width:68.8,gateZ:-21,palmTilt:0});
  // 기존 저장/통신 API 이름은 보존한다. 손바닥 대신 수평 공중 영역에서 근두운으로 수행한다.
  const palmHeight=()=>NIMBUS_LAYOUT.y;
  const hasNimbus=profile=>Number.isFinite(profile?.nimbusUnlockedAt)&&profile.nimbusUnlockedAt>0||Number.isSafeInteger(profile?.totalBows)&&profile.totalBows>=NIMBUS_BOWS;
  // 공중 수행 영역은 기존 두 반가사유상 뒤, 같은 정원의 높은 곳이다.
  function palmPosition(x,z){const L=NIMBUS_LAYOUT,dx=x-L.x,dz=z-L.z,d=Math.hypot(dx/L.rx,dz/L.rz);return d>1?{x:L.x+dx/d,z:L.z+dz/d}:{x,z}}
  const behindAltars=(x,z,pad=0)=>z<-14+pad&&Math.abs(x-NIMBUS_LAYOUT.x)<NIMBUS_LAYOUT.width/2+pad;
  function gardenPosition(x,z){
    const d=Math.hypot(x,z);if(d>90){x*=90/d;z*=90/d}
    if(behindAltars(x,z)&&z<NIMBUS_LAYOUT.gateZ)z=NIMBUS_LAYOUT.gateZ;
    return{x,z};
  }
  const CODE_ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const normalizeCode=value=>typeof value==='string'?value.toUpperCase().replace(/[\s-]/g,''):'';
  const validCode=value=>/^(?:[0-9]{5}|[2-9A-HJ-NP-Z]{20})$/.test(normalizeCode(value));
  // 개발자·관리자 코드. 일반 발급에서 제외하고, 이 코드로 입장하면 '모두 내보내기'를 쓸 수 있다.
  const ADMIN_CODE='99999',isAdminCode=value=>normalizeCode(value)===ADMIN_CODE;
  const formatCode=value=>/^[0-9]{5}$/.test(normalizeCode(value))?normalizeCode(value):normalizeCode(value).match(/.{1,4}/g)?.join('-')||'';
  function cleanHalos(value,now){
    const valid=(v,max)=>Number.isFinite(v)&&v>now&&v<=now+max?v:0;
    return{whiteUntil:valid(value?.whiteUntil,HALO_WHITE_MS),redUntil:valid(value?.redUntil,HALO_RED_MS)};
  }
  function haloState(value,now){const halos=cleanHalos(value,now),level=halos.redUntil?2:halos.whiteUntil?1:0;return{...halos,level,until:level===2?halos.redUntil:halos.whiteUntil}}
  function profileView(profile,now){return{id:profile.id,name:profile.name,look:profile.look,dog:profile.dog,progress:profile.progress||{},totalBows:profile.totalBows||0,nimbus:hasNimbus(profile),nimbusUnlockedAt:profile.nimbusUnlockedAt||0,nimbusGoal:NIMBUS_BOWS,completed:profile.completed||{},highestHalo:profile.highestHalo||0,halos:cleanHalos(profile.halos,now),target:profile.bow?.target===3000?3000:108}}
  // Count only server-timed new steps. Reset/restart changes the current bank,
  // never cumulative achievements. Each job carries its own accounting cursor.
  function accountProfile(profile,job,now){
    if(!job)return{profile:hasNimbus(profile)&&!profile.nimbusUnlockedAt?{...profile,nimbusUnlockedAt:now}:profile,job};
    const f=bowProgress(job,now),accounted=Number.isInteger(job.accountedCount)?job.accountedCount:job.count;
    const progress={...profile.progress,[f.target]:f.count},completed={...profile.completed};
    const totalBows=(profile.totalBows||0)+Math.max(0,f.count-accounted),halos={...cleanHalos(profile.halos,now)};
    const before=cleanHalos(f.halos,now);halos.whiteUntil=Math.max(halos.whiteUntil,before.whiteUntil);halos.redUntil=Math.max(halos.redUntil,before.redUntil);
    let rewarded=!!job.rewarded,highestHalo=profile.highestHalo||0;
    if(!rewarded&&f.completedAt&&f.count===f.target){rewarded=true;completed[f.target]=(completed[f.target]||0)+1;highestHalo=Math.max(highestHalo,f.target===3000?2:1)}
    const {done,finishedAt,...settled}=f;
    const state=haloState(halos,now),value={...settled,at:now,halos,haloUntil:state.until,haloLevel:state.level,accountedCount:f.count,rewarded};
    const nimbusUnlockedAt=profile.nimbusUnlockedAt||(totalBows>=NIMBUS_BOWS?now:0);
    return{profile:{...profile,progress,completed,totalBows,nimbusUnlockedAt,highestHalo,halos,bow:value,updatedAt:now},job:value};
  }
  // A compact clock anchor, shared by server, returning participant and watching friends.
  function bowProgress(job,now){
    if(!job)return null;
    const target=job.target===3000?3000:108,active=['auto','single'].includes(job.mode),limit=job.mode==='single'?1:Math.max(0,target-job.count);
    const total=(job.elapsed||0)+(active&&!job.paused?Math.max(0,now-job.at):0),steps=active?Math.min(limit,Math.floor(total/BOW_MS)):0;
    const done=active&&steps>=limit,finishedAt=active&&!job.paused?job.at+Math.max(0,limit*BOW_MS-(job.elapsed||0)):null;
    const count=Math.min(target,job.count+steps),earned=done&&job.count<target&&count===target;
    const halos=cleanHalos(job.halos||{whiteUntil:job.haloUntil||0},now);
    if(earned){if(target===3000)halos.redUntil=Math.max(halos.redUntil,finishedAt+HALO_RED_MS);else halos.whiteUntil=Math.max(halos.whiteUntil,finishedAt+HALO_WHITE_MS)}
    const halo=haloState(halos,now);
    return{...job,target,count,mode:done?'idle':job.mode,paused:done?false:!!job.paused,elapsed:done||!active?0:total%BOW_MS,
      halos,haloUntil:halo.until,haloLevel:halo.level,completedAt:earned?finishedAt:job.completedAt||0,finishedAt,done};
  }
  function settleBow(job,now){const f=bowProgress(job,now);if(!f)return null;const {done,finishedAt,...value}=f;return{...value,at:now,rev:job.rev+1}}
  root.GardenPrayer=Object.freeze({LAYOUT,LIFE_MS,MAX,BOW_MS,DAY_MS,HALO_WHITE_MS,HALO_RED_MS,NIMBUS_BOWS,NIMBUS_LAYOUT,hasNimbus,palmHeight,palmPosition,gardenPosition,behindAltars,normalizeCode,validCode,formatCode,ADMIN_CODE,isAdminCode,cleanHalos,haloState,profileView,accountProfile,bowProgress,settleBow,clean,inside,nearBox,active,display,publicState,nonce});
})(globalThis);
