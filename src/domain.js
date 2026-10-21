export const STORAGE_KEY = 'migel.workspace.v1';
export const CONTEXTS = { self: 'HVB Selbstanwendung', care: 'HVB Pflege' };
export const LIMIT = 1000000n;
export function normalize(text) {
  return String(text).toLowerCase().replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u');
}
export function quantity(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:[.,]\d{1,4})?$/.test(value)) throw Error('Menge: positive Zahl, höchstens 4 Nachkommastellen und 1 000 000.');
  const [whole,part=''] = value.replace(',','.').split('.');
  const scaled = BigInt(whole)*10000n + BigInt(part.padEnd(4,'0'));
  if (scaled <= 0n || scaled > LIMIT*10000n) throw Error('Menge muss grösser als 0 und höchstens 1 000 000 sein.');
  return scaled;
}
export function money(cents) {
  if (cents === null) return 'offen';
  const raw=BigInt(cents).toString().padStart(3,'0');
  return `CHF ${raw.slice(0,-2).replace(/\B(?=(\d{3})+(?!\d))/g,'’')}.${raw.slice(-2)}`;
}
export function lineCents(position,context,q) {
  const scaled = quantity(q), amount=position.amounts[context];
  if (!amount || amount.kind !== 'numeric') return null;
  if (!/^\d+\.\d{2}$/.test(amount.decimal)) throw Error('Ungültiger Katalogbetrag.');
  const cents=BigInt(amount.decimal.replace('.',''));
  return (cents * scaled + 5000n)/10000n;
}
export function totals(lines,byId) {
  let cents=0n, unresolved=0;
  for (const line of lines) {
    const amount=lineCents(byId.get(line.id),line.context,line.quantity);
    if (amount===null) unresolved++; else cents+=amount;
  }
  return {cents,unresolved,complete:unresolved===0};
}
export function emptyWorkspace(catalog) {
  return {app:'migel.workspace',version:1,edition:catalog.edition,source_sha256:catalog.provenance.files.find(f=>f.file.endsWith('.xlsx')).sha256,lines:[],favorites:[]};
}
const object = v => v !== null && typeof v==='object' && !Array.isArray(v);
function exactKeys(value,keys) { return object(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k)); }
export function validateWorkspace(value,catalog) {
  const expected=emptyWorkspace(catalog), known=new Set(catalog.positions.map(p=>p.id));
  if (!exactKeys(value,Object.keys(expected)) || value.app!==expected.app || value.version!==1 || value.edition!==expected.edition || value.source_sha256!==expected.source_sha256) throw Error('Keine passende MiGeL-Sicherung dieser Quellversion.');
  if (!Array.isArray(value.lines) || value.lines.length>2000 || !Array.isArray(value.favorites) || value.favorites.length>known.size) throw Error('Ungültige Anzahl Einträge.');
  const seen=new Set();
  const lines=value.lines.map(line=>{
    if (!exactKeys(line,['id','context','quantity']) || !known.has(line.id) || typeof line.context !== 'string' || !Object.hasOwn(CONTEXTS,line.context)) throw Error('Unbekannte Position oder Anwendung in der Sicherung.');
    quantity(line.quantity);
    const key=line.id+'|'+line.context;
    if (seen.has(key)) throw Error('Doppelte Position mit gleicher Anwendung.');
    seen.add(key);
    return {id:line.id,context:line.context,quantity:line.quantity};
  });
  const favorites=value.favorites.map(id=>{
    if (typeof id!=='string' || !known.has(id)) throw Error('Unbekannter Favorit.');
    return id;
  });
  if (new Set(favorites).size!==favorites.length) throw Error('Doppelte Favoriten.');
  return {...expected,lines,favorites};
}
// Bounded, immutable-catalog membership buckets; never cache query results or workspace state.
const memberships = new WeakMap();
export function searchIndex(catalog) {
  const notes=new Map(catalog.notes.map(n=>[n.id,n]));
  const index=new Map(catalog.positions.map(p=>[p.id,normalize([p.code,p.title,p.unit,p.limitation,p.system,...p.note_ids.map(id=>{ const n=notes.get(id); return n.code+' '+n.title+' '+n.limitation;})].join(' '))]));
  const chapter=new Map(),category=new Map(),system=new Map(),noteByCode=new Map();
  // Match the previous notes.find semantics even if a caller supplies duplicate note codes.
  for(const n of catalog.notes)if(!noteByCode.has(n.code))noteByCode.set(n.code,n.id);
  const add=(map,code,p)=>{if(!map.has(code))map.set(code,[]);map.get(code).push(p);};
  for(const p of catalog.positions){
    add(chapter,p.chapter,p);add(system,p.system,p);
    const codes=new Set(p.hierarchy);
    for(const id of p.note_ids){const n=notes.get(id);if(n&&noteByCode.get(n.code)===id)codes.add(n.code);}
    for(const code of codes)add(category,code,p);
  }
  memberships.set(index,{catalog,chapter,category,system,noteByCode});
  return index;
}
export function filterPositions(catalog,index,{query='',chapter='',category='',system='',favoritesOnly=false,favorites=[]}={}) {
  const words=normalize(query).trim().split(/\s+/).filter(Boolean),starred=favoritesOnly?new Set(favorites):null;
  const cached=memberships.get(index),buckets=cached?.catalog===catalog?cached:null;
  const categoryNoteId=category?(buckets?buckets.noteByCode.get(category):catalog.notes.find(n=>n.code===category)?.id):undefined;
  let candidates=catalog.positions;
  if(buckets)for(const [field,value]of [['chapter',chapter],['category',category],['system',system]]){
    if(value){const subset=buckets[field].get(value)||[];if(subset.length<candidates.length)candidates=subset;}
  }
  // Each bucket is built in source order. Apply every predicate to the smallest one.
  return candidates.filter(p=>(!chapter||p.chapter===chapter)&&(!category||p.hierarchy.includes(category)||p.note_ids.includes(categoryNoteId))&&(!system||p.system===system)&&(!favoritesOnly||starred.has(p.id))&&words.every(w=>index.get(p.id).includes(w)));
}
export function csvCell(value) {
  let s=String(value??'');
  if (/^[\s]*[=+\-@]/.test(s) || /^[\t\r]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function planCsv(workspace,catalog) {
  const byId=new Map(catalog.positions.map(p=>[p.id,p])),notes=new Map(catalog.notes.map(n=>[n.id,n]));
  const rows=[['Position','Bezeichnung','System gemäss Endziffer','Anwendung','Menge in Quelleneinheiten','Quelleneinheit','HVB-Typ','HVB CHF (Zahl) oder Originaltext','Zeile CHF','Limitation','Gruppenhinweise','Quelle','Gültig ab','XLSX-Zeile']];
  for (const l of workspace.lines) {
    const p=byId.get(l.id),a=p.amounts[l.context],c=lineCents(p,l.context,l.quantity);
    rows.push([p.code,p.title,p.system,CONTEXTS[l.context],l.quantity,p.unit,a.kind,a.kind==='numeric'?a.decimal:a.raw,c===null?'OFFEN':`${c/100n}.${(c%100n).toString().padStart(2,'0')}`,p.limitation,p.note_ids.map(id=>{const n=notes.get(id);return n.code+' '+n.title+'\n'+n.limitation;}).join('\n\n'),catalog.edition,p.valid_from,p.source_row]);
  }
  const t=totals(workspace.lines,byId);
  rows.push([t.complete?'Summe der HVB-Zeilen (keine Erstattungszusage)':'UNVOLLSTÄNDIGE Teilsumme; '+t.unresolved+' offene Zeilen','','','','','','','',`${t.cents/100n}.${(t.cents%100n).toString().padStart(2,'0')}`]);
  return '\uFEFF'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
