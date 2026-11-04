/* 사유의 방 체험: 공간·불상 코드는 index.html에서 관리한다. */
function createSayuExperience({THREE,canvas,camera,statues,radius,starBrightness}){
const $=s=>document.querySelector(s);
/* ---------- 시점 ---------- */
const R=radius;
const st={x:0,z:8.2,eye:1.6,yaw:0,pitch:.05};
let locked=true;
function applyCam(){
  camera.position.set(st.x,st.eye,st.z);
  const cp=Math.cos(st.pitch);
  camera.lookAt(st.x-Math.sin(st.yaw)*cp,st.eye+Math.sin(st.pitch),st.z-Math.cos(st.yaw)*cp);
}
function clampPos(){
  const d=Math.hypot(st.x,st.z);if(d>R-.9){st.x*=(R-.9)/d;st.z*=(R-.9)/d;}
  for(const s of statues){const dx=st.x-s.x,dz=st.z-s.z,dd=Math.hypot(dx,dz);if(dd<1.15){if(dd<.0001){st.z=s.z+1.15;continue;}st.x=s.x+dx/dd*1.15;st.z=s.z+dz/dd*1.15;}}
}

/* 트윈 */
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
const tweens=[];
function tween(props,dur){return new Promise(res=>{const from={};for(const k in props)from[k]=st[k];
  if('yaw' in props){let d=props.yaw-from.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));props.yaw=from.yaw+d;}
  tweens.push({from,props,dur,t:0,res});});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/* 끌어서 둘러보기 / 탭으로 다가가기 */
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(locked)return;drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(locked||!drag||e.pointerId!==drag.id)return;
  const k=2.6/Math.max(innerWidth,innerHeight);
  st.yaw+=(e.clientX-drag.x)*k; st.pitch=Math.max(-1.2,Math.min(1.1,st.pitch+(e.clientY-drag.y)*k));
  drag.x=e.clientX;drag.y=e.clientY;});
canvas.addEventListener('pointerup',e=>{if(locked){drag=null;return;}if(!drag)return;const moved=Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy);drag=null;if(moved<8)pick(e);});
canvas.addEventListener('pointercancel',()=>drag=null);
const ray=new THREE.Raycaster();
function pick(e){
  const r=canvas.getBoundingClientRect();
  ray.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},camera);
  for(const s of statues){if(ray.intersectObject(s.grp,true).length){approach(s);return;}}
}
async function approach(s){
  if(locked)return;locked=true;resetInput();
  const tx=s.x,tz=s.z+2.1;
  const yaw0=Math.atan2(-(tx-st.x),-(tz-st.z));
  const dist=Math.hypot(tx-st.x,tz-st.z);
  if(dist>.3){await tween({yaw:yaw0,pitch:0},.9);await tween({x:tx,z:tz},Math.max(1.4,dist*.75));}
  await tween({yaw:0,pitch:Math.atan2(2.05-st.eye,2.1)},1.3);
  locked=false;
}

/* 걷기 */
const keys={};let padDir=0;
function resetInput(){for(const k in keys)delete keys[k];padDir=0;drag=null;}
addEventListener("blur",resetInput);
document.addEventListener("visibilitychange",resetInput);
addEventListener('keydown',e=>{keys[e.key.toLowerCase()]=true;});
addEventListener('keyup',e=>{keys[e.key.toLowerCase()]=false;});
for(const [id,dir] of [['#fw',1],['#bw',-1]]){const b=$(id);
  b.addEventListener('pointerdown',e=>{e.preventDefault();padDir=dir;b.setPointerCapture(e.pointerId);});
  for(const ev of ['pointerup','pointercancel','pointerleave'])b.addEventListener(ev,()=>{padDir=0;});}

