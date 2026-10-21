import {readFile,lstat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runtimeFiles} from './files.mjs';
const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
if(catalog.positions.length!==786||catalog.notes.length!==250||catalog.chapters.length!==24)throw Error('Catalog count mismatch');
for(const f of catalog.provenance.files){const b=await readFile('public/data/'+f.file);if(b.length!==f.bytes||createHash('sha256').update(b).digest('hex')!==f.sha256)throw Error('Source fingerprint mismatch');}
for(const [target,source]of Object.entries(runtimeFiles)){
 if(!(await lstat(source)).isFile())throw Error('Not a file: '+source);
 if(/\.(js|mjs)$/.test(source))execFileSync(process.execPath,['--check',source]);
}
for(const f of ['scripts/build.mjs','scripts/serve.mjs','scripts/files.mjs','tests/domain.test.mjs','tests/server.test.mjs','tests/browser.mjs'])execFileSync(process.execPath,['--check',f]);
const css=await readFile('src/styles.css','utf8');if(css.includes('[truncated]')||!css.includes('.line-controls')||!css.includes('.original-note')||!css.includes('@media print'))throw Error('Incomplete stylesheet');
console.log('Check passed: syntax, pinned source hashes, 786 positions, 250 notes, 24 chapters.');
