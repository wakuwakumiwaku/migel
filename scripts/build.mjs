import {mkdir,rm,copyFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeFiles} from './files.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'dist');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
for(const [destination,source]of Object.entries(runtimeFiles)){
 const input=path.join(root,source),output=path.join(out,destination);
 if(!(await lstat(input)).isFile()||!(await realpath(input)).startsWith(await realpath(root)+path.sep))throw Error('Unsafe build source: '+source);
 await mkdir(path.dirname(output),{recursive:true});await copyFile(input,output);
}
console.log(`Built ${Object.keys(runtimeFiles).length} allowlisted runtime files → dist/`);
