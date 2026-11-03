import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';
const THREE=await import(pathToFileURL(process.argv[2]).href),html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
let fontReady,fontWidth=32,canvasCount=0;
function element(){return{children:[],hidden:false,style:{setProperty(k,v){this[k]=v}},append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}}}
const layer=element(),pen={measureText:s=>({width:Array.from(s).length*fontWidth})},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,412/860,.1,100);
camera.position.set(0,4,10);camera.lookAt(0,1,0);camera.updateMatrixWorld();
const person=()=>{const g=new THREE.Group(),tag=new THREE.Object3D();tag.position.y=2.25;g.add(tag);scene.add(g);return{g,tag}};
const me=person(),friend=person();friend.g.position.x=.3;
const c={THREE,CURVE_K:.0012,Intl,Math,Number,Date,innerWidth:412,innerHeight:860,worldSpace:'garden',cam:{sky:false},camera,me,peers:new Map([['friend',{P:friend}]]),bubbleForExtra:{},serverNow:()=>1800000000000,stripInvisible:s=>String(s),saveVisit(){},setInterval(){},document:{fonts:{ready:{then(fn){fontReady=fn}}},createElement(tag){if(tag==='canvas'){canvasCount++;return{getContext:()=>pen}}return element()}},$:id=>{assert.equal(id,'speechLayer');return layer}};
vm.createContext(c);vm.runInContext(html.slice(html.indexOf('const bubbles=new Map()'),html.indexOf('function appendChatHistory('))+';this.bubbles=bubbles;',c);
vm.runInContext(html.slice(html.indexOf('const _bv=new THREE.Vector3();'),html.indexOf('/* ---------- handshake:'))+';this.layout=layoutBubbles;',c);
c.showBubble('me','숭열','<img src=x onerror=alert(1)> 안녕 👨‍👩‍👧‍👦');c.layout(1);
const b=c.bubbles.get('me'),data=b.userData;assert.equal(b.isSprite,undefined);assert.equal(data.who.textContent,'숭열');assert.equal(data.body.textContent.replace(/\n/g,''),'<img src=x onerror=alert(1)> 안녕 👨‍👩‍👧‍👦');assert.equal(data.el.hidden,false);assert.ok(parseFloat(data.el.style.width)>0);assert.ok(parseFloat(data.el.style.height)>0);assert.equal(canvasCount,1);
const left=parseFloat(data.el.style.left);me.g.position.x=2;scene.updateMatrixWorld(true);c.layout(1);assert.notEqual(parseFloat(data.el.style.left),left);
const count=layer.children.length;c.showBubble('me','숭열','새 문장');assert.equal(layer.children.length,count);assert.equal(c.bubbles.get('me'),b);assert.equal(canvasCount,1);
const oldWidth=data.width;fontWidth=40;fontReady();assert.notEqual(data.width,oldWidth); // remeasure once the Korean font loads
c.showBubble('friend','친구','안녕하세요');c.layout(1);assert.equal(c.bubbles.get('friend').userData.el.hidden,false);
me.g.visible=false;c.layout(1);assert.equal(data.el.hidden,true);me.g.visible=true;c.cam.sky=true;c.layout(1);assert.ok([...c.bubbles.values()].every(b=>b.userData.el.hidden));c.cam.sky=false;c.worldSpace='listening';c.layout(1);assert.ok([...c.bubbles.values()].every(b=>b.userData.el.hidden));c.worldSpace='garden';c.layout(1);assert.equal(data.el.hidden,false);
c.disposeBubble('me');assert.equal(c.bubbles.has('me'),false);assert.equal(layer.children.length,1);assert.equal(b.parent,null);
assert.ok(html.includes('.speech-text{display:block;font-size:calc(58.5 * var(--bubble-unit))'));
console.log('PASS: native text bubbles with real r170 projection, head tracking, safe Korean/emoji text, line wrapping, single measure canvas/reuse, font-ready reflow, hierarchy/sky/space visibility and DOM cleanup.');
