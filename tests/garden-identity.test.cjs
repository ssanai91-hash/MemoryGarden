const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
class Element{
 constructor(tag,doc){this.tag=tag;this.doc=doc;this.children=[];this.className='';this.classList={toggle(){}};this.events={};this.value='';this.textContent='';this.open=false;this.hidden=false;this.validity=''}
 append(...nodes){this.children.push(...nodes)}prepend(...nodes){this.children.unshift(...nodes)}setAttribute(){}addEventListener(event,fn){this.events[event]=fn}focus(){}setCustomValidity(value){this.validity=value}reportValidity(){return !this.validity}showModal(){this.open=true}close(){this.open=false;this.events.close?.()}
}
function document(){const doc={createElement:tag=>new Element(tag,doc),getElementById:id=>nodes.get(id),querySelector:()=>actions};const nodes=new Map([['nameForm',new Element('form',doc)]]),actions=new Element('div',doc);doc.head=new Element('head',doc);doc.body=new Element('body',doc);return doc}
const source=fs.readFileSync(__dirname+'/../assets/garden-identity.js','utf8').replace('export function','function'),rules=fs.readFileSync(__dirname+'/../assets/prayer-rules.js','utf8');
function client(saved=new Map()){
 const doc=document(),storage={get:k=>saved.get(k)||null,set(k,v){saved.set(k,v);return true}},c={document:doc,crypto,console,Uint8Array,setInterval:()=>1,clearInterval(){},Date,Math};vm.createContext(c);vm.runInContext(rules,c);vm.runInContext(source,c);let switches=0;const identity=c.createGardenIdentity({document:doc,storage,crypto,onSwitch(){switches++},onMode(){}}),entry=doc.getElementById('nameForm').children[0],dialog=doc.body.children[0];
 return{identity,c,doc,saved,entry,dialog,storage,get switches(){return switches},input:entry.children[2],restore:entry.children[3].children[0],fresh:entry.children[3].children[1]};
}
const profile={id:'person1',name:'숭열',look:{skin:1,hair:2,shirt:3,pants:4,shoe:5},dog:{b:3,coat:2},totalBows:143,completed:{108:1},highestHalo:1,progress:{108:35,3000:0},target:108,halos:{whiteUntil:Date.now()+2000000,redUntil:0}};
const a=client();assert.equal(a.identity.prepare(),true);const credentials=a.identity.credentials();assert.ok(a.c.GardenPrayer.validCode(credentials.personalCode));assert.equal(credentials.personalAction,'create');
const pending=client(a.saved);assert.equal(pending.identity.credentials().personalCode,credentials.personalCode);assert.equal(pending.identity.credentials().personalAction,'create'); // retries never regenerate a code
assert.equal(a.identity.confirm(profile),true);assert.equal(a.identity.confirm(profile),false);assert.equal(a.identity.get('garden.bows'),'35');assert.equal(a.identity.credentials().personalAction,'restore');
a.identity.set('garden.bows','37');const reload=client(a.saved);assert.equal(reload.identity.get('garden.bows'),'37');assert.equal(reload.identity.saved().name,'숭열');
// Different device enters only the existing code and gets the same profile.
const b=client();b.restore.onclick();b.input.value='bad';assert.equal(b.identity.valid(),false);assert.equal(b.identity.prepare(),false);b.input.value=credentials.personalCode.toLowerCase();assert.equal(b.identity.valid(),true);assert.equal(b.identity.prepare(),true);assert.equal(b.identity.credentials().personalCode,credentials.personalCode);b.identity.confirm(profile);assert.equal(b.identity.saved().totalBows,143);
// A different personal code on a shared device must never inherit old counters.
a.storage.set('garden.bows','99');a.fresh.onclick();assert.notEqual(a.identity.credentials().personalCode,credentials.personalCode);assert.equal(a.identity.get('garden.bows'),null);a.identity.confirm({...profile,id:'person2',name:'친구',totalBows:0,progress:{108:0,3000:0},completed:{},halos:{}});assert.equal(a.identity.get('garden.bows'),'0');
a.restore.onclick();a.input.value=credentials.personalCode;a.identity.prepare();assert.equal(a.identity.get('garden.bows'),'37');
// Modal keeps the code private until opened; switching is an explicit action.
a.identity.open();assert.equal(a.dialog.open,true);const switchButton=a.dialog.children.find(n=>n.textContent==='다른 코드로 입장');switchButton.onclick();assert.equal(a.switches,1);assert.equal(a.dialog.open,false);
const html=fs.readFileSync(__dirname+'/../index.html','utf8');assert.ok(html.includes('else if(!restoreVisit()&&!restorePersonalEntry())'));assert.ok(html.includes('...gardenIdentity.credentials(),resumeToken:visitToken'));assert.ok(html.includes("if(m.personal)receivePersonal(m.personal,true)"));assert.ok(html.includes("personal rewards require the server clock"));assert.ok(!html.includes("searchParams.set('personal"));assert.ok(html.indexOf('const $=id=>')<html.indexOf('const gardenIdentity='));
console.log('PASS: one-time cryptographic code, pending registration/reload, existing-code-only restore, per-person local cache, same-device automatic entry source, private modal/code switching, no credentials in invite URLs and server-clock-only personal rewards.');
