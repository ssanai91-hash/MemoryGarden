// Private personal entry code UI and per-person device cache. No code in URLs,
// public presence, names, logs or clipboard until the owner presses Copy.
export function createGardenIdentity({document,storage,crypto,onSwitch,onMode,now=()=>Date.now()}) {
  const rules=globalThis.GardenPrayer,KEY='garden.identity.v1';
  const read=(key,fallback=null)=>{try{return JSON.parse(storage.get(key)||'null')||fallback}catch{return fallback}};
  let active=read(KEY),mode='saved',view=null,timer=null;
  if(!rules.validCode(active?.code))active=null;
  let legacyAllowed=!active?.registered;
  const cacheKey=()=>active?'garden.person.cache.'+rules.normalizeCode(active.code):'';
  const cache=()=>read(cacheKey(),{values:{}});
  const saveCache=value=>active&&storage.set(cacheKey(),JSON.stringify(value));
  const code=()=>rules.formatCode(active?.code||'');
  function create(){
    if(active?.registered)legacyAllowed=false;
    const bytes=new Uint8Array(20);crypto.getRandomValues(bytes);const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    active={code:rules.formatCode([...bytes].map(n=>alphabet[n&31]).join('')),registered:false,action:'create'};
    storage.set(KEY,JSON.stringify(active));mode='saved';renderEntry();onMode?.();
  }
  const entry=document.createElement('section');entry.className='personal-entry';entry.setAttribute('aria-label','개인 기록');
  const label=document.createElement('strong'),summary=document.createElement('p'),row=document.createElement('div');row.className='row';
  const restore=document.createElement('button'),fresh=document.createElement('button'),input=document.createElement('input'),error=document.createElement('p');
  restore.type=fresh.type='button';restore.textContent='내 코드로 돌아오기';fresh.textContent='새 코드 만들기';
  input.id='personalEntryCode';input.type='text';input.placeholder='개인 입장 코드';input.autocomplete='off';input.spellcheck=false;input.maxLength=32;input.setAttribute('aria-label','개인 입장 코드');input.setAttribute('autocapitalize','characters');
  error.setAttribute('role','status');error.className='personal-status';row.append(restore,fresh);entry.append(label,summary,input,row,error);
  document.getElementById('nameForm').prepend(entry);
  const style=document.createElement('style');style.textContent='.personal-entry{padding:.7rem;border:1px solid #8b9a7a66;border-radius:12px;margin-bottom:.9rem;text-align:left}.personal-entry p{margin:.35rem 0;font-size:.86rem}.personal-entry input{width:100%;box-sizing:border-box}.personal-entry .row{display:flex;gap:.4rem;flex-wrap:wrap}.personal-entry button{font-size:.82rem}.personal-restoring>:not(.personal-entry):not(#nameSubmit):not(#entryHint):not(#nameCancel){display:none!important}.personal-code{font-size:1.05rem;letter-spacing:.07em;word-break:break-word;user-select:all}.personal-stats{white-space:pre-line;line-height:1.7}.personal-status{color:#815332}';document.head.append(style);
  function renderEntry(){
    label.textContent=mode==='restore'?'기존 개인 코드로 입장':active?.registered?'내 기록으로 입장':'처음 방문 · 개인 코드 발급';
    summary.textContent=mode==='restore'?'다른 기기에서도 같은 코드로 기록을 이어갑니다.':active?.registered?'절 횟수와 후광 기록을 불러옵니다.':'입장하면 나만의 코드를 한 번 만들고 기록을 보관합니다.';
    input.hidden=mode!=='restore';document.getElementById('nameForm').classList.toggle('personal-restoring',mode==='restore');
  }
  restore.onclick=()=>{mode='restore';error.textContent='';renderEntry();input.focus();onMode?.()};
  fresh.onclick=()=>{create();error.textContent='새 개인 기록으로 시작합니다.'};
  input.oninput=()=>{input.setCustomValidity('');error.textContent='';onMode?.()};
  const dialog=document.createElement('dialog');dialog.className='home-install-help';dialog.setAttribute('aria-labelledby','personalTitle');
  const heading=document.createElement('h2');heading.id='personalTitle';heading.textContent='내 입장 코드';
  const secret=document.createElement('p');secret.className='personal-code';
  const note=document.createElement('p');note.textContent='이 코드를 보관해 주세요. 코드를 아는 사람은 내 기록으로 입장할 수 있어요.';
  const stats=document.createElement('p');stats.className='personal-stats';
  const status=document.createElement('p');status.setAttribute('role','status');
  const copy=document.createElement('button'),change=document.createElement('button'),close=document.createElement('button');
  for(const b of[copy,change,close])b.type='button';copy.textContent='코드 복사';change.textContent='다른 코드로 입장';close.textContent='닫기';
  dialog.append(heading,secret,note,stats,status,copy,change,close);document.body.append(dialog);
  const button=document.createElement('button');button.type='button';button.textContent='내 입장 코드';document.querySelector('.room-actions').append(button);
  const remain=until=>{const hours=Math.max(0,Math.ceil((until-now())/3600000));return hours?hours>=24?Math.floor(hours/24)+'일 '+hours%24+'시간':hours+'시간':'꺼짐'};
  function render(){const p=view||cache().profile,halos=rules.haloState(p?.halos,now());secret.textContent=code()||'입장 후 발급됩니다.';stats.textContent=p?'누적 '+p.totalBows+'배\n108배 완료 '+(p.completed?.[108]||0)+'회 · 3000배 완료 '+(p.completed?.[3000]||0)+'회\n108배 진행 '+(p.progress?.[108]||0)+'/108 · 3000배 진행 '+(p.progress?.[3000]||0)+'/3000\n획득 후광 '+(p.highestHalo===2?'빨간색':p.highestHalo===1?'흰색':'없음')+'\n흰 후광 '+remain(halos.whiteUntil)+' · 빨간 후광 '+remain(halos.redUntil):'정원에 연결하면 개인 기록을 보관합니다.';status.textContent=active?.registered?'개인 기록을 저장했어요.':'아직 기록 저장을 확인하지 못했어요.'}
  function open(){render();dialog.showModal();clearInterval(timer);timer=setInterval(render,1000)}
  button.onclick=open;close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{clearInterval(timer);timer=null});
  copy.onclick=async()=>{try{if(!active)throw Error();await navigator.clipboard.writeText(code());status.textContent='코드를 복사했어요.'}catch{status.textContent='코드를 길게 눌러 복사해 주세요.'}};
  change.onclick=()=>{dialog.close();mode='restore';renderEntry();onSwitch?.()};
  function confirm(person){const different=cache().profile?.id!==person.id;legacyAllowed=false;active.registered=true;active.action='restore';storage.set(KEY,JSON.stringify(active));view=person;const c=cache();c.profile=person;c.values={...c.values,'garden.bows':String(person.progress?.[108]||0),'garden.bows.3000':String(person.progress?.[3000]||0),'garden.bowTarget':String(person.target||108),'garden.bowHalos':JSON.stringify(person.halos||{}),'garden.bowHaloUntil':String(rules.haloState(person.halos,now()).until)};saveCache(c);error.textContent='';renderEntry();if(dialog.open)render();return different}
  renderEntry();
  return{
    updateEntry(entered){entry.hidden=entered;if(!entered)renderEntry()},importing:()=>mode==='restore',valid:()=>mode!=='restore'||rules.validCode(input.value),
    prepare(){if(mode==='restore'){if(!rules.validCode(input.value)){input.setCustomValidity('개인 입장 코드를 확인해 주세요.');input.reportValidity();return false}active={code:rules.formatCode(input.value),registered:true,action:'restore'};view=null}else if(!active)create();return true},
    credentials(){return active?{personalCode:active.code,personalAction:active.registered?'restore':'create'}:{}},
    restore(saved){if(rules.validCode(saved?.personalCode)){active={code:rules.formatCode(saved.personalCode),registered:saved.personalAction==='restore',action:saved.personalAction};view=null}},
    saved:()=>active?.registered?cache().profile:null,
    confirm,open,
    get(key){const c=cache();return c.values?.[key]??(legacyAllowed&&!active?.registered&&mode!=='restore'?storage.get(key):null)},
    set(key,value){if(!active)return storage.set(key,value);const c=cache();c.values={...c.values,[key]:value};return saveCache(c)},
    fail(message){error.textContent=message;if(mode!=='restore')renderEntry()},
  };
}
