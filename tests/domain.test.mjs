import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {quantity,money,lineCents,totals,emptyWorkspace,validateWorkspace,searchIndex,filterPositions,normalize,csvCell,planCsv,STORAGE_KEY} from '../src/domain.js';
const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
const byId=new Map(catalog.positions.map(p=>[p.id,p])),find=code=>catalog.positions.find(p=>p.code===code);
const fixture=decimal=>({amounts:{self:{kind:'numeric',decimal}}});
test('positive exact decimal quantities; no exponent/negative/zero or unbounded values',()=>{
 assert.equal(quantity('2,125'),21250n);assert.equal(quantity('1000000'),10000000000n);
 for(const bad of ['0','-1','NaN','1e3','01','1.00001','1000000.0001','',null,1,'1;'])assert.throws(()=>quantity(bad));
});
test('round final line half up to cents with integer arithmetic, then sum',()=>{
 assert.equal(lineCents(fixture('0.01'),'self','0.5'),1n);
 assert.equal(lineCents(fixture('0.01'),'self','0.4999'),0n);
 assert.equal(lineCents(fixture('47.17'),'self','2'),9434n);
 assert.equal(lineCents(fixture('9999.99'),'self','0.1234'),123400n);
 const p=find('01.01.01.00.1'),l={id:p.id,context:'self',quantity:'2'};assert.equal(totals([l],byId).cents,9434n);
 assert.equal(money(123456789n),'CHF 1’234’567.89');
});
test('missing and nonnumeric are unresolved, never zero-filled',()=>{
 const unknown=catalog.positions.find(p=>p.amounts.care.kind==='text');
 const missing=catalog.positions.find(p=>p.amounts.self.kind==='missing');
 assert.equal(lineCents(unknown,'care','2'),null);assert.equal(lineCents(missing,'self','1'),null);
 const t=totals([{id:unknown.id,context:'care',quantity:'1'},{id:missing.id,context:'self',quantity:'1'}],byId);assert.deepEqual(t,{cents:0n,unresolved:2,complete:false});
});
test('actual source strings looking numeric remain nonnumeric',()=>{
 const p=find('09.03.01.00.2');assert.equal(p.amounts.care.kind,'text');assert.equal(p.amounts.care.raw,'124.46\n');assert.equal(lineCents(p,'care','1'),null);
});
test('purchase/rental, reimbursement unit and literal source codes survive',()=>{
 assert.equal(find('01.01.03.00.2').system,'Miete');assert.equal(find('01.01.03.00.2').unit,'Miete / Tag');
 const p=catalog.positions.find(p=>p.code.endsWith(' '));assert.ok(p);assert.equal(p.code,p.source_cells.H.value);
});
test('separate self and care contexts use actual amounts',()=>{
 const p=find('01.01.01.00.1');assert.equal(lineCents(p,'self','1'),4717n);assert.equal(lineCents(p,'care','1'),4482n);
});
test('full catalog search is accent/umlaut tolerant and includes group limitation text',()=>{
 const index=searchIndex(catalog);assert.equal(normalize('Hörgeräte'),normalize('Hoergeraete'));
 assert.ok(filterPositions(catalog,index,{query:'Hoergeraete'}).some(p=>p.chapter==='13'));
 assert.ok(filterPositions(catalog,index,{query:'Frühgeborenen'}).some(p=>p.code==='01.01.01.00.1'));
 assert.equal(filterPositions(catalog,index,{category:'01.01'}).length,5);
 assert.equal(filterPositions(catalog,index,{system:'Miete'}).length,43);
 assert.equal(filterPositions(catalog,index,{chapter:'01'}).length,catalog.chapters[0].count);
});
test('complete JSON validation returns a defensive canonical copy',()=>{
 const value=emptyWorkspace(catalog);value.lines=[{id:'D4',context:'self',quantity:'2'}];value.favorites=['D4'];
 const result=validateWorkspace(JSON.parse(JSON.stringify(value)),catalog);assert.deepEqual(result,value);assert.notEqual(result.lines,value.lines);
 assert.equal(STORAGE_KEY,'migel.workspace.v1');
});
test('invalid later line rejects the entire import without mutation',()=>{
 const valid=emptyWorkspace(catalog);valid.lines=[{id:'D4',context:'self',quantity:'1'}];const before=JSON.stringify(valid);
 for(const mutate of [v=>v.lines.push({id:'unknown',context:'self',quantity:'1'}),v=>v.lines.push({...v.lines[0]}),v=>v.lines[0].quantity='1e4',v=>v.lines[0].context='__proto__',v=>v.favorites.push('unknown'),v=>v.favorites.push('D4','D4'),v=>v.edition='other',v=>v.source_sha256='no',v=>v.foo='extra',v=>v.lines[0].amount=0]){
  const bad=JSON.parse(before);mutate(bad);assert.throws(()=>validateWorkspace(bad,catalog));assert.equal(JSON.stringify(valid),before);
 }
});
test('different contexts may coexist; identical contexts cannot duplicate',()=>{
 const v=emptyWorkspace(catalog);v.lines=[{id:'D4',context:'self',quantity:'1'},{id:'D4',context:'care',quantity:'1'}];assert.equal(validateWorkspace(v,catalog).lines.length,2);
});
test('CSV quotes multiline source notes and neutralizes spreadsheet formula injection',()=>{
 assert.equal(csvCell('a"b\nc'),'"a""b\nc"');assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('  @a'),'"\'  @a"');
 const v=emptyWorkspace(catalog);v.lines=[{id:'D4',context:'self',quantity:'2'}];const csv=planCsv(v,catalog);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('94.34'));assert.ok(csv.includes('Limitation'));assert.ok(csv.includes('Frühgeborenen'));
});
test('CSV unresolved line is explicit and aggregate is incomplete',()=>{
 const p=catalog.positions.find(p=>p.amounts.care.kind==='text'),v=emptyWorkspace(catalog);v.lines=[{id:p.id,context:'care',quantity:'1'}];const csv=planCsv(v,catalog);assert.ok(csv.includes('OFFEN'));assert.ok(csv.includes('UNVOLLSTÄNDIGE'));assert.ok(csv.includes('Kategorie A'));
});
test('membership buckets preserve full ordered results across real categories, chapters and systems',()=>{
 const index=searchIndex(catalog),categories=[...new Set([...catalog.notes.map(n=>n.code),...catalog.positions.flatMap(p=>p.hierarchy)])];
 const reference=({chapter='',category='',system='',query='',favoritesOnly=false,favorites=[]})=>{
  const note=catalog.notes.find(n=>n.code===category),words=normalize(query).trim().split(/\s+/).filter(Boolean);
  return catalog.positions.filter(p=>(!chapter||p.chapter===chapter)&&(!category||p.hierarchy.includes(category)||p.note_ids.includes(note?.id))&&(!system||p.system===system)&&(!favoritesOnly||favorites.includes(p.id))&&words.every(w=>index.get(p.id).includes(w))).map(p=>p.id);
 };
 const verify=filters=>assert.deepEqual(filterPositions(catalog,index,filters).map(p=>p.id),reference(filters),JSON.stringify(filters));
 for(const category of [...categories,'not-a-category'])for(const system of ['',...new Set(catalog.positions.map(p=>p.system))])verify({category,system});
 for(const c of catalog.chapters)for(const query of ['', 'Milch','Hoergeraete','Frühgeborenen','zzzxxyy'])verify({chapter:c.code,query});
 const favorites=['D904','D4'];verify({favoritesOnly:true,favorites});favorites.splice(0,2,'D7');verify({favoritesOnly:true,favorites});favorites.push('D904');verify({category:'35.06.08',favoritesOnly:true,favorites});
 assert.equal(filterPositions(catalog,index,{category:'26.01'}).length,9);
 assert.ok(filterPositions(catalog,index,{category:'35.06.08'}).some(p=>p.id==='D904'));
 // Public Map behavior remains usable, without an internal bucket, and live text edits are respected.
 const plain=new Map(index);assert.deepEqual(filterPositions(catalog,plain,{category:'26.01'}),filterPositions(catalog,index,{category:'26.01'}));
 index.set('D4','marker-sentinel');assert.deepEqual(filterPositions(catalog,index,{query:'marker-sentinel'}).map(p=>p.id),['D4']);
});
