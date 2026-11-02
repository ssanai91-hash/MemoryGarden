// Local Web Audio only. No microphone, analytics, external audio service or room changes.
export const SOUND_LEVELS=Object.freeze({fire:.5,pop:.46,log:.4,step:.25,friend:.5,wind:.1,gust:.3,leaves:.12,crickets:.15,frogs:.15,bird:.18,owl:.15,crow:.15});
export const PCM_LIMIT=25_000_000,VOICE_LIMIT=12;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
const near=(d,r)=>clamp(1-d/r)**2;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function chooseVariant(items,last,random=Math.random){
  const pool=items.length>1?items.filter(v=>v!==last):items;return pool[Math.floor(random()*pool.length)];
}
export function ecology({hour=12,rain=0,trees=0,stone=false,falls=100,lake=100,afterRain=Infinity,time=0}){
  // Garden sunrise starts at 6:30; a garden half-hour is 30 real seconds.
  const day=hour>=6.5&&hour<19.5,chorus=hour>=6.5&&hour<7;
  const night=hour>=18.5?clamp(hour-18.5):hour<7?clamp(7-hour):0,forest=clamp(trees/10),wetBoost=afterRain>=0&&afterRain<180?1+.6*(1-afterRain/180):1;
  const pulse=.55+.45*(.5+.5*Math.sin(time*Math.PI*2/43));
  return{day,chorus,birds:day?(chorus?3:1)*(.3+.7*forest)*(1-clamp(rain)*.9)*wetBoost:0,
    crickets:rain>.3?0:night*pulse*(stone?.25:1)*(falls<20?.25:1),
    frogs:night*near(lake,25)*wetBoost};
}

// All assets are explicitly listed. Missing recordings incur no 404 requests.
// Decodes are serialized, pre-reserved at the AudioContext rate (decodeAudioData
// resamples to that rate), and checked against actual PCM size before caching.
export class RecordingCache{
  constructor(ac,{reservedBytes=0,fetcher=globalThis.fetch,limit=PCM_LIMIT}={}){
    this.ac=ac;this.fetcher=(url,options)=>fetcher.call(globalThis,url,options);this.limit=limit;this.reservedBytes=reservedBytes;
    this.entries=new Map();this.assets={};this.failed=new Set();this.pending=new Map();this.bytes=0;this.tail=Promise.resolve();this.closed=false;this.controllers=new Set();
  }
  async manifest(){
    try{const m=await this.request('./sounds/manifest.json',r=>{if(!r.ok)throw Error('manifest');return r.json()});
      if(m.version===1&&m.clips&&typeof m.clips==='object')this.assets=m.clips;
    }catch{/* An empty/absent pack deliberately keeps all synthesis available. */}
  }
  async request(url,consume){const c=new AbortController();this.controllers.add(c);const timer=setTimeout(()=>c.abort(),8000);
    try{return await consume(await this.fetcher(url,{signal:c.signal,credentials:'same-origin'}))}finally{clearTimeout(timer);this.controllers.delete(c)}
  }
  variants(group){return Object.keys(this.assets).filter(id=>id===group||id.startsWith(group+'_')).sort()}
  peek(id){const e=this.entries.get(id);if(e){e.used=Date.now();return e.buffer}return null}
  pin(id){const e=this.entries.get(id);if(e)e.pins++}
  unpin(id){const e=this.entries.get(id);if(e)e.pins=Math.max(0,e.pins-1)}
  room(size){
    for(const [id,e]of [...this.entries].sort((a,b)=>a[1].used-b[1].used)){
      if(this.reservedBytes+this.bytes+size<=this.limit)break;
      if(!e.pins){this.bytes-=e.bytes;this.entries.delete(id)}
    }
    return this.reservedBytes+this.bytes+size<=this.limit;
  }
  load(id){
    if(this.closed||!this.assets[id]||this.failed.has(id))return Promise.resolve(null);
    const cached=this.peek(id);if(cached)return Promise.resolve(cached);if(this.pending.has(id))return this.pending.get(id);
    const task=this.tail.then(async()=>{
      if(this.closed)return null;const a=this.assets[id],seconds=Number(a.duration);
      if(!(seconds>0&&seconds<=40))return null;
      const reservation=Math.ceil((seconds+.1)*this.ac.sampleRate*4);
      if(!this.room(reservation))return null;
      for(const ext of ['ogg','mp3']){
        if(!a[ext]||!/^\.\/sounds\/[a-z0-9_]+\.(ogg|mp3)$/.test(a[ext]))continue;
        try{const bytes=await this.request(a[ext],r=>{if(!r.ok||Number(r.headers?.get('content-length'))>1_500_000)throw Error('asset');return r.arrayBuffer()});if(bytes.byteLength>1_500_000)continue;
          if(this.closed)return null;const buffer=await this.ac.decodeAudioData(bytes);
          const size=buffer.length*buffer.numberOfChannels*4;
          if(this.closed)return null;
          if(buffer.numberOfChannels!==1||buffer.duration>seconds+.1||size>reservation||!this.room(size))continue;
          this.entries.set(id,{buffer,bytes:size,pins:0,used:Date.now()});this.bytes+=size;return buffer;
        }catch{/* Opus unavailable/corrupt: try the MP3, then synthesize. */}
      }
      this.failed.add(id);return null;
    }).catch(()=>null).finally(()=>this.pending.delete(id));
    this.tail=task;this.pending.set(id,task);return task;
  }
  close(){this.closed=true;for(const c of this.controllers)c.abort();this.entries.clear();this.bytes=0;this.assets={}}
}