/* ---------- 소리: 싱잉볼과 낮은 울림 ---------- */
let ac=null,master=null,droneGain=null,soundOn=true;
function initAudio(){
  try{ac=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  master=ac.createGain();master.gain.value=.9;master.connect(ac.destination);
  // 잔향
  const conv=ac.createConvolver();const len=ac.sampleRate*4.5,ir=ac.createBuffer(2,len,ac.sampleRate);
  for(let c=0;c<2;c++){const d=ir.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.6);}
  conv.buffer=ir;const wet=ac.createGain();wet.gain.value=.35;conv.connect(wet);wet.connect(master);
  ac._rev=conv;
  // 공간의 낮은 울림
  droneGain=ac.createGain();droneGain.gain.value=0;droneGain.connect(master);droneGain.connect(conv);
  for(const [f,v] of [[55,.05],[82.4,.03],[110.2,.012]]){const o=ac.createOscillator();o.frequency.value=f;const g=ac.createGain();g.gain.value=v;
    const lfo=ac.createOscillator();lfo.frequency.value=.05+Math.random()*.05;const lg=ac.createGain();lg.gain.value=v*.6;lfo.connect(lg);lg.connect(g.gain);
    o.connect(g);g.connect(droneGain);o.start();lfo.start();}
  // 공기 소리
  const nb=ac.createBuffer(1,ac.sampleRate*3,ac.sampleRate),nd=nb.getChannelData(0);let last=0;
  for(let i=0;i<nd.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;nd[i]=last*3;}
  const ns=ac.createBufferSource();ns.buffer=nb;ns.loop=true;const nf=ac.createBiquadFilter();nf.type='lowpass';nf.frequency.value=380;
  const ngn=ac.createGain();ngn.gain.value=.05;ns.connect(nf);nf.connect(ngn);ngn.connect(droneGain);ns.start();
  droneGain.gain.linearRampToValueAtTime(1,ac.currentTime+6);
}
function bowl(vol=1,base=196){
  if(!ac||!soundOn)return;const t=ac.currentTime;
  const parts=[[1,1,9],[2.71,.5,6.5],[5.15,.22,4],[8.1,.1,2.6],[1.003,.6,9]];
  for(const [m,a,dec] of parts){const o=ac.createOscillator();o.type='sine';o.frequency.value=base*m;
    const g=ac.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.12*a*vol,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dec);
    o.connect(g);g.connect(master);g.connect(ac._rev);o.start(t);o.stop(t+dec+.1);}
}
function knock(){ // 절할 때 바닥에 닿는 작은 목탁 소리
  if(!ac||!soundOn)return;const t=ac.currentTime;const o=ac.createOscillator();o.frequency.setValueAtTime(420,t);o.frequency.exponentialRampToValueAtTime(260,t+.12);
  const g=ac.createGain();g.gain.setValueAtTime(.22,t);g.gain.exponentialRampToValueAtTime(.0001,t+.35);o.connect(g);g.connect(master);g.connect(ac._rev);o.start(t);o.stop(t+.4);}

/* ---------- 연출 ---------- */
function toast(txt,ms=2600){const el=$('#toast');el.textContent=txt;el.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>el.style.opacity=0,ms);}
function showUI(v){for(const id of ['#bar','#pad','#hint'])$(id).style.opacity=v?1:0;$('#bar').style.pointerEvents=v?'auto':'none';$('#pad').style.pointerEvents=v?'auto':'none';}

async function bowOnce(){
  const p0=st.pitch;
  await tween({eye:1.05,pitch:-.1},1.5);
  await tween({eye:.55,pitch:-1.05},1.8);
  knock();
  await wait(1500);
  await tween({eye:1.0,pitch:-.25},1.5);
  await tween({eye:1.6,pitch:p0},1.5);
}
async function bow(n){
  if(locked)return;locked=true;resetInput();showUI(false);
  for(let i=0;i<n;i++){if(n>1)toast(['일배','이배','삼배'][i],2000);await bowOnce();await wait(400);}
  bowl(.7);locked=false;showUI(true);
}

