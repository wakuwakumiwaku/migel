import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyWorkspace,validateWorkspace} from '../src/domain.js';
const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
const populated=()=>({...emptyWorkspace(catalog),lines:[{id:'D4',context:'self',quantity:'2'},{id:'D4',context:'care',quantity:'3'}]});

test('application contexts are literal strings, never coercible JSON arrays or objects',()=>{
 const valid=populated(),validBefore=JSON.stringify(valid);
 for(const context of [['self'],['care'],[['self']],[[['care']]],[],{},null,0,true]){
  const bad=structuredClone(valid);bad.lines[1].id='D7';bad.lines[1].context=context;const before=JSON.stringify(bad);
  assert.throws(()=>validateWorkspace(bad,catalog),/Unbekannte|Ungültig/,'Reject context type '+JSON.stringify(context));
  assert.equal(JSON.stringify(bad),before,'validation never repairs or mutates a malformed document');
  assert.equal(JSON.stringify(valid),validBefore,'populated valid input remains unchanged');
 }
});
test('valid literal self and care may coexist and remain exact canonical strings',()=>{
 const valid=populated(),result=validateWorkspace(valid,catalog);assert.deepEqual(result,valid);
 assert.deepEqual(result.lines.map(l=>[typeof l.context,l.context]),[['string','self'],['string','care']]);
});
