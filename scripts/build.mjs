import {mkdir,rm,readFile,writeFile,mkdtemp,rename,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeFiles} from './files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
// Validate and snapshot every input before touching the previous complete site.
const buffers=new Map(),realRoot=await realpath(root);
for(const [destination,source]of Object.entries(runtimeFiles)){
 const input=path.join(root,source);
 if(!(await lstat(input)).isFile()||!(await realpath(input)).startsWith(realRoot+path.sep))throw Error('Unsafe build source: '+source);
 buffers.set(destination,await readFile(input));
}
try{const stat=await lstat(out);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Refusing non-directory/symlink dist');}catch(error){if(error.code!=='ENOENT')throw error;}
const stage=await mkdtemp(path.join(root,'.build-')),output=path.join(stage,'output'),backup=path.join(stage,'previous');
let moved=false;
try{
 await mkdir(output);
 for(const [destination,bytes]of buffers){const file=path.join(output,destination);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes,{flag:'wx'});}
 try{await rename(out,backup);moved=true;}catch(error){if(error.code!=='ENOENT')throw error;}
 try{await rename(output,out);}catch(error){
  if(moved){
   try{await rename(backup,out);moved=false;}
   catch(restoreError){throw new AggregateError([error,restoreError],'Previous build retained at '+backup);}
  }
  throw error;
 }
 moved=false;
}finally{
 // Never delete the only good copy if restoring it also failed.
 if(!moved)await rm(stage,{recursive:true,force:true});
}
console.log(`Built ${Object.keys(runtimeFiles).length} allowlisted runtime files → dist/`);
