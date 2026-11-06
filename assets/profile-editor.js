export function createProfileEditor({THREE,makePreview,randomLook,current,save,prepare,onClose}){
  const dialog=document.createElement('dialog');
  dialog.className='profile-editor';dialog.id='profileEditor';dialog.setAttribute('aria-labelledby','profileEditorTitle');
  dialog.innerHTML='<h2 id="profileEditorTitle">내 모습 바꾸기</h2><div class="profile-preview" role="img" aria-label="내 캐릭터 미리보기"></div><form><label for="profileEditorName">이름</label><input id="profileEditorName" type="text" maxlength="12" required autocomplete="nickname"><p class="profile-editor-status" role="status" aria-live="polite"></p><div class="profile-editor-actions"><button type="button" data-action="random">바꾸기</button><button class="primary" type="submit">확인</button><button type="button" data-action="close">닫기</button></div></form>';
  document.body.append(dialog);
  const mount=dialog.querySelector('.profile-preview'),form=dialog.querySelector('form'),name=dialog.querySelector('input'),status=dialog.querySelector('[role="status"]');
  const random=dialog.querySelector('[data-action="random"]'),close=dialog.querySelector('[data-action="close"]'),confirm=form.querySelector('[type="submit"]');
  let draft=null,busy=false,renderer=null,scene=null,camera=null,actor=null,observer=null;
  function render(){
    if(!renderer||!dialog.open)return;
    const {width,height}=mount.getBoundingClientRect();if(!width||!height)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  function showLook(){
    actor?.dispose();actor=makePreview(draft,scene);actor.root.rotation.y=.16;render();
  }
  function release(){
    observer?.disconnect();observer=null;actor?.dispose();actor=null;
    renderer?.dispose();renderer?.forceContextLoss();renderer=null;scene=null;camera=null;mount.replaceChildren();
  }
  function setBusy(value){busy=value;for(const control of[name,random,close,confirm])control.disabled=value;confirm.textContent=value?'저장 중…':'확인'}
  function errorText(error){return({name_taken:'이미 정원에 같은 이름이 있어요. 다른 이름을 입력해 주세요.',slow:'잠시 후 다시 확인을 눌러 주세요.',storage:'저장을 확인하지 못했어요. 다시 확인을 눌러 주세요.',connection:'정원 연결을 확인한 뒤 다시 눌러 주세요.',unsupported:'정원을 새 버전으로 반영한 뒤 다시 열어 주세요.',invalid:'이름과 모습을 다시 확인해 주세요.'})[error?.message]||'저장을 확인하지 못했어요. 다시 시도해 주세요.'}
  function open(){
    if(dialog.open)return;
    const me=current();if(!me)return;
    prepare();draft={...me.look};name.value=me.name;name.setCustomValidity('');status.textContent='바꾸기를 눌러 다른 모습을 골라 보세요.';setBusy(false);dialog.showModal();
    try{
      renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
      renderer.domElement.setAttribute('aria-hidden','true');mount.append(renderer.domElement);
      scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(38,1,.1,15);camera.position.set(0,1.25,4.2);camera.lookAt(0,1.02,0);
      scene.add(new THREE.HemisphereLight(0xfff6e5,0x8a9485,2.4));
      const light=new THREE.DirectionalLight(0xfff5e8,3);light.position.set(-3,4,5);scene.add(light);
      observer=new ResizeObserver(render);observer.observe(mount);showLook();
    }catch{release();status.textContent='미리보기를 열지 못했어요. 닫은 뒤 다시 시도해 주세요.';random.disabled=confirm.disabled=true}
    close.focus({preventScroll:true});
  }
  random.onclick=()=>{if(busy||!renderer)return;draft=randomLook(draft.gender);showLook();status.textContent='마음에 들면 확인을 눌러 주세요.'};
  close.onclick=()=>{if(!busy)dialog.close()};
  name.oninput=()=>name.setCustomValidity('');
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||!draft||!renderer)return;
    const value=name.value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g,'').trim().slice(0,12);
    if(!value){name.setCustomValidity('이름을 입력해 주세요.');name.reportValidity();return}
    setBusy(true);status.textContent='이름과 모습을 저장하고 있어요.';
    try{await save({name:value,look:{...draft}});dialog.close()}
    catch(error){status.textContent=errorText(error)}
    finally{setBusy(false)}
  };
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
  dialog.addEventListener('close',()=>{release();draft=null;onClose()});
  return{open,close(force=false){if(dialog.open&&(force||!busy))dialog.close()},isOpen:()=>dialog.open};
}
