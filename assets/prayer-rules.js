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
  const BOW_MS=8000;
  // A compact clock anchor, shared by server, returning participant and watching friends.
  function bowProgress(job,now){
    if(!job)return null;
    const target=job.target===3000?3000:108,active=['auto','single'].includes(job.mode),limit=job.mode==='single'?1:Math.max(0,target-job.count);
    const total=(job.elapsed||0)+(active&&!job.paused?Math.max(0,now-job.at):0),steps=active?Math.min(limit,Math.floor(total/BOW_MS)):0;
    const done=active&&steps>=limit,finishedAt=active&&!job.paused?job.at+Math.max(0,limit*BOW_MS-(job.elapsed||0)):null;
    const count=Math.min(target,job.count+steps),earned=done&&job.count<target&&count===target;
    return{...job,target,count,mode:done?'idle':job.mode,paused:done?false:!!job.paused,elapsed:done||!active?0:total%BOW_MS,
      haloUntil:earned?finishedAt+LIFE_MS:job.haloUntil||0,completedAt:earned?finishedAt:job.completedAt||0,finishedAt,done};
  }
  function settleBow(job,now){const f=bowProgress(job,now);if(!f)return null;const {done,finishedAt,...value}=f;return{...value,at:now,rev:job.rev+1}}
  root.GardenPrayer=Object.freeze({LAYOUT,LIFE_MS,MAX,BOW_MS,bowProgress,settleBow,clean,inside,nearBox,active,display,publicState,nonce});
})(globalThis);
