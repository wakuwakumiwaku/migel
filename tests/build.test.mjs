import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,readFile,writeFile,rename,rm,symlink,readdir,lstat,readlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';

// External regression runners may select an exact archived tree without editing it.
const source=process.env.BUILD_SOURCE_ROOT?path.resolve(process.env.BUILD_SOURCE_ROOT):fileURLToPath(new URL('../',import.meta.url));
const {runtimeFiles}=await import(pathToFileURL(path.join(source,'scripts/files.mjs')).href);
const hash=data=>createHash('sha256').update(data).digest('hex');
async function fixture(){
 const owner=await mkdtemp(path.join(os.tmpdir(),'build-integrity-')),root=path.join(owner,'project');
 await mkdir(root);
 for(const file of new Set([...Object.values(runtimeFiles),...['scripts/build.mjs','scripts/files.mjs'],'package.json'])){
  const dest=path.join(root,file);await mkdir(path.dirname(dest),{recursive:true});await cp(path.join(source,file),dest);
 }
 return {owner,root};
}
async function inventory(root){
 const result={};
 async function walk(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   const name=prefix+entry.name;
   if(entry.isDirectory())await walk(path.join(dir,entry.name),name+'/');
   else result[name]=hash(await readFile(path.join(dir,entry.name)));
  }
 }
 await walk(root);return result;
}
function cli(root,label,options=[]){
 const r=spawnSync(process.execPath,[...options,path.join(root,'scripts/build.mjs')],{cwd:root,env:process.env,encoding:'utf8',timeout:30000});
 assert.equal(r.error,undefined,label+': build process must actually execute');
 console.log(JSON.stringify({label,command:[process.execPath,...options,path.join(root,'scripts/build.mjs')],cwd:root,status:r.status,signal:r.signal,stdout:r.stdout,stderr:r.stderr}));
 assert.equal(r.signal,null,label+': no timeout or signal');return r;
}
async function exactOutput(root){
 const expected={};for(const [dest,src]of Object.entries(runtimeFiles))expected[dest]=hash(await readFile(path.join(root,src)));
 assert.deepEqual(await inventory(path.join(root,'dist')),expected,'successful build contains only allowlisted original bytes');
}
async function absent(file){await assert.rejects(lstat(file),{code:'ENOENT'});}

for(const file of ['index.html','public/data/provenance.json'])test('failed build CLI preserves the complete last good site when '+file+' is missing',async()=>{
 const {owner,root}=await fixture();
 try{
  assert.equal(cli(root,'initial valid '+file).status,0);await exactOutput(root);const before=await inventory(path.join(root,'dist'));
  await rm(path.join(root,file));const r=cli(root,'missing '+file);assert.notEqual(r.status,0,'missing runtime source must fail the actual build CLI');assert.match(r.stderr,/ENOENT/);
  assert.deepEqual(await inventory(path.join(root,'dist')),before,'input failure must preserve every byte of the last good site');
 }finally{await rm(owner,{recursive:true,force:true});}
});
test('rejected leaf symlink preserves the complete last good site',async()=>{
 const {owner,root}=await fixture();
 try{
  assert.equal(cli(root,'initial valid before link').status,0);const before=await inventory(path.join(root,'dist'));
  await rename(path.join(root,'src/styles.css'),path.join(root,'src/held.css'));await symlink('held.css',path.join(root,'src/styles.css'));
  const r=cli(root,'rejected leaf link');assert.notEqual(r.status,0);assert.match(r.stderr,/Unsafe build source/);
  assert.deepEqual(await inventory(path.join(root,'dist')),before,'rejected input must not leave a partial replacement site');
 }finally{await rm(owner,{recursive:true,force:true});}
});
test('fresh failed build CLI leaves no partial output',async()=>{
 const {owner,root}=await fixture();
 try{
  await rm(path.join(root,'public/data/provenance.json'));assert.notEqual(cli(root,'fresh late missing input').status,0);await absent(path.join(root,'dist'));
 }finally{await rm(owner,{recursive:true,force:true});}
});
for(const kind of ['file','symlink'])test('build CLI refuses '+kind+' output without replacing it',async()=>{
 const {owner,root}=await fixture();
 try{
  const target=path.join(owner,'synthetic-output-target');await mkdir(target);await writeFile(path.join(target,'sentinel.txt'),'synthetic retained bytes');
  const dist=path.join(root,'dist');if(kind==='file')await writeFile(dist,'synthetic retained file');else await symlink(target,dist,'dir');
  assert.notEqual(cli(root,'refuse '+kind+' destination').status,0,'a non-directory output must not be silently removed');
  if(kind==='file')assert.equal(await readFile(dist,'utf8'),'synthetic retained file');else assert.equal(await readlink(dist),target);
  assert.deepEqual(await inventory(target),{'sentinel.txt':hash('synthetic retained bytes')});
 }finally{await rm(owner,{recursive:true,force:true});}
});
test('successful rebuild replaces stale files with the exact allowlist and original bytes',async()=>{
 const {owner,root}=await fixture();
 try{
  assert.equal(cli(root,'initial successful build').status,0);await exactOutput(root);
  await writeFile(path.join(root,'dist/stale.txt'),'stale');await writeFile(path.join(root,'src/app.js'),'export const syntheticReplacement = true;\n');
  assert.equal(cli(root,'successful replacement').status,0);await exactOutput(root);
  assert.deepEqual((await readdir(root)).filter(n=>n.startsWith('.build-')),[],'no abandoned staging directory');
 }finally{await rm(owner,{recursive:true,force:true});}
});

for(const restoreFails of [false,true])test('failed output replacement '+(restoreFails?'retains the backup if restoration also fails':'restores the previous complete build'),async()=>{
 const {owner,root}=await fixture();
 try{
  assert.equal(cli(root,'initial before rename failure').status,0);const before=await inventory(path.join(root,'dist'));
  const preload=path.join(owner,'synthetic-rename-failure.mjs');
  await writeFile(preload,`
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const rename=fs.promises.rename;
fs.promises.rename=async(from,to)=>{
 if(path.basename(path.dirname(from)).startsWith('.build-') && (path.basename(from)==='output' || (${restoreFails} && path.basename(from)==='previous'))){
  console.error('SYNTHETIC_RENAME_REFUSAL '+path.basename(from));
  throw Object.assign(Error('synthetic rename refusal'),{code:'EACCES'});
 }
 return rename(from,to);
};
syncBuiltinESMExports();
`);
  const r=cli(root,'replacement failure restoreFails='+restoreFails,['--import',preload]);assert.notEqual(r.status,0);assert.match(r.stderr,/SYNTHETIC_RENAME_REFUSAL output/,'real replacement boundary reached');
  const stages=(await readdir(root)).filter(n=>n.startsWith('.build-'));
  if(restoreFails){
   assert.match(r.stderr,/SYNTHETIC_RENAME_REFUSAL previous/);assert.match(r.stderr,/Previous build retained/);assert.equal(stages.length,1);
   assert.deepEqual(await inventory(path.join(root,stages[0],'previous')),before,'the only good copy must not be deleted on rollback failure');
  }else{
   assert.deepEqual(await inventory(path.join(root,'dist')),before);assert.deepEqual(stages,[]);
  }
 }finally{await rm(owner,{recursive:true,force:true});}
});

