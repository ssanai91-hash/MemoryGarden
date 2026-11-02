import './prayer-rules.js';
const P=globalThis.GardenPrayer;
export function createCandleUI({document,storage,pendingStorage=storage,now,near,send,ready,selfName,pause,onState}){
  const $=id=>document.getElementById(id),dialog=$('candleDialog'),form=$('candleForm'),name=$('candleName'),wish=$('candleWish'),submit=$('candleSubmit'),status=$('candleStatus'),list=$('candleList');
  let state={rev:-1,items:[]},pending=null,busy=false,timer=0,listKey='';
  const backing=k=>k==='garden.candle.pending'?pendingStorage:storage;
  const read=k=>{try{return JSON.parse(backing(k).get(k)||'null')}catch{return null}},save=(k,v)=>backing(k).set(k,JSON.stringify(v));
  const cached=read('garden.candle.pending');if(cached&&P.nonce(cached.nonce)&&typeof cached.name==='string'&&typeof cached.wish==='string'&&Number.isFinite(cached.issuedAt))pending=cached;
  function draft(){return{name:name.value,wish:wish.value}}
  function persist(){save('garden.candle.draft',draft())}
  function waiting(value){busy=value;name.disabled=wish.disabled=value;submit.disabled=value;submit.textContent=value?'초를 확인하고 있어요…':pending?'다시 확인하고 초 켜기':'초 켜기'}
  function remaining(expires){const mins=Math.max(1,Math.ceil((expires-now())/60000)),h=Math.floor(mins/60),m=mins%60;return h?`${h}시간${m?' '+m+'분':''} 남음`:`${m}분 남음`}
  function render(){
    const active=P.active(state,now()),key=active.map(c=>c.id).join(',');$('candleCount').textContent='켜진 초 '+active.length+'개';
    if(key!==listKey){
      const open=new Set([...list.querySelectorAll('details[open]')].map(n=>n.dataset.id));list.replaceChildren();
      for(const c of active){const row=document.createElement('details');row.dataset.id=c.id;row.open=open.has(c.id);const head=document.createElement('summary'),label=document.createElement('strong'),time=document.createElement('span'),body=document.createElement('p'),by=document.createElement('small');
        label.textContent=c.name;time.dataset.expires=String(c.expiresAt);time.textContent=remaining(c.expiresAt);body.textContent=c.wish;by.textContent=(c.litBy||'친구')+'님이 밝힌 초';head.append(label,time);row.append(head,body,by);list.appendChild(row);
      }
      if(!active.length){const empty=document.createElement('p');empty.textContent='소원을 적고 첫 초를 밝혀 보세요.';list.appendChild(empty)}listKey=key;
    }
    for(const span of list.querySelectorAll('[data-expires]'))span.textContent=remaining(Number(span.dataset.expires));
  }
  function apply(s){
    if(!s||!Number.isInteger(s.rev)||s.rev<state.rev||!Array.isArray(s.items))return;
    state={rev:s.rev,items:s.items.filter(c=>P.nonce(c.id)&&Number.isInteger(c.slot)&&c.slot>=0&&c.slot<P.MAX&&typeof c.name==='string'&&typeof c.wish==='string'&&Number.isFinite(c.expiresAt)).slice(0,P.MAX)};
    onState(state);render();
  }
  function clearPending(){pending=null;save('garden.candle.pending',null)}
  function attempt(){
    if(busy)return;
    if(!ready()){status.textContent='정원 연결이 준비되면 다시 눌러 주세요.';return}
    if(!near()){status.textContent='초함 가까이에서 초를 켜 주세요.';return}
    const n=P.clean(name.value,25).replace(/\s+/g,' '),w=P.clean(wish.value,161);
    if(!n||n.length>24||!w||w.length>160){status.textContent='이름은 24자, 소원은 160자 안으로 적어 주세요.';return}
    if(!pending||pending.name!==n||pending.wish!==w||now()-pending.issuedAt>300000){const b=new Uint8Array(16);crypto.getRandomValues(b);pending={nonce:[...b].map(v=>v.toString(16).padStart(2,'0')).join(''),name:n,wish:w,issuedAt:now()}}
    if(!save('garden.candle.pending',pending)){status.textContent='입력을 보관하지 못했어요. 다시 눌러 주세요.';return}
    persist();waiting(true);status.textContent='초함에 불을 밝히고 있어요…';
    clearTimeout(timer);timer=setTimeout(()=>{waiting(false);status.textContent='아직 확인되지 않았어요. 다시 눌러도 같은 초를 확인해요.'},8000);
    if(send({t:'candle_light',...pending})===false){clearTimeout(timer);waiting(false);status.textContent='연결을 확인한 뒤 다시 눌러 주세요.'}
  }
  name.addEventListener('input',()=>{if(pending&&name.value!==pending.name)clearPending();persist()});wish.addEventListener('input',()=>{if(pending&&wish.value!==pending.wish)clearPending();persist()});
  form.addEventListener('submit',e=>{e.preventDefault();attempt()});$('candleClose').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{clearTimeout(timer);waiting(false);persist()});
  return{apply,refresh:render,isOpen:()=>dialog.open,
    open(){if(!near())return false;pause();const d=pending||read('garden.candle.draft')||{};name.value=typeof d.name==='string'?d.name:selfName();wish.value=typeof d.wish==='string'?d.wish:'';status.textContent='';waiting(false);listKey='!';render();if(!dialog.open)dialog.showModal();send({t:'candles_sync'});return true},
    close(){if(dialog.open)dialog.close()},endVisit(){if(dialog.open)dialog.close();clearPending();waiting(false)},
    connection(on){if(!on&&busy){clearTimeout(timer);waiting(false);status.textContent='연결을 다시 확인하고 있어요. 입력은 보관했어요.'}},
    receive(m){
      if(m.t==='candles_state'){apply(m.state);return}
      if(m.t==='candle_lit'){
        apply(m.state);if(!pending||m.nonce!==pending.nonce)return;
        clearTimeout(timer);clearPending();waiting(false);name.value='';wish.value='';save('garden.candle.draft',null);
        const record=state.items.find(c=>c.id===m.candle?.id),expires=record?.expiresAt||m.candle?.expiresAt;
        status.textContent=expires<=now()?'이 초는 24시간이 지나 꺼졌어요.':`초를 밝혔어요. ${Number.isFinite(expires)?remaining(expires)+' · ':''}실제 시간으로 24시간 유지돼요.`;return;
      }
      if(m.t!=='candle_error'||(m.nonce&&m.nonce!==pending?.nonce))return;
      clearTimeout(timer);waiting(false);const messages={far:'초함 가까이에서 다시 눌러 주세요.',full:'초함이 가득 찼어요. 초가 꺼지면 새로 켤 수 있어요.',stale:'시간이 지났어요. 적은 내용을 확인하고 다시 눌러 주세요.',expired:'이 초는 24시간이 지나 꺼졌어요. 새 초를 켤 수 있어요.',invalid:'이름과 소원을 확인해 주세요.',slow:'잠시 후 다시 눌러 주세요.',storage:'초를 확인하지 못했어요. 다시 눌러도 중복해서 켜지지 않아요.'};
      status.textContent=messages[m.code]||'정원 연결을 확인하고 다시 눌러 주세요.';if(['stale','expired'].includes(m.code))clearPending();
    }
  };
}
