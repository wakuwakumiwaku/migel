import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import {createAppServer} from '../scripts/serve.mjs';
import {runtimeFiles} from '../scripts/files.mjs';
execFileSync(process.execPath,['scripts/build.mjs']);
async function withServer(fn){const server=createAppServer({basePath:'/migel/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
test('subpath application and all allowlisted same-origin runtime assets load',()=>withServer(async url=>{
 for(const target of Object.keys(runtimeFiles)){const r=await fetch(url+'/migel/'+target);assert.equal(r.status,200,target);assert.ok(r.headers.get('x-content-type-options')==='nosniff');}
 const catalog=await(await fetch(url+'/migel/data/catalog.json')).json();assert.equal(catalog.positions.length,786);
 assert.equal((await fetch(url+'/migel/')).status,200);
}));
test('private sources, scripts, traversal, unknown paths and writes are denied',()=>withServer(async url=>{
 for(const target of ['.local/PLAN.md','sources/manifest.json','sources/source-page.html','scripts/serve.mjs','.git/config','data/../../package.json','%2e%2e/package.json','data%2f..%2f..%2fpackage.json','src/%00','?ignored']){
  if(target==='?ignored')continue;assert.equal((await fetch(url+'/migel/'+target)).status,404,target);
 }
 assert.equal((await fetch(url+'/migel/',{method:'POST',body:'x'})).status,405);
 assert.equal((await fetch(url+'/migel/src/app.js',{method:'HEAD'})).status,200);
}));
test('build contains exactly allowlisted files and bytes',async()=>{
 async function walk(dir,prefix=''){let files=[];for(const entry of await readdir(dir,{withFileTypes:true})){if(entry.isDirectory())files.push(...await walk(dir+'/'+entry.name,prefix+entry.name+'/'));else files.push(prefix+entry.name);}return files;}
 assert.deepEqual((await walk('dist')).sort(),Object.keys(runtimeFiles).sort());
 for(const [target,source]of Object.entries(runtimeFiles))assert.deepEqual(await readFile('dist/'+target),await readFile(source));
});
