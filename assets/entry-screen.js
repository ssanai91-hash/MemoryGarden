import './prayer-rules.js';
import {createGardenIdentity} from './garden-identity.js';

// This screen does not import Three.js or open a WebSocket. Loading a saved
// profile is a read-only preview. Admission waits for saved credentials and a
// submit (automatic only when resuming the same tab); the 3D scene never waits.
export function createEntryScreen({document,storage,crypto,fetcher=(...args)=>fetch(...args)}){
  const $=id=>document.getElementById(id),P=globalThis.GardenPrayer,form=$('nameForm');
  const breeds={dog:['시바','몰티즈','진돗개','푸들','허스키','닥스훈트','래브라도','웰시코기','비글','포메라니안'],cat:['코리안 쇼트헤어','브리티시 쇼트헤어','스코티시 폴드','러시안 블루','샴','랙돌','페르시안','메인쿤']};
  const coats={dog:['품종 기본','화이트','블랙','크림','브라운','그레이','황갈색','블랙탄','흰얼룩','삼색'],cat:['치즈 줄무늬','고등어 줄무늬','삼색','턱시도','하양','검정','블루그레이','크림']};
  const text=v=>String(v||'').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').trim().slice(0,12);
  const state={ready:false,busy:false,failed:false,person:null,offset:0,kind:'dog',drafts:{dog:{b:3,coat:2,n:'까망이'},cat:{kind:'cat',b:0,coat:0,n:'나비'}}};
  let resolveEntry;const entered=new Promise(resolve=>{resolveEntry=resolve});
  const listeners=[];const listen=(node,event,fn)=>{node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn))};
  const choice=name=>form.querySelector('input[name="'+name+'"]:checked')?.value||'';
  const select=(name,value)=>{for(const input of form.querySelectorAll('input[name="'+name+'"]'))input.checked=input.value===value};
  function options(id,items,value){const node=$(id);node.textContent='';items.forEach((label,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=label;node.append(o)});node.value=String(value)}
  function petControls(save=true){
    if(save&&state.kind)state.drafts[state.kind]={...state.drafts[state.kind],b:Number($('petBreed').value),coat:Number($('petCoat').value)};
    const kind=choice('entryPet')||'dog';state.kind=kind;const saved=state.drafts[kind];options('petBreed',breeds[kind],saved.b);options('petCoat',coats[kind],saved.coat);$('petOptions').hidden=false;$('petBreedLabel').textContent='품종';
  }
  function draft(){const kind=choice('entryPet')||'dog',previous=state.drafts[kind];return{name:text($('nameInput').value),gender:choice('entryGender'),look:state.person?.look||null,dog:{...previous,b:Number($('petBreed').value),coat:Number($('petCoat').value),...(kind==='cat'?{kind:'cat'}:{})}}}
  function controls(busy){for(const node of form.querySelectorAll('input,select,fieldset,button'))node.disabled=busy;$('entryExisting').disabled=busy}
  function update(){
    const importing=identity.importing(),valid=importing?identity.valid():!!text($('nameInput').value)&&!!choice('entryGender')&&!!choice('entryPet');
    $('nameSubmit').disabled=state.busy||(!state.failed&&(!state.ready||!valid));
    $('nameSubmit').textContent=state.busy?'입장 정보 준비 중…':importing?'내 정보 불러오기':state.failed?'다시 시도':'입장하기';
    $('entryExisting').textContent=importing?'내 코드로 돌아가기':'새로운 코드로 입장';
    if(!state.failed)$('entryHint').textContent=state.busy?'입장 정보를 준비하고 있어요':'입장 코드 자동 저장 · 내 정보 확인 후 입장';
    identity.updateEntry(false);
  }
  let autoEnterSaved=false;
  const identity=createGardenIdentity({document,storage,crypto,fetcher,now:()=>Date.now()+state.offset,onMode(){autoEnterSaved=false;if(identity.importing())update();else void initialise()}});
  try{
    const visit=JSON.parse(sessionStorage.getItem('garden.visit.v1')||'null');
    autoEnterSaved=sessionStorage.getItem('garden.visit.left.v1')!=='1'&&visit?.v===1&&/^[a-f0-9]{64}$/.test(visit.token||'')&&!!text(visit.name)&&!!identity.credentials().personalCode&&visit.personal?.personalCode===identity.credentials().personalCode;
  }catch{}
  async function initialise(){
    if(state.busy)return false;state.busy=true;state.failed=false;state.ready=false;controls(true);update();
    try{
      const importing=identity.importing();
      if(importing&&!identity.valid()){await identity.prepare();throw Error(identity.errorText())}
      if(!importing&&!await identity.prepare())throw Error(identity.errorText());
      controls(true);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);let result;
      try{const response=await fetcher('/personal/profile',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify(importing?identity.importCredentials():identity.credentials())});result=await response.json();if(!response.ok)throw Error(result.error==='missing'?'등록된 코드가 없어요. 보관한 코드를 확인해 주세요.':'내 정보를 불러오지 못했어요. 다시 눌러 주세요.')}finally{clearTimeout(timer)}
      // Trying another code must not replace the saved identity on a typo or
      // network failure. Commit the imported code only after profile lookup.
      if(importing&&!await identity.prepare())throw Error(identity.errorText());
      state.offset=Number.isFinite(result.now)?result.now-Date.now():0;state.person=result.personal||null;
      if(result.personal)identity.confirm(result.personal);
      const saved=result.personal||identity.saved()||{};
      $('nameInput').value=text(saved.name);select('entryGender',saved.look?.gender||saved.gender||'male');
      const dog=saved.dog,kind=dog?.kind==='cat'?'cat':'dog';if(dog&&Number.isInteger(dog.b)&&breeds[kind][dog.b]&&coats[kind][dog.coat??0])state.drafts[kind]={...dog,coat:dog.coat??0};
      select('entryPet',kind);petControls(false);identity.showSettings();state.ready=true;state.failed=false;return true;
    }catch(e){state.failed=true;$('entryHint').textContent=e.message||'입장 정보를 준비하지 못했어요. 다시 눌러 주세요.';return false}
    finally{
      state.busy=false;controls(false);update();
      if(state.ready&&autoEnterSaved){autoEnterSaved=false;if(text($('nameInput').value))void submit({preventDefault(){}})}
    }
  }
  async function submit(event){
    event.preventDefault();if(state.busy)return;
    if(identity.importing()||!state.ready){await initialise();return}
    const value=draft();if(!value.name||!value.gender)return;
    state.busy=true;controls(true);$('nameSubmit').disabled=true;$('nameSubmit').textContent='정원 여는 중…';
    if(!await identity.prepare(value)){state.busy=false;state.failed=true;controls(false);$('entryHint').textContent=identity.errorText();update();return}
    try{sessionStorage.removeItem('garden.visit.left.v1')}catch{}
    const changed=!!state.person&&(value.name!==state.person.name||value.gender!==state.person.look?.gender||JSON.stringify(value.dog)!==JSON.stringify(state.person.dog));
    resolveEntry({...value,changed});
  }
  form.noValidate=true;form.onsubmit=submit;
  listen(form,'input',()=>update());listen(form,'change',event=>{if(event.target?.name==='entryPet')petControls();update()});
  listen($('entryExisting'),'click',()=>identity.importing()?identity.useSaved():identity.useExisting());
  document.body.classList.add('entry-open');$('welcome').hidden=false;
  select('entryGender','male');select('entryPet','dog');petControls(false);void initialise();
  return{identity,waitForEntry:()=>entered,start:initialise,
    detach(){for(const off of listeners)off();if(form.onsubmit===submit)form.onsubmit=null;state.busy=false;controls(false);$('nameSubmit').disabled=false;$('nameSubmit').textContent='입장하기'},
    complete(){document.body.classList.remove('entry-open');$('welcome').hidden=true},
  };
}
