// 반가사유상 GLB를 페이지 맨 처음(three.js·정원 장면을 만들기 전)부터 받아 둔다.
// 1) 기기 보관함(Cache Storage)에 고화질본이 있으면 그것만 꺼낸다 → 재방문은 즉시.
// 2) 없으면 작은 미리보기본(약 0.4MB)을 먼저 받아 바로 세우고, 고화질본(약 4MB)은 뒤이어 받아 교체한다.
// 받은 파일은 주소의 ?v=<내용 해시>로 보관함에 넣고 다시 받지 않는다. 옛 버전은 sayu-statues.js가 정리한다.
(function(root){
  if(root.GardenSayuPrefetch)return;
  const CACHE='garden-statues-v1';
  const STATUES=[
    {side:'left',preview:'./assets/sayu-left-preview.glb?v=371cc452',hq:'./assets/sayu-left-hq.glb?v=144e7b2f'},
    {side:'right',preview:'./assets/sayu-right-preview.glb?v=180a91f4',hq:'./assets/sayu-right-hq.glb?v=a2f539ae'}
  ];
  const open=()=>{try{return root.caches?caches.open(CACHE).catch(()=>null):Promise.resolve(null)}catch(_){return Promise.resolve(null)}};
  const store=open();
  async function cached(url){
    const cache=await store;if(!cache)return null;
    try{const hit=await cache.match(url);return hit?await hit.arrayBuffer():null}catch(_){return null}
  }
  async function download(url,priority){
    const response=await fetch(url,{priority});
    if(!response.ok)throw new Error('응답 '+response.status+' '+url);
    const bytes=await response.arrayBuffer(),cache=await store;
    if(cache){try{await cache.put(url,new Response(bytes.slice(0),{headers:{'Content-Type':'model/gltf-binary'}}))}catch(_){}}
    return bytes;
  }
  // 한 조각상마다 {preview, hq} 두 약속. 고화질본이 보관함에 있으면 preview는 null로 끝난다.
  const jobs=STATUES.map(s=>{
    const hqHit=cached(s.hq);
    const preview=hqHit.then(b=>b?null:cached(s.preview).then(p=>p||download(s.preview,'high')));
    // 미리보기 두 개를 먼저 받고 나서 고화질을 받는다(첫 방문의 좁은 회선에서 미리보기가 밀리지 않게).
    const hq=hqHit.then(b=>b||Promise.allSettled(previewAll()).then(()=>download(s.hq,'low')));
    return {side:s.side,urls:s,preview,hq,fromCache:hqHit.then(Boolean)};
  });
  function previewAll(){return jobs.map(j=>j.preview)}
  for(const j of jobs){j.preview.catch(()=>{});j.hq.catch(()=>{})}
  root.GardenSayuPrefetch=Object.freeze({CACHE,STATUES,jobs});
})(globalThis);