export function createNatureSoundscape(ac,{output,noise,reservedBytes=0,fetcher=globalThis.fetch,random=Math.random}={}){
  const duck=ac.createGain(),outside=ac.createBiquadFilter(),roof=ac.createGain();
  outside.type='lowpass';outside.frequency.value=18000;outside.Q.value=.7;outside.connect(duck);roof.connect(duck);duck.connect(output);
  const cache=new RecordingCache(ac,{reservedBytes,fetcher}),voices=new Set(),loops=new Map(),retiring=new Set(),last=new Map(),actors=new WeakMap();
  let active=true,closed=false,manifestStarted=false,state=null,listener={x:0,y:1.6,z:0},duckUntil=0;
  let nextPop=0,nextBird=0,nextOwl=60+random()*120,nextCrow=120+random()*180,nextGust=30+random()*60,gustStart=-100,gustLength=0;
  let lastRain=0,endedRain=-Infinity,relitAt=-Infinity,lastUpdate=0,steps=0;
  const at=(param,value,tau=.15)=>param.setTargetAtTime(value,ac.currentTime,tau);
  const position=(p,v)=>{if(p.positionX){p.positionX.setValueAtTime(v.x,ac.currentTime);p.positionY.setValueAtTime(v.y||0,ac.currentTime);p.positionZ.setValueAtTime(v.z,ac.currentTime)}else p.setPosition(v.x,v.y||0,v.z)};
  function spatial(pos,inside=false){const p=ac.createPanner();p.panningModel='equalpower';p.distanceModel='linear';p.refDistance=1;p.maxDistance=100;p.rolloffFactor=0;position(p,pos);p.connect(inside?roof:outside);return p}
  function stopVoice(v){voices.delete(v);if(v.id)cache.unpin(v.id);try{v.source.onended=null;v.source.stop()}catch{}for(const n of v.nodes)try{n.disconnect()}catch{}}
  function score(pos,gain,range){return gain*(pos?near(dist(pos,listener),range):1)}
  function admit(source,nodes,{pos=null,level=.03,range=60,id=null}={}){
    if(closed||!active||ac.state!=='running'){for(const n of nodes)try{n.disconnect()}catch{}return null}
    const weight=score(pos,level,range);if(weight<.00001){for(const n of nodes)n.disconnect();return null}
    if(voices.size>=VOICE_LIMIT){const low=[...voices].sort((a,b)=>score(a.pos,a.level,a.range)-score(b.pos,b.level,b.range))[0];
      if(score(low.pos,low.level,low.range)>=weight){for(const n of nodes)try{n.disconnect()}catch{}return null}stopVoice(low);
    }
    const v={source,nodes,pos,level,range,id};voices.add(v);if(id)cache.pin(id);source.onended=()=>stopVoice(v);return v;
  }
  function pick(group){const items=cache.variants(group);const id=chooseVariant(items,last.get(group),random);if(id)last.set(group,id);return id}
  function synthetic(group){
    const osc=/^(bird|owl|crow|frogs)/.test(group),src=osc?ac.createOscillator():ac.createBufferSource(),filter=ac.createBiquadFilter();
    filter.type='bandpass';filter.Q.value=osc?1.5:.7;
    const freq=group.startsWith('step_wood')?330:group.startsWith('step_stone')?1400:group.startsWith('step_gravel')?2300:group.startsWith('step_water')?850:group.startsWith('step_grass')?3000:group==='log_drop'?180:group==='fire_pop'?1900:group==='owl'?650:group==='crow'?480:group==='bird'?3000+random()*1700:group==='frogs_loop'?420:group==='crickets_loop'?4900:group==='fire_loop'?650:group==='leaves_loop'?3200:group==='wind_gust_loop'?650:420;
    filter.frequency.value=freq;
    if(osc){src.type=group==='crow'?'sawtooth':'sine';src.frequency.value=freq}else src.buffer=noise;
    src.connect(filter);return{src,filter,osc,freq};
  }
  function shot(group,pos,level,{duration=.17,delay=0,range=60,inside=false}={}){
    if(!active||closed||ac.state!=='running')return false;
    // No awaiting here: a late footstep/pop must never be played after the action.
    const id=pick(group),buffer=id&&cache.peek(id);if(id&&!buffer)void cache.load(id);
    const synth=buffer?null:synthetic(group),src=buffer?ac.createBufferSource():synth.src,gain=ac.createGain(),pan=spatial(pos,inside);
    if(buffer)src.buffer=buffer;
    const rate=.92+random()*.16,levelV=level*(.85+random()*.3)*near(dist(pos,state?.origin||listener),range),t=ac.currentTime+delay;
    const dur=buffer?buffer.duration/rate:duration;
    if(buffer)src.playbackRate.value=rate;
    else if(!synth.osc)src.playbackRate.value=rate;
    else {src.frequency.setValueAtTime(synth.freq*rate,t);src.frequency.exponentialRampToValueAtTime(synth.freq*rate*(group==='bird'?1.25:.82),t+dur*.8)}
    const first=synth?synth.filter:src;first.connect(gain);gain.connect(pan);
    gain.gain.setValueAtTime(.00001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.00002,levelV),t+.006);gain.gain.exponentialRampToValueAtTime(.00001,t+Math.max(.02,dur));
    const nodes=[src,...(synth?[synth.filter]:[]),gain,pan];
    const voice=admit(src,nodes,{pos,level,range,id:buffer?id:null});if(!voice){for(const n of nodes)n.disconnect();return false}voice.group=group;
    try{if(buffer||synth.osc)src.start(t);else src.start(t,random()*Math.max(0,noise.duration-dur));src.stop(t+dur+.02)}catch{const v=[...voices].find(v=>v.source===src);if(v)stopVoice(v);return false}return true;
  }
  function stopLoop(v){retiring.delete(v);v.src.onended=null;if(v.id)cache.unpin(v.id);for(const src of [v.src,v.lfo].filter(Boolean))try{src.stop()}catch{}for(const n of [v.src,v.filter,v.gain,v.pan,v.mod,v.lfo,v.lfoGain].filter(Boolean))n.disconnect()}
  function makeLoop(group,pos){
    const id=cache.variants(group)[0],buffer=id&&cache.peek(id);const synth=buffer?null:synthetic(group),src=buffer?ac.createBufferSource():synth.src,gain=ac.createGain(),pan=spatial(pos);
    if(buffer)src.buffer=buffer;src.loop=true;gain.gain.value=0;(synth?synth.filter:src).connect(gain);
    let mod,lfo,lfoGain;
    if(synth&&['crickets_loop','frogs_loop'].includes(group)){
      mod=ac.createGain();mod.gain.value=.5;lfo=ac.createOscillator();lfo.type='sine';lfo.frequency.value=group==='frogs_loop'?2.3:10.7;lfoGain=ac.createGain();lfoGain.gain.value=.45;lfo.connect(lfoGain);lfoGain.connect(mod.gain);gain.connect(mod);mod.connect(pan);lfo.start();
    }else gain.connect(pan);
    if(id&&buffer)cache.pin(id);src.start(ac.currentTime,buffer?random()*buffer.duration:0);
    return{src,filter:synth?.filter,gain,pan,mod,lfo,lfoGain,id:buffer?id:null,group};
  }
  function loop(group,level,pos){
    let v=loops.get(group);
    if(level<.0001){if(v){at(v.gain.gain,0,.25);if(!v.quietAt)v.quietAt=ac.currentTime;if(ac.currentTime-v.quietAt>2){stopLoop(v);loops.delete(group)}}return}
    const id=cache.variants(group)[0];if(id&&!cache.peek(id))void cache.load(id);
    if(v&&!v.id&&id&&cache.peek(id)){at(v.gain.gain,0,.12);retiring.add(v);v.src.stop(ac.currentTime+.6);const old=v;v.src.onended=()=>stopLoop(old);loops.delete(group);v=null}
    if(!v){v=makeLoop(group,pos);loops.set(group,v)}v.quietAt=0;position(v.pan,pos);at(v.gain.gain,level,group==='fire_loop'? .65:1.4);
    // Soft natural modulation, including the synthetic fallback insects.
    if(v.filter&&group==='crickets_loop')at(v.filter.frequency,4500+Math.sin(ac.currentTime*8)*550,.06);
  }
  const api={outside,roof,cache,levels:SOUND_LEVELS,
    start(){if(!manifestStarted){manifestStarted=true;void cache.manifest()}},
    setActive(on){if(active===on)return;active=on;actorsReset++;if(!on){for(const v of [...voices])stopVoice(v);for(const v of [...loops.values(),...retiring])stopLoop(v);loops.clear();nextPop=nextBird=ac.currentTime+1}},
    listener(pos,forward,up){listener={...pos};const l=ac.listener,t=ac.currentTime;
      if(l.positionX){for(const[k,v]of Object.entries({positionX:pos.x,positionY:pos.y,positionZ:pos.z,forwardX:forward.x,forwardY:forward.y,forwardZ:forward.z,upX:up.x,upY:up.y,upZ:up.z}))l[k].setValueAtTime(v,t)}
      else{l.setPosition(pos.x,pos.y,pos.z);l.setOrientation(forward.x,forward.y,forward.z,up.x,up.y,up.z)}
    },
    panner:spatial,position,
    legacy(source,chain,t,duration,level=.03){
      const nodes=[source,...chain];if(!admit(source,nodes,{level}))return false;
      let n=source;for(const q of chain){n.connect(q);n=q}n.connect(roof);
      try{source.buffer?source.start(t,random()*Math.max(0,source.buffer.duration-duration)):source.start(t);source.stop(t+duration);return true}catch{const v=[...voices].find(v=>v.source===source);if(v)stopVoice(v);return false}
    },
    duck(){if(!active)return;duckUntil=ac.currentTime+1.7;at(duck.gain,.62,.04)},
    fireAdded(kind){if(!active||!state)return;const p={x:0,y:.45,z:0};if(dist(state.origin,p)>14)return;
      shot('log_drop',p,SOUND_LEVELS.log,{duration:.3,range:14});for(let i=0,n=3+Math.floor(random()*3);i<n;i++)shot('fire_pop',p,SOUND_LEVELS.pop,{delay:.08+i*.09,duration:.1,range:14});if(kind==='relit')relitAt=ac.currentTime;
    },
    step(actor,{x,z,y=0,walkT=0,speed=0,pose='stand',self=false,space='garden',away=false,surface='grass',teleport=false}){
      const previous=actors.get(actor),phase=Math.floor((walkT+Math.PI/2)/Math.PI),eligible=active&&!away&&space===state?.space&&speed>.25&&['stand','woodcarry'].includes(pose);
      actors.set(actor,{x,z,phase,epoch:actorsReset});
      if(!eligible||!previous||previous.epoch!==actorsReset||teleport||Math.hypot(x-previous.x,z-previous.z)>1.5||phase===previous.phase||(!self&&dist({x,z},state.origin)>10))return false;
      if(Math.hypot(x-previous.x,z-previous.z)<.0001)return false;
      steps++;return shot('step_'+surface,{x,y:y+.06,z},SOUND_LEVELS.step*(self?1:SOUND_LEVELS.friend)*(speed>3.3?1.25:1),{duration:surface==='water'?.24:.14,range:self?20:10,inside:space==='listening'});
    },
    update(s){
      state=s;if(!active||closed||ac.state!=='running')return;
      const now=ac.currentTime,elapsed=lastUpdate?Math.min(1,now-lastUpdate):.4;lastUpdate=now;
      if(lastRain>.015&&s.rain<=.015)endedRain=now;lastRain=s.rain;
      if(duckUntil&&now>duckUntil){at(duck.gain,1,.4);duckUntil=0}
      at(outside.frequency,s.space==='listening'?650:s.shelter?1500:18000,.25);
      if(now>=nextGust){gustStart=now;gustLength=7+random()*7;nextGust=now+30+random()*60}
      const gust=now-gustStart<gustLength?Math.sin(Math.PI*clamp((now-gustStart)/gustLength))**2:0;
      api.windStrength=1+clamp(Math.abs(s.wind))*.8+gust*1.25;
      const origin=s.origin,world=s.space==='listening'?.15:1,local={x:origin.x+2,y:4,z:origin.z-4};
      const eco=ecology({...s,afterRain:now-endedRain,time:now});
      const power=s.fire.stage==='out'?0:s.fire.stage==='embers'?.15:s.fire.stage==='low'?.4:s.fire.stage==='steady'?.65:1;
      const rising=clamp((now-relitAt)/2),fireGain=power*near(dist(origin,{x:0,z:0}),14)*world*rising;
      loop('fire_loop',SOUND_LEVELS.fire*fireGain,{x:0,y:.5,z:0});
      loop('wind_soft_loop',SOUND_LEVELS.wind*(.15+.85*clamp(Math.abs(s.wind)))*world,local);
      loop('wind_gust_loop',SOUND_LEVELS.gust*gust*world,local);
      const tree=s.nearTrees[0],leafPos=tree?{x:tree.x,y:4,z:tree.z}:local;
      loop('leaves_loop',SOUND_LEVELS.leaves*clamp(s.trees/10)*(.15+clamp(Math.abs(s.wind))*.6+gust*.6)*world,leafPos);
      loop('crickets_loop',SOUND_LEVELS.crickets*eco.crickets*world,{x:origin.x-5,y:.15,z:origin.z-3});
      loop('frogs_loop',SOUND_LEVELS.frogs*eco.frogs*world,s.lakePosition);
      if(power&&fireGain>.001&&now>=nextPop){nextPop=now+(-Math.log(Math.max(.00001,1-random())))/(.3+2.7*power);shot('fire_pop',{x:0,y:.6,z:0},SOUND_LEVELS.pop*(.75+power*.25),{duration:.09,range:14})}
      for(const v of [...voices])if((v.group==='bird'&&(!eco.day||s.rain>.75))||(v.group==='owl'&&eco.day)||(v.group==='crow'&&!eco.day))stopVoice(v);
      if(eco.birds>.01&&now>=nextBird){nextBird=now+(2+random()*7)/eco.birds;
        const candidates=s.nearTrees.length?s.nearTrees:[{x:origin.x+8,z:origin.z-8}],t=candidates[Math.floor(random()*candidates.length)],p={x:t.x,y:4+random()*4,z:t.z};
        shot('bird',p,SOUND_LEVELS.bird*(1-s.rain*.7),{duration:.22,range:45});for(const v of voices)if(v.pos===p)v.group='bird';
        if(eco.chorus&&s.nearTrees.length>1){const b=s.nearTrees[(candidates.indexOf(t)+1)%s.nearTrees.length],q={x:b.x,y:6,z:b.z};shot('bird',q,SOUND_LEVELS.bird*.8,{delay:.15+random()*.3,duration:.3,range:45});for(const v of voices)if(v.pos===q)v.group='bird'}
      }
      const distant=()=>{const a=s.forestAngle+(random()-.5),r=30+random()*30;return{x:origin.x+Math.cos(a)*r,y:5,z:origin.z+Math.sin(a)*r}};
      if(now>=nextOwl){nextOwl=now+60+random()*120;if(!eco.day)shot('owl',distant(),SOUND_LEVELS.owl,{duration:.8,range:100})}
      if(now>=nextCrow){nextCrow=now+120+random()*180;if(eco.day)shot('crow',distant(),SOUND_LEVELS.crow,{duration:.4,range:100})}
      // Treat an indoor interval as real time; never replay missed outdoor calls on return.
      api.lastEcology=eco;api.elapsed=elapsed;
    },windStrength:1,
    diagnostics(){return{active,voices:voices.size,loops:loops.size,pcmBytes:cache.bytes+cache.reservedBytes,limit:cache.limit,recordings:[...cache.entries.keys()],failed:[...cache.failed],steps,cutoff:outside.frequency.value,ecology:api.lastEcology}},
    close(){closed=true;api.setActive(false);cache.close();outside.disconnect();roof.disconnect();duck.disconnect()}
  };let actorsReset=0;return api;
}