/* 명상 */
let med=null;let wakeLock=null;
async function startMed(min){
  if(med||!locked)return;resetInput();
  $('#pick').hidden=true;locked=true;showUI(false);
  med={end:Date.now()+min*60000,start:Date.now()};
  try{wakeLock=await navigator.wakeLock?.request('screen');}catch(e){}
  bowl(1);
  $('#medi').classList.add('on','reveal');$('#mStop').focus();
}
async function endMed(done){
  if(!med)return;med=null;$('#medi').classList.remove('on','reveal');
  try{wakeLock&&wakeLock.release();}catch(e){}wakeLock=null;
  starBrightness.value=1;
  if(done){bowl(.9);await wait(2600);bowl(.8,174.6);await wait(2600);bowl(1);toast('명상을 마쳤습니다',3500);}
  locked=false;showUI(true);
}
$('#medi').addEventListener('pointerdown',e=>{if(e.target.id==='mStop')return;$('#medi').classList.add('reveal');clearTimeout(endMed._t);endMed._t=setTimeout(()=>$('#medi').classList.remove('reveal'),3500);});
$('#mStop').addEventListener('click',()=>endMed(false));

/* 버튼 */
$('#bBow').addEventListener('click',()=>bow(1));
$('#bBow3').addEventListener('click',()=>bow(3));
$('#bMed').addEventListener('click',()=>{if(!locked){locked=true;resetInput();$('#pick').hidden=false;$('#pickCancel').focus();}});
$('#pickCancel').addEventListener('click',()=>{ $('#pick').hidden=true;locked=false;$('#bMed').focus(); });
document.querySelectorAll('#pick [data-min]').forEach(b=>b.addEventListener('click',()=>startMed(+b.dataset.min)));
$('#bSnd').addEventListener('click',()=>{soundOn=!soundOn;$('#bSnd').setAttribute('aria-pressed',soundOn);
  if(master){master.gain.cancelScheduledValues(ac.currentTime);master.gain.setTargetAtTime(soundOn?.9:0,ac.currentTime,.15);if(soundOn)ac.resume().catch(()=>{});}});

/* 입장 */
$('#enter').addEventListener('click',async()=>{
  if($('#enter').disabled)return;$('#enter').disabled=true;
  initAudio();if(ac&&ac.state==='suspended')ac.resume().catch(()=>{});
  $('#gate').classList.add('gone');
  setTimeout(()=>bowl(.8),1600);
  await tween({z:5.4,pitch:.12},6.5);
  locked=false;$('#bar').hidden=false;$('#pad').hidden=false;showUI(true);
  setTimeout(()=>$('#hint').style.opacity=0,9000);
});
$('#hint').style.opacity=0;


document.addEventListener('visibilitychange',async()=>{
  if(document.hidden){if(ac)ac.suspend().catch(()=>{});return;}
  if(ac&&soundOn)ac.resume().catch(()=>{});
  if(med&&med.end>Date.now()){
    try{if(!wakeLock||wakeLock.released)wakeLock=await navigator.wakeLock?.request('screen');}catch(e){}
  }
});

return {update(now,dt){
  for(let i=tweens.length-1;i>=0;i--){const tw=tweens[i];tw.t+=dt/tw.dur;const k=ease(Math.min(1,tw.t));
    for(const p in tw.props)st[p]=tw.from[p]+(tw.props[p]-tw.from[p])*k;
    if(tw.t>=1){tweens.splice(i,1);tw.res();}}
  if(!locked){
    let mv=padDir;if(keys['w']||keys['arrowup'])mv=1;if(keys['s']||keys['arrowdown'])mv=-1;
    if(keys['a']||keys['arrowleft'])st.yaw+=dt*1.2;if(keys['d']||keys['arrowright'])st.yaw-=dt*1.2;
    if(mv){st.x-=Math.sin(st.yaw)*mv*dt*1.1;st.z-=Math.cos(st.yaw)*mv*dt*1.1;clampPos();}
  }
  if(med){
    const el=(Date.now()-med.start)/1000,cyc=el%10,inhale=cyc<4;
    const br=inhale?cyc/4:1-(cyc-4)/6;
    starBrightness.value=.55+.75*ease(br);
    const b=$('#breath');const want=inhale?'들이쉬고':'내쉬고';if(b.textContent!==want)b.textContent=want;
    const left=Math.max(0,med.end-Date.now());const m=Math.floor(left/60000),s=Math.floor(left/1000)%60;
    $('#remain').textContent=m+':'+String(s).padStart(2,'0');
    if(left<=0)endMed(true);
  }
  applyCam();
}};
}
