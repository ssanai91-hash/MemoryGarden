const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const text=fs.readFileSync(__dirname+'/../assets/nature-soundscape.js','utf8');
const c={Math,Date,Map,Set,WeakMap,Promise,AbortController,setTimeout,clearTimeout,console};vm.createContext(c);
vm.runInContext(text.replaceAll('export ','')+';this.api={ecology,chooseVariant,RecordingCache,createNatureSoundscape};',c);
const {ecology,chooseVariant,RecordingCache,createNatureSoundscape}=c.api;
function param(v=0){return{value:v,events:[],setTargetAtTime(v,t,tau){this.value=v;this.events.push([v,t,tau])},setValueAtTime(v,t){this.value=v;this.events.push([v,t])},exponentialRampToValueAtTime(v,t){this.value=v;this.events.push([v,t])}}}
function context(){
 const ac={currentTime:0,state:'running',sampleRate:44100,nodes:[],listener:{}};
 for(const k of ['positionX','positionY','positionZ','forwardX','forwardY','forwardZ','upX','upY','upZ'])ac.listener[k]=param();
 const node=()=>{const n={gain:param(1),frequency:param(),Q:param(),playbackRate:param(1),positionX:param(),positionY:param(),positionZ:param(),connections:[],connect(q){this.connections.push(q)},disconnect(){this.connections=[];this.disconnected=true},start(...a){this.started=a},stop(){this.stopped=true}};ac.nodes.push(n);return n};
 ac.createGain=ac.createPanner=ac.createBiquadFilter=ac.createBufferSource=ac.createOscillator=node;return ac;
}
const state=(over={})=>({origin:{x:0,z:5},space:'garden',hour:1,rain:0,wind:.2,trees:4,nearTrees:[{x:8,z:2}],stone:false,falls:60,lake:30,lakePosition:{x:20,y:0,z:30},forestAngle:1,fire:{stage:'out'},...over});
test('ecology follows garden sunrise, night silence, storm and post-rain rules',()=>{
 assert.equal(ecology({hour:1,trees:20}).birds,0);assert.equal(ecology({hour:20}).day,false);
 assert.equal(ecology({hour:6.5}).chorus,true);assert.equal(ecology({hour:7}).chorus,false);
 assert.ok(ecology({hour:6.7,trees:20}).birds>ecology({hour:12,trees:20}).birds);
 assert.equal(ecology({hour:1,rain:.31}).crickets,0);assert.ok(ecology({hour:1,falls:5}).crickets<ecology({hour:1,falls:50}).crickets);
 assert.equal(ecology({hour:12,lake:0}).frogs,0);assert.equal(ecology({hour:1,lake:25}).frogs,0);
 assert.ok(ecology({hour:1,lake:5,afterRain:30}).frogs>ecology({hour:1,lake:5,afterRain:500}).frogs);
 let last='a';for(let i=0;i<20;i++){const next=chooseVariant(['a','b','c'],last,()=>.5);assert.notEqual(next,last);last=next}
});
test('recordings fall back from failed Opus to MP3; decode serially, pin and evict under a shared PCM budget',async()=>{
 const requests=[];let live=0,peak=0;
 const ac={sampleRate:1000,async decodeAudioData(bytes){live++;peak=Math.max(live,peak);await new Promise(r=>setTimeout(r,2));live--;if(new Uint8Array(bytes)[0]===1)throw Error('Opus unsupported');return{length:200,numberOfChannels:1,duration:.2}}};
 const cache=new RecordingCache(ac,{limit:2500,reservedBytes:400,fetcher:async url=>{requests.push(url);return{ok:true,arrayBuffer:async()=>new Uint8Array([url.endsWith('ogg')?1:2]).buffer}}});
 for(const id of ['a','b','c'])cache.assets[id]={duration:.2,ogg:'./sounds/'+id+'.ogg',mp3:'./sounds/'+id+'.mp3'};
 const a=cache.load('a');assert.equal(a,cache.load('a'));await a;cache.pin('a');await Promise.all([cache.load('b'),cache.load('c')]);
 assert.equal(peak,1);assert.ok(cache.entries.has('a'));assert.ok(cache.bytes+cache.reservedBytes<=2500);assert.equal(requests.length,6);
 assert.equal(cache.entries.size,2);cache.unpin('a');cache.close();assert.equal(cache.bytes,0);
});
test('missing/corrupt assets negatively cache, bad paths do not fetch, late decodes cannot repopulate a closed cache',async()=>{
 let requests=0,release;const ac={sampleRate:1000,decodeAudioData:()=>new Promise(r=>release=r)};
 const cache=new RecordingCache(ac,{fetcher:async()=>{requests++;return{ok:false}}});cache.assets.a={duration:1,ogg:'./sounds/a.ogg'};
 await cache.load('a');await cache.load('a');assert.equal(requests,1);assert.ok(cache.failed.has('a'));
 cache.assets.bad={duration:1,ogg:'https://other.invalid/a.ogg'};await cache.load('bad');assert.equal(requests,1);
 const late=new RecordingCache(ac,{fetcher:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})});late.assets.a={duration:1,mp3:'./sounds/a.mp3'};
 const task=late.load('a');while(!release)await new Promise(r=>setTimeout(r,1));late.close();release({length:100,numberOfChannels:1,duration:.1});await task;assert.equal(late.entries.size,0);
});
test('foot contacts, stationary poses, peer radius/teleports, pause recovery and 12-voice priority',()=>{
 const ac=context(),e=createNatureSoundscape(ac,{output:ac.createGain(),noise:{duration:6},reservedBytes:400,random:()=>.5});e.update(state());
 const actor={},step=(o={})=>e.step(actor,{x:0,z:5,y:0,walkT:0,speed:3.2,pose:'stand',self:true,space:'garden',...o});
 step();assert.equal(step({x:.1,walkT:2}),true);assert.equal(step({x:.2,walkT:2.1}),false);
 assert.equal(step({x:.3,walkT:5.2,pose:'sit'}),false);assert.equal(step({x:.4,walkT:8.4,pose:'prone'}),false);
 assert.equal(step({x:50,walkT:11.6,self:false}),false);assert.equal(step({x:50.1,walkT:14.8,self:false}),false);
 assert.equal(step({x:0,walkT:18,teleport:true}),false);
 for(let i=0;i<20;i++)e.fireAdded(i%2?'added':'relit');assert.ok(e.diagnostics().voices<=12);
 const small=ac.createBufferSource();small.buffer={duration:6};const g=ac.createGain();assert.equal(e.legacy(small,[g],ac.currentTime,.1,.00001),false);assert.ok(small.disconnected);
 e.listener({x:1,y:2,z:3},{x:1,y:0,z:0},{x:0,y:1,z:0});assert.equal(ac.listener.forwardX.value,1);assert.equal(ac.listener.positionZ.value,3);
 e.duck();const duck=ac.nodes.find(n=>n.gain.events.some(v=>v[0]===.62));assert.ok(duck);ac.currentTime=2;e.update(state());assert.equal(duck.gain.value,1);
 e.setActive(false);assert.equal(e.diagnostics().voices,0);assert.equal(e.diagnostics().loops,0);assert.equal(step({x:.1,walkT:21.2}),false);
 e.setActive(true);e.update(state());assert.equal(step({x:.2,walkT:24.4}),false);assert.equal(step({x:.3,walkT:27.6}),true);
 e.update(state({shelter:true}));assert.equal(e.diagnostics().cutoff,1500);e.update(state({space:'listening'}));assert.equal(e.diagnostics().cutoff,650);
 assert.equal(step({x:.4,walkT:31,space:'garden'}),false);e.close();assert.equal(e.diagnostics().voices,0);
});
test('geometry surface precedence follows actual deck, courtyard, ring, gravel, stream and grass',()=>{
 const html=fs.readFileSync(__dirname+'/../index.html','utf8');
 const start=html.indexOf('const LAKE=(()=>'),end=html.indexOf('/* ---------- ground:',start),paving=html.slice(html.indexOf('function gardenWalkDistance('),html.indexOf('function grassClear('));
 const scope={Math,worldSpace:'garden',POCHA:{x:-6.3,z:-23.4,h:0},OUTER_TRAIL:57,TRAIL_ANGLES:[.3,2.45,4.5],nearAltar:()=>false};vm.createContext(scope);vm.runInContext(fs.readFileSync(__dirname+'/../assets/prayer-rules.js','utf8')+'this.Prayer=GardenPrayer;',scope);
 vm.runInContext(html.slice(start,end)+paving+html.slice(html.indexOf('function surfaceAt('),html.indexOf('const natureForward='))+'this.geo={surfaceAt,atSQ,LAKE,HUT,STREAM,hutLocal};',scope);
 const g=scope.geo;assert.equal(g.surfaceAt(0,0),'stone');assert.equal(g.surfaceAt(18.1,0),'stone');assert.equal(g.surfaceAt(-57,0),'gravel');assert.equal(g.surfaceAt(-28,12),'grass');
 const deck=g.atSQ(g.LAKE.c,0);assert.equal(g.surfaceAt(deck.x,deck.z),'wood');const hut=g.hutLocal(0,1);assert.equal(g.surfaceAt(hut.x,hut.z),'wood');assert.equal(g.surfaceAt(g.STREAM[3].x,g.STREAM[3].z),'water');
 assert.equal(g.surfaceAt(g.LAKE.beach.x,g.LAKE.beach.z),'gravel');assert.equal(g.surfaceAt(-6.3,-23.4),'wood');
});
