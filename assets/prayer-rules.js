// One layout/clock contract for the client and durable room. Facing the statues is -Z;
// the viewer's right is +X, east of Mary's former position (5.5, -10.5).
(function(root){
  const LAYOUT=Object.freeze({x:29,z:-3,width:20,depth:18,floor:.065,
    buddha:Object.freeze({x:23.8,z:-8.7}),mary:Object.freeze({x:35,z:-8.7}),
    box:Object.freeze({x:29.2,z:-8.2,reach:3.3})});
  const LIFE_MS=24*60*60*1000,MAX=128;
  const clean=(s,n)=>typeof s==='string'?s.normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').trim().slice(0,n):'';
  const inside=(x,z,pad=0)=>Math.abs(x-LAYOUT.x)<=LAYOUT.width/2+pad&&Math.abs(z-LAYOUT.z)<=LAYOUT.depth/2+pad;
  const nearBox=(x,z)=>Math.hypot(x-LAYOUT.box.x,z-LAYOUT.box.z)<=LAYOUT.box.reach;
  const active=(state,now)=>Array.isArray(state?.items)?state.items.filter(c=>c.expiresAt>now):[];
  const publicState=(state,now)=>({rev:state?.rev||0,items:active(state,now).map(({id,slot,name,wish,litBy,createdAt,expiresAt})=>({id,slot,name,wish,litBy,createdAt,expiresAt}))});
  const nonce=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
  root.GardenPrayer=Object.freeze({LAYOUT,LIFE_MS,MAX,clean,inside,nearBox,active,publicState,nonce});
})(globalThis);
