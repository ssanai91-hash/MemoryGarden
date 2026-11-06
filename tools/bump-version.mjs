// 정원 버전 올리기: 커밋할 때마다 0.1씩 (0.9 → 1.0 → 1.1 …).
// 버전의 유일한 기준은 index.html 입장 화면의 <small class="entry-version">ver X.Y</small> 한 줄이다.
//   node tools/bump-version.mjs          버전을 0.1 올리고 새 버전을 출력
//   node tools/bump-version.mjs --show   현재 버전만 출력
//   node tools/bump-version.mjs <파일>    다른 위치의 index.html 사본(커밋 훅의 스테이징 사본)에 적용
// 커밋 때 자동으로 돌리려면 저장소에서 한 번: git config core.hooksPath tools/git-hooks
import fs from 'node:fs';
const arg=process.argv.slice(2).find(a=>!a.startsWith('--')),file=arg||new URL('../index.html',import.meta.url),html=fs.readFileSync(file,'utf8');
const pattern=/(<small class="entry-version">ver )(\d+)\.(\d)(<\/small>)/;
const match=html.match(pattern);
if(!match){console.error('index.html에서 entry-version 표시를 찾지 못했어요.');process.exit(1)}
const tenths=Number(match[2])*10+Number(match[3]);
const format=t=>`${Math.floor(t/10)}.${t%10}`;
if(process.argv.includes('--show')){console.log(format(tenths));process.exit(0)}
const next=format(tenths+1);
fs.writeFileSync(file,html.replace(pattern,`$1${next}$4`));
console.log(next);
