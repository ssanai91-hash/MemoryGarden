// 버전 표시는 한 줄, ver 정수.한자리 형식이고, 올리기 도구는 0.1씩(0.9 → 1.0) 올린다.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const html=fs.readFileSync(__dirname+'/../index.html','utf8'),marks=html.match(/<small class="entry-version">ver \d+\.\d<\/small>/g)||[];
assert.equal(marks.length,1,'index.html에 ver X.Y 표시가 정확히 한 번 있어야 해요');
const tool=path.join(__dirname,'..','tools','bump-version.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ver-')),file=path.join(dir,'index.html');
const run=(...a)=>execFileSync(process.execPath,[tool,...a]).toString().trim();
fs.writeFileSync(file,'<p><small class="entry-version">ver 0.8</small></p>');
assert.equal(run(file),'0.9');assert.equal(run(file),'1.0');assert.equal(run(file),'1.1');assert.equal(run('--show',file),'1.1');
assert.equal(fs.readFileSync(file,'utf8'),'<p><small class="entry-version">ver 1.1</small></p>');
fs.rmSync(dir,{recursive:true,force:true});
assert.ok(fs.statSync(path.join(__dirname,'..','tools','git-hooks','pre-commit')).mode&0o111,'커밋 훅은 실행 가능해야 해요');
console.log('PASS: single version mark, 0.1 steps with carry (0.9→1.0), staged-copy bump, executable commit hook.');
