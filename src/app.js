import {STORAGE_KEY,CONTEXTS,quantity,money,lineCents,totals,emptyWorkspace,validateWorkspace,searchIndex,filterPositions,planCsv} from './domain.js';
const $=id=>document.getElementById(id);
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function button(text,action,className){const b=node('button',text,className);b.type='button';b.addEventListener('click',action);return b;}
function link(text,href,download=false){const a=node('a',text);a.href=href;if(download)a.download='';return a;}
function tell(text){$('status').textContent=text;}
let catalog,byId,notes,index,workspace,storageOK=true,storedRaw=null,displayContext='self',shown=60,pendingImport=null;
let filters={query:'',chapter:'',category:'',system:'',favoritesOnly:false};
let importRevision=0;
const drafts=new Map();
const key=l=>l.id+'|'+l.context;
function storageWarning(text){storageOK=false;$('storage-warning').hidden=false;$('storage-message').textContent=text;$('storage-state').textContent='Nur im Arbeitsspeicher. JSON sichern; Änderungen gehen beim Schliessen verloren.';}
function readStorage(){
  try{storedRaw=localStorage.getItem(STORAGE_KEY);return storedRaw===null?emptyWorkspace(catalog):validateWorkspace(JSON.parse(storedRaw),catalog);}
  catch{storageWarning('Lokaler Speicher ist blockiert oder enthält eine beschädigte bzw. unpassende Sicherung. Vorhandene Daten werden nicht überschrieben. Diese Sitzung arbeitet nur im Arbeitsspeicher.');return emptyWorkspace(catalog);}
}
function persist(next=workspace){
 if(!storageOK)return false;
 try{
  if(localStorage.getItem(STORAGE_KEY)!==storedRaw){storageWarning('Der MiGeL-Speicher wurde anderswo geändert. Speichern pausiert; aktuelle Arbeit als JSON sichern und neu laden.');return false;}
  const raw=JSON.stringify(next);localStorage.setItem(STORAGE_KEY,raw);storedRaw=raw;return true;
 }catch{storageWarning('Speichern nicht möglich. Diese Sitzung bleibt nutzbar, ist aber nicht dauerhaft gespeichert. Bitte JSON sichern.');return false;}
}
function invalidDraft(){for(const text of drafts.values()){try{quantity(text);}catch{return true;}}return false;}
function renderSummary(){
 const invalid=invalidDraft(),t=totals(workspace.lines,byId);
 $('plan-count').textContent=String(workspace.lines.length);
 $('mobile-plan-count').textContent=String(workspace.lines.length);
 $('total-label').textContent=invalid?'Berechnung pausiert':t.complete?'Summe der HVB-Zeilen':'Bekannte Teilsumme · unvollständig';
 $('total').textContent=invalid?'—':money(t.cents);
 $('unknown-warning').hidden=!invalid&&t.complete;
 $('unknown-warning').textContent=invalid?'Ungültige Menge korrigieren. Es wird keine aktuelle Summe ausgewiesen.':`${t.unresolved} Zeile(n) ohne numerischen HVB. Nicht als 0 gerechnet; keine vollständige Gesamtsumme möglich.`;
 for(const id of ['export-json','export-csv','print'])$(id).disabled=invalid;
}
function renderChapters(){
 const root=$('chapters');root.replaceChildren();
 const add=(code,title,count)=>{const b=button('',()=>chooseChapter(code),'chapter');b.setAttribute('aria-pressed',String(filters.chapter===code));b.append(node('span',code||'◫','chapter-code'),node('span',title,'chapter-name'),node('small',String(count)));root.append(b);};
 add('','Alle Positionen',catalog.positions.length);
 for(const c of catalog.chapters)add(c.code,c.title,c.count);
}
function updateCategories(){
 const select=$('category');select.replaceChildren(new Option('Alle Kategorien',''));
 const named=new Map(catalog.notes.filter(n=>n.level>1).map(n=>[n.code,n]));
 const codes=new Set([...named.keys(),...catalog.positions.flatMap(p=>p.hierarchy.slice(1))]);
 for(const code of [...codes].sort((a,b)=>a.localeCompare(b,'de'))){
  if(filters.chapter&&!code.startsWith(filters.chapter+'.'))continue;
  const n=named.get(code);select.add(new Option(code+' · '+(n?n.title.split('\n')[0]:'ohne separate Quellüberschrift'),code));
 }
 select.value=filters.category;
}
function chooseChapter(value){filters.chapter=value;filters.category='';$('chapter-select').value=value;updateCategories();renderChapters();shown=60;renderResults();}
function amountText(a){return a.kind==='numeric'?money(BigInt(a.decimal.replace('.',''))):a.kind==='missing'?'Nicht angegeben':a.raw;}
function renderResults(){
 const list=filterPositions(catalog,index,{...filters,favorites:workspace.favorites});
 $('results-count').textContent=`${list.length} Treffer · ${catalog.positions.length} offizielle Positionen · ${catalog.chapters.length} Produktgruppen`;
 const hint=$('group-note');hint.replaceChildren();
 const selected=filters.category||filters.chapter;
 if(selected){const n=catalog.notes.find(n=>n.code===selected);if(n){const box=node('div',undefined,'group-hint');box.append(button('Originalhinweise: '+n.code+' · '+n.title.split('\n')[0],()=>openNote(n)));hint.append(box);}}
 const fragment=document.createDocumentFragment();
 for(const p of list.slice(0,shown)){
  const row=node('article',undefined,'result-row');row.dataset.id=p.id;
  const fav=button(workspace.favorites.includes(p.id)?'★':'☆',()=>toggleFavorite(p.id),'favorite');fav.setAttribute('aria-label','Favorit '+p.code);fav.setAttribute('aria-pressed',String(workspace.favorites.includes(p.id)));
  const main=button('',()=>openDetails(p),'row-main');main.setAttribute('aria-label','Details '+p.code+' '+p.title.split('\n')[0]);main.append(node('code',p.code,'code'),node('span',p.title.split('\n')[0],'row-title'),node('span',p.unit+' · '+p.system+(p.limitation_flag?' · L':''),'row-subtitle'));
  const a=p.amounts[displayContext],amount=node('div',amountText(a),'amount');amount.append(node('small',a.kind==='numeric'?'pro Quelleneinheit':'HVB offen'));
  const add=button('＋',()=>addLine(p.id),'add');add.setAttribute('aria-label','Hinzufügen '+p.code);
  row.append(fav,main,amount,add);fragment.append(row);
 }
 if(!list.length)fragment.append(node('p','Keine Treffer. Suchtext oder Filter ändern.','empty'));
 $('results').replaceChildren(fragment);$('show-more').hidden=list.length<=shown;$('show-more').textContent=`Weitere ${Math.min(60,list.length-shown)} Positionen anzeigen (${Math.min(shown,list.length)} / ${list.length})`;
}
function toggleFavorite(id){const set=new Set(workspace.favorites);if(set.has(id))set.delete(id);else set.add(id);workspace.favorites=[...set];persist();renderResults();tell(set.has(id)?'Favorit gespeichert.':'Favorit entfernt.');}
function addLine(id){
 const existing=workspace.lines.find(l=>l.id===id&&l.context===displayContext);
 if(existing){tell('Diese Position ist mit dieser Anwendung bereits enthalten. Menge in der Zusammenstellung anpassen.');return;}
 workspace.lines.push({id,context:displayContext,quantity:'1'});persist();renderPlan();tell(byId.get(id).code+' hinzugefügt · '+CONTEXTS[displayContext]+'.');
}
function renderPlan(){
 const root=$('plan-lines');root.replaceChildren();
 if(!workspace.lines.length)root.append(node('p','Positionen mit ＋ hinzufügen. Anwendung und Menge je Zeile wählen.','empty'));
 for(const line of workspace.lines){
  const p=byId.get(line.id),lineKey=key(line),a=p.amounts[line.context];
  const row=node('section',undefined,'plan-line');row.dataset.key=lineKey;
  const title=button('',()=>openDetails(p),'line-title');title.append(node('code',p.code,'code'),node('span',p.title.split('\n')[0]));
  const meta=node('p',p.system+' · Quelleneinheit: '+(p.unit||'nicht angegeben'),'line-meta');
  const controls=node('div',undefined,'line-controls'),qLabel=node('label','Menge × Quelleneinheit'),q=node('input');q.type='text';q.inputMode='decimal';q.value=drafts.get(lineKey)??line.quantity;q.setAttribute('aria-label','Menge '+p.code);q.autocomplete='off';q.maxLength=12;
  const cLabel=node('label','HVB-Anwendung'),context=node('select');context.setAttribute('aria-label','Anwendung '+p.code);for(const [value,text]of Object.entries(CONTEXTS))context.add(new Option(text.replace('HVB ',''),value));context.value=line.context;
  qLabel.append(q);cLabel.append(context);controls.append(qLabel,cLabel);
  const error=node('p',undefined,'line-error');error.id='error-'+line.id+'-'+line.context;error.hidden=true;q.setAttribute('aria-describedby',error.id);
  const footer=node('div',undefined,'line-footer'),amount=node('strong',money(lineCents(p,line.context,line.quantity)));footer.dataset.print=`${line.quantity} × ${p.unit} · ${CONTEXTS[line.context]} · `;
  const remove=button('Entfernen',()=>{workspace.lines=workspace.lines.filter(l=>key(l)!==lineKey);drafts.delete(lineKey);persist();renderPlan();tell('Zeile entfernt.');});footer.append(amount,remove);
  const refresh=()=>{
   try{quantity(q.value);q.setAttribute('aria-invalid','false');error.hidden=true;amount.textContent=money(lineCents(p,line.context,q.value));return true;}
   catch(e){q.setAttribute('aria-invalid','true');error.textContent=e.message;error.hidden=false;amount.textContent='Menge prüfen';return false;}
  };
  q.addEventListener('input',()=>{drafts.set(lineKey,q.value);if(refresh()){line.quantity=q.value;footer.dataset.print=`${line.quantity} × ${p.unit} · ${CONTEXTS[line.context]} · `;persist();}renderSummary();});
  context.addEventListener('change',()=>{
   if(workspace.lines.some(l=>l!==line&&l.id===line.id&&l.context===context.value)){context.value=line.context;tell('Diese Position ist in der anderen Anwendung schon enthalten. Getrennte Zeilen bleiben erhalten.');return;}
   const draft=drafts.get(lineKey);drafts.delete(lineKey);line.context=context.value;if(draft!==undefined)drafts.set(key(line),draft);persist();renderPlan();tell('Anwendung geändert. Der ausgewählte HVB wird neu berechnet.');
  });
  row.append(title,meta,controls,error,footer);
  if(a.kind!=='numeric')row.append(node('p',a.kind==='text'?'Original-HVB: '+a.raw+' · nicht berechenbar':'Kein numerischer HVB angegeben · nicht berechenbar','line-error'));
  root.append(row);refresh();
 }
 renderSummary();
}
function appendOriginal(root,title,text){root.append(node('h3',title),node('div',text||'Keine Angabe in dieser Zelle.','original-note'));}
function appendProvenance(root,p){
 const block=node('div',undefined,'provenance');block.append(node('h3','Quelle & Version'),node('p',catalog.edition+' · wirksam ab '+catalog.provenance.effective_date+' · publiziert '+catalog.provenance.publication_date));
 if(p)block.append(node('p',`Excel: MiGeL D, Zeile ${p.source_row} · Positionsgültigkeit: ${p.valid_from||'nicht angegeben'} · Rev.: ${p.revision||'keine Angabe'}`));
 for(const f of catalog.provenance.files){const item=node('p');item.append(link(f.file,'data/'+f.file,true),node('br'),node('span',`${f.bytes} Bytes · erfasst ${f.captured_at}`),node('br'),node('code','SHA-256: '+f.sha256));block.append(item);}
 block.append(link('Offizielle BAG-Quellenseite',catalog.provenance.source_page));root.append(block);
}
function openDetails(p){
 const root=$('detail-body');root.replaceChildren();$('detail-title').textContent=p.code;
 root.append(node('div',p.title,'original-note detail-title'),node('p',`Quelleneinheit: ${p.unit||'nicht angegeben'} · System: ${p.system}`));
 const grid=node('div',undefined,'detail-grid');
 for(const [ctx,label]of Object.entries(CONTEXTS)){const card=node('div',undefined,'detail-card');card.append(node('span',label),node('strong',amountText(p.amounts[ctx])),node('p',p.amounts[ctx].kind==='numeric'?'Pro Quelleneinheit, inkl. MWST.':'Nicht numerisch berechenbar. Nicht als Null werten.'));grid.append(card);}
 root.append(grid,node('p','Anwendungsfall, Zuordnung und alle Limitationen vor Verwendung prüfen. Die Endziffer beschreibt auch die Anwendbarkeit von Zubehör beim Kauf-/Mietsystem, nicht nur den Erwerb dieses Artikels.','caveat'));
 appendOriginal(root,'Positionslimitation'+(p.limitation_flag?' · '+p.limitation_flag:''),p.limitation);
 for(const id of p.note_ids){const n=notes.get(id);appendOriginal(root,'Gruppenhinweis '+n.code,n.title);if(n.limitation)appendOriginal(root,'Gruppenlimitation '+n.code,n.limitation);}
 const actions=node('div',undefined,'source-actions');actions.append(button('Mit aktueller HVB-Spalte hinzufügen',()=>addLine(p.id),'primary'),button('Allgemeine Originalhinweise (PDF)',()=>{ $('details').close();openSources();}));root.append(actions);
 appendProvenance(root,p);
 const raw=node('details');raw.append(node('summary','Unveränderte Excel-Zellwerte (Audit)'),node('pre',JSON.stringify(p.source_cells,null,2),'raw-cells'));root.append(raw);$('details').showModal();
}
function openNote(n){const root=$('detail-body');root.replaceChildren();$('detail-title').textContent='Originalhinweis '+n.code;appendOriginal(root,'Bezeichnung & Hinweise',n.title);if(n.limitation)appendOriginal(root,'Limitation',n.limitation);root.append(node('p',`Excel: MiGeL D, Zeile ${n.source_row} · ${catalog.edition}`));$('details').showModal();}
let prefacePromise;
async function openSources(){
 const root=$('sources-body');root.replaceChildren();$('sources').showModal();
 root.append(node('p',`${catalog.positions.length} Positionen, ${catalog.notes.length} Gruppenhinweise, ${catalog.chapters.length} Produktgruppen. Vollständiges deutsches Excel-Blatt; französische und italienische Blätter werden nicht als weitere Positionen dupliziert.`));
 root.append(node('p','Textwerte wie „Kategorie A“ sowie leere HVB bleiben offen. Auch als Text gespeicherte Zahlen werden nicht automatisch zu Rechenbeträgen. Kauf/Miete: offizielle Definition in PDF-Ziffer 4.2.','caveat'));
 const actions=node('div',undefined,'source-actions');actions.append(link('Original-PDF','data/source-migel.pdf',true),link('Original-Excel','data/source-migel.xlsx',true),link('Importbericht','data/import-report.json',true),link('Provenienz','data/provenance.json',true));root.append(actions);appendProvenance(root);
 const heading=node('h3','Allgemeine Vorbemerkungen und Definitionen · Originaltext PDF 1–18'),body=node('div','Originaltext wird geladen …','original-note');root.append(heading,body);
 try{prefacePromise??=fetch('data/preface.json').then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json();});const text=await prefacePromise;body.textContent=text.text;}
 catch{prefacePromise=undefined;body.textContent='Originaltext konnte nicht geladen werden. Bitte das gebündelte Original-PDF verwenden.';}
}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=link('',url);a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);tell(name+' heruntergeladen.');}
function renderAll(){renderResults();renderPlan();}
async function boot(){
 try{
  const response=await fetch('data/catalog.json');if(!response.ok)throw Error('HTTP '+response.status);catalog=await response.json();
  if(catalog.schema_version!==1||catalog.positions.length!==786||catalog.notes.length!==250||new Set(catalog.positions.map(p=>p.id)).size!==786)throw Error('Katalogprüfung fehlgeschlagen');
  byId=new Map(catalog.positions.map(p=>[p.id,p]));notes=new Map(catalog.notes.map(n=>[n.id,n]));index=searchIndex(catalog);workspace=readStorage();
  for(const c of catalog.chapters)$('chapter-select').add(new Option(c.code+' · '+c.title,c.code));
  updateCategories();renderChapters();renderAll();$('workspace').setAttribute('aria-busy','false');
  for(const id of ['search','chapter-select','category','system'])$(id).disabled=false;
  tell(`${catalog.positions.length} offizielle Positionen geladen · Ausgabe 01.07.2026 · lokal, ohne Konto.`);
  $('search').addEventListener('input',()=>{filters.query=$('search').value;shown=60;renderResults();});
  $('chapter-select').addEventListener('change',()=>chooseChapter($('chapter-select').value));
  for(const id of ['category','system'])$(id).addEventListener('change',()=>{filters[id]=$(id).value;shown=60;renderResults();});
  $('favorites-only').addEventListener('change',()=>{filters.favoritesOnly=$('favorites-only').checked;shown=60;renderResults();});
  $('display-context').addEventListener('change',()=>{displayContext=$('display-context').value;renderResults();tell('HVB-Spalte und Anwendung für neue Zeilen: '+CONTEXTS[displayContext]+'. Bestehende Zeilen bleiben unverändert.');});
  $('show-more').addEventListener('click',()=>{shown+=60;renderResults();});
  $('clear-filters').addEventListener('click',()=>{filters={query:'',chapter:'',category:'',system:'',favoritesOnly:false};$('search').value='';$('chapter-select').value='';$('system').value='';$('favorites-only').checked=false;shown=60;updateCategories();renderChapters();renderResults();});
  $('source-info').addEventListener('click',openSources);
  $('source-info-bottom').addEventListener('click',openSources);
  $('source-info-mobile').addEventListener('click',openSources);
  $('export-json').addEventListener('click',()=>{if(invalidDraft())return;download('migel-zusammenstellung.json',JSON.stringify(workspace,null,2)+'\n','application/json');});
  $('export-csv').addEventListener('click',()=>{if(invalidDraft())return;download('migel-zusammenstellung.csv',planCsv(workspace,catalog),'text/csv;charset=utf-8');});
  $('print').addEventListener('click',()=>{if(!invalidDraft())window.print();});
  $('clear-plan').addEventListener('click',()=>{if(workspace.lines.length&&confirm('Alle Zeilen dieser Zusammenstellung entfernen? Favoriten bleiben erhalten.')){workspace.lines=[];drafts.clear();persist();renderPlan();tell('Zusammenstellung geleert.');}});
  $('import-json').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async()=>{
   const revision=++importRevision,file=$('import-file').files[0];$('import-file').value='';pendingImport=null;if(!file)return;
   try{if(file.size>2000000)throw Error('Datei grösser als 2 MB.');const text=await file.text();if(revision!==importRevision)return;const candidate=validateWorkspace(JSON.parse(text),catalog);pendingImport=candidate;$('import-summary').textContent=`Vollständig geprüft: ${candidate.lines.length} Zeilen und ${candidate.favorites.length} Favoriten · ${catalog.edition}.`;$('import-preview').showModal();}
   catch(e){if(revision===importRevision)tell('Import abgelehnt. Bestehende Zusammenstellung unverändert. '+e.message);}
  });
  $('apply-import').addEventListener('click',()=>{if(!pendingImport)return;const candidate=validateWorkspace(pendingImport,catalog);if(!persist(candidate)){const message='Import nicht übernommen. Aktuelle Zusammenstellung und Mengenentwürfe bleiben erhalten. JSON sichern und Speicherwarnung beachten.';$('import-summary').textContent=message;tell(message);return;}workspace=candidate;pendingImport=null;drafts.clear();renderAll();$('import-preview').close();tell('Geprüfte Sicherung übernommen.');});
  $('import-preview').addEventListener('close',()=>{pendingImport=null;});
  $('reset-storage').addEventListener('click',()=>{if(confirm('Nur den lokalen MiGeL-Speicher zurücksetzen und durch diese aktuelle Sitzung ersetzen? Andere Anwendungen bleiben unverändert.')){try{const raw=JSON.stringify(workspace);localStorage.setItem(STORAGE_KEY,raw);storedRaw=raw;storageOK=true;$('storage-warning').hidden=true;$('storage-state').textContent='Nur in diesem Browser gespeichert. Keine Patientendaten eingeben. JSON regelmässig sichern.';tell('Lokaler MiGeL-Speicher wieder nutzbar.');}catch{storageWarning('Lokaler Speicher weiterhin blockiert. Bitte JSON sichern.');}}});
  window.addEventListener('storage',event=>{
   if(event.key!==STORAGE_KEY&&event.key!==null)return;
   importRevision++;
   pendingImport=null;if($('import-preview').open)$('import-preview').close();
   storageWarning('Eine andere Registerkarte hat den MiGeL-Speicher geändert oder gelöscht. Aktuelle Zusammenstellung und Entwürfe bleiben erhalten; Speichern ist pausiert. Arbeit als JSON sichern und neu laden.');
  });
 }catch(e){$('workspace').setAttribute('aria-busy','false');tell('Katalog nicht verfügbar. Keine Ersatz- oder Beispieldaten geladen. '+e.message+' · Bitte Seite neu laden oder Originaldateien unten verwenden.');}
}
for(const close of document.querySelectorAll('dialog .close'))close.addEventListener('click',()=>close.closest('dialog').close());
boot();
