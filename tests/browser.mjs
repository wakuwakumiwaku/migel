import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createAppServer} from '../scripts/serve.mjs';
import {STORAGE_KEY} from '../src/domain.js';
if(!process.env.PLAYWRIGHT_MODULE||!process.env.BROWSER_EXECUTABLE)throw Error('Set PLAYWRIGHT_MODULE (playwright-core index.mjs) and BROWSER_EXECUTABLE (Firefox-compatible binary).');
const {firefox}=await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
const catalog=JSON.parse(await readFile('public/data/catalog.json','utf8'));
const evidence=path.resolve('.local/browser');await mkdir(evidence,{recursive:true});
const report={checks:[],errors:[],screenshots:[],viewports:[],downloads:[],request_failures:[]};
const check=(name,value=true)=>{assert.ok(value,name);report.checks.push(name);};
const server=createAppServer({basePath:'/migel/'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url='http://127.0.0.1:'+server.address().port+'/migel/';
let browser;
function observe(p){p.on('pageerror',e=>report.errors.push(e.message));p.on('console',msg=>{if(msg.type()==='error')report.errors.push(msg.text());});p.on('requestfailed',r=>report.request_failures.push({url:r.url(),failure:r.failure()}));}
try{
 browser=await firefox.launch({executablePath:process.env.BROWSER_EXECUTABLE,headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();observe(page);
 await page.goto(url);await page.waitForFunction(()=>document.getElementById('search').disabled===false);
 check('Bundled official catalog auto-loads without import', (await page.locator('#results-count').textContent()).includes('786 offizielle Positionen'));
 check('Initial batch is 60 real records',await page.locator('.result-row').count()===60);
 const expectedNav=[['DENTOTAR','https://wakuwakumiwaku.github.io/dentotar/',null],['MiGeL','https://wakuwakumiwaku.github.io/migel/','page'],['Spezialitätenliste','https://wakuwakumiwaku.github.io/spezialitaetenliste/',null]];
 assert.deepEqual(await page.locator('nav[aria-label="Kataloge"] a').evaluateAll(es=>es.map(a=>[a.textContent.trim(),a.href,a.getAttribute('aria-current')])),expectedNav);
 check('All three full catalog URLs are present with exactly MiGeL current');
 // Keep these tests local: verify trusted native activation, not deployment of sibling websites.
 await page.evaluate(()=>{window.navActivations=[];window.captureNav=e=>{const a=e.target.closest('.catalog-switch a');if(a){e.preventDefault();window.navActivations.push({href:a.href,trusted:e.isTrusted});}};document.addEventListener('click',window.captureNav,true);});
 await page.locator('.repository').focus();
 for(let i=0;i<3;i++){await page.keyboard.press('Tab');check('Keyboard catalog focus '+i,await page.locator('.catalog-switch a').nth(i).evaluate(e=>e===document.activeElement));await page.keyboard.press('Enter');}
 for(let i=0;i<3;i++)await page.locator('.catalog-switch a').nth(i).click();
 const activations=await page.evaluate(()=>window.navActivations);assert.deepEqual(activations.map(x=>x.href),[...expectedNav,...expectedNav].map(x=>x[1]));check('Native Enter and pointer activate all three links without new tabs',activations.every(x=>x.trusted)&&context.pages().length===1);
 await page.evaluate(()=>document.removeEventListener('click',window.captureNav,true));
 const fonts=await page.evaluate(()=>Object.fromEntries(['.row-title','.code','.amount','#search','#display-context'].map(selector=>[selector,parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));check('Readable title/form/code/amount sizes',fonts['.row-title']===17&&fonts['.code']===15&&fonts['.amount']===18&&fonts['#search']===17&&fonts['#display-context']===17);report.fonts=fonts;
 report.contrast=await page.evaluate(()=>{
  const css=s=>getComputedStyle(document.querySelector(s)),lum=color=>{const channels=color.match(/[\d.]+/g).slice(0,3).map(n=>{const c=Number(n)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});return .2126*channels[0]+.7152*channels[1]+.0722*channels[2];},ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const pairs=[['body text',css('body').color,css('html').backgroundColor,4.5],['field text',css('#search').color,css('#search').backgroundColor,4.5],['field border',css('#search').borderTopColor,css('#search').backgroundColor,3],['result divider',css('.result-row').borderBottomColor,css('#results').backgroundColor,3],['active catalog text',css('.catalog-switch [aria-current]').color,css('.catalog-switch [aria-current]').backgroundColor,4.5],['active catalog border',css('.catalog-switch [aria-current]').borderTopColor,css('.catalog-switch [aria-current]').backgroundColor,3]];
  return pairs.map(([name,foreground,background,minimum])=>({name,foreground,background,minimum,ratio:ratio(foreground,background)}));
 });check('Computed text/field/divider/active navigation contrast meets the tested thresholds',report.contrast.every(x=>x.ratio>=x.minimum));
 await page.locator('#show-more').click();check('Incremental rendering shows 120',await page.locator('.result-row').count()===120);
 while(await page.locator('#show-more').isVisible())await page.locator('#show-more').click();
 assert.deepEqual(await page.locator('.result-row').evaluateAll(es=>es.map(e=>e.dataset.id)),catalog.positions.map(p=>p.id));check('Load more exposes all 786 real positions in exact source order');
 await page.locator('#search').fill('Hoergeraete');await page.waitForTimeout(120);check('Umlaut-tolerant search',await page.locator('.result-row').count()>0);
 await page.locator('#clear-filters').click();await page.locator('#chapter-select').selectOption('01');await page.locator('#category').selectOption('01.01');
 check('Source category filters to exact five Milchpumpen positions',await page.locator('.result-row').count()===5);
 await page.locator('#clear-filters').click();await page.locator('#chapter-select').selectOption('26');await page.locator('#category').selectOption('26.01');check('Source category without a title is preserved and filterable',await page.locator('.result-row').count()===9);
 await page.locator('#clear-filters').click();await page.locator('#search').fill('35.06.08.01.1');await page.locator('[data-id="D904"] .row-main').click();const reconciled=catalog.notes.find(n=>n.id==='D902');check('Reconciled source hierarchy retains full exact-prefix group note',(await page.locator('#detail-body').textContent()).includes(reconciled.title));await page.locator('#details .close').click();
 await page.locator('#clear-filters').click();await page.locator('#chapter-select').selectOption('01');await page.locator('#category').selectOption('01.01');
 await page.locator('[data-id="D4"] .row-main').click();
 const p=catalog.positions.find(p=>p.id==='D4');
 for(const id of p.note_ids){const n=catalog.notes.find(n=>n.id===id);check('Full group note '+n.code,(await page.locator('#detail-body').textContent()).includes(n.title));if(n.limitation)check('Full group limitation '+n.code,(await page.locator('#detail-body').textContent()).includes(n.limitation));}
 check('Exact full position limitation',(await page.locator('#detail-body').textContent()).includes(p.limitation));
 check('Original note typography is at least 16px',await page.locator('#detail-body .original-note').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
 check('Version, row and downloadable sources visible',(await page.locator('#detail-body').textContent()).includes('Zeile 4')&&await page.locator('#detail-body a[download]').count()===2);
 await page.screenshot({path:path.join(evidence,'details-1440.png')});report.screenshots.push('details-1440.png');
 await page.locator('#details .close').click();
 await page.locator('[data-id="D4"] .favorite').click();await page.locator('#favorites-only').check();check('Favorites filter',await page.locator('.result-row').count()===1);await page.locator('#favorites-only').uncheck();
 await page.locator('[data-id="D4"] .add').click();const q=page.locator('.plan-line[data-key="D4|self"] input');await q.fill('2');check('Exact purchase total 2 × 47.17',(await page.locator('#total').textContent())==='CHF 94.34');
 await page.locator('#display-context').selectOption('care');await page.locator('[data-id="D7"] .add').click();await page.locator('.plan-line[data-key="D7|care"] input').fill('3');
 check('Rental days and care context remain distinct',(await page.locator('#total').textContent())==='CHF 100.94');
 check('Rental source unit is displayed',(await page.locator('.plan-line[data-key="D7|care"]').textContent()).includes('Miete / Tag'));
 await q.fill('0');check('Invalid quantity pauses totals and disables exports',await page.locator('#total').textContent()==='—'&&await page.locator('#export-json').isDisabled());await q.fill('2');
 await page.locator('#clear-filters').click();await page.locator('#search').fill('03.06.01.00.1');await page.locator('[data-id="D29"] .add').click();
 check('Category A is unresolved; subtotal is explicitly incomplete',(await page.locator('#total-label').textContent()).includes('unvollständig')&&(await page.locator('#unknown-warning').textContent()).includes('1 Zeile'));
 check('Unknown amount not zero-filled',await page.locator('#total').textContent()==='CHF 100.94');
 const exportOne=async(id,name)=>{const promise=page.waitForEvent('download');await page.locator('#'+id).click();const d=await promise;await d.saveAs(path.join(evidence,name));report.downloads.push({name,suggested:d.suggestedFilename()});return await readFile(path.join(evidence,name),'utf8');};
 const json=await exportOne('export-json','export.json');const csv=await exportOne('export-csv','export.csv');
 check('Native JSON download contains all three lines and favorites',JSON.parse(json).lines.length===3&&JSON.parse(json).favorites.includes('D4'));
 check('Native CSV download contains source notes and unresolved markers',csv.includes('OFFEN')&&csv.includes('UNVOLLSTÄNDIGE')&&csv.includes('Frühgeborenen'));
 const before=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"lines":[]}')});
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Import abgelehnt'));
 check('Bad import does not overwrite saved state',await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)===before);
 const partial=JSON.parse(json);partial.lines.push({id:'NONEXISTENT',context:'self',quantity:'1'});
 await page.locator('#import-file').setInputFiles({name:'partial.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(partial))});
 await page.waitForTimeout(100);check('Later invalid row refuses whole import',await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)===before);
 await page.evaluate(()=>{window.__importStatusChanges=0;new MutationObserver(()=>window.__importStatusChanges++).observe(document.getElementById('status'),{childList:true,characterData:true,subtree:true});});
 for(const malformedContext of [['self'],['care'],[['self']],[[['care']]]]){
  const malformed=JSON.parse(json);malformed.lines[1].context=malformedContext;
  const observed=await page.evaluate(()=>window.__importStatusChanges);
  await page.locator('#import-file').setInputFiles({name:'invalid-context.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  await page.waitForFunction(n=>window.__importStatusChanges>n||document.getElementById('import-preview').open,observed);
  check('Malformed application type rejected before preview '+JSON.stringify(malformedContext),!await page.locator('#import-preview').evaluate(d=>d.open)&&(await page.locator('#status').textContent()).includes('Import abgelehnt')&&await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)===before&&await page.locator('.plan-line').count()===3);
 }
 await page.locator('#import-file').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(json)});await page.locator('#apply-import').waitFor({state:'visible'});await page.locator('#apply-import').click();
 check('Valid JSON native setInputFiles round trip',await page.locator('.plan-line').count()===3);
 await page.reload();await page.waitForFunction(()=>!document.getElementById('search').disabled);
 check('Reload automatically loads full catalog and persisted workspace',await page.locator('.plan-line').count()===3&&await page.locator('#total').textContent()==='CHF 100.94'&&(await page.locator('#results-count').textContent()).includes('786 offizielle'));
 // Actual context control changes a row's HVB, never blends application types.
 await page.locator('.plan-line[data-key="D4|self"] select').selectOption('care');check('Context switch recalculates from care HVB',await page.locator('#total').textContent()==='CHF 96.24');
 await page.locator('.plan-line[data-key="D4|care"] select').selectOption('self');
 const other=await context.newPage();observe(other);await other.goto(url);await other.waitForFunction(()=>!document.getElementById('search').disabled);
 await other.locator('.plan-line[data-key="D4|self"] input').fill('');
 await other.evaluate(()=>{window.__peerStorageSeen=false;window.addEventListener('storage',()=>{window.__peerStorageSeen=true;},{once:true});});
 await page.locator('.plan-line[data-key="D4|self"] input').fill('3');await other.waitForFunction(()=>window.__peerStorageSeen);
 check('A real cross-tab update pauses writes without replacing an unfinished quantity draft',await other.locator('#storage-warning').isVisible()&&await other.locator('.plan-line[data-key="D4|self"] input').inputValue()===''&&await other.locator('#export-json').isDisabled());
 const foreignRaw=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);
 await other.locator('.plan-line[data-key="D4|self"] input').fill('4');
 check('Paused tab retains corrected in-memory work without overwriting the foreign raw state',await other.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)===foreignRaw&&await other.locator('.plan-line[data-key="D4|self"] input').inputValue()==='4');
 await other.reload();await other.waitForFunction(()=>!document.getElementById('search').disabled);
 check('Explicit reload freshly hydrates the validated other-tab state',await other.locator('.plan-line[data-key="D4|self"] input').inputValue()==='3');
 await page.locator('.plan-line[data-key="D4|self"] input').fill('2');await other.close();
 await page.locator('#clear-filters').click();
 // Input remains synchronous; immediately changing category/reset cannot revive stale search work.
 await page.locator('#search').pressSequentially('Milch');await page.locator('#chapter-select').selectOption('01');await page.locator('#category').selectOption('01.01');
 check('Typing immediately followed by category keeps the current query and exact source rows',await page.locator('#search').inputValue()==='Milch'&&await page.locator('.result-row').count()===5);
 await page.locator('#clear-filters').click();await page.waitForTimeout(150);check('Immediate reset remains reset with no delayed search reversion',await page.locator('#search').inputValue()===''&&await page.locator('.result-row').count()===60&&(await page.locator('#results-count').textContent()).startsWith('786 Treffer'));
 for(const width of [1440,1024,390,320]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);
  await page.evaluate(()=>scrollTo(0,0));
  const navGeometry=await page.locator('.catalog-switch').evaluate(nav=>({position:getComputedStyle(nav).position,links:[...nav.querySelectorAll('a')].map(a=>{const r=a.getBoundingClientRect();return {href:a.href,width:r.width,height:r.height,visible:r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,hit:a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),target:a.target};})}));
  report.viewports.push({width,navigation:navGeometry});check('Visible nonsticky catalog links, 44px targets and no overlap at '+width,navGeometry.position!=='sticky'&&navGeometry.position!=='fixed'&&navGeometry.links.every(a=>a.width>=44&&a.height>=44&&a.visible&&a.hit&&a.target!== '_blank'));
  const geometry=await page.evaluate(()=>{const p=document.getElementById('plan');return {width:innerWidth,document:document.documentElement.scrollWidth,plan:p.clientWidth,planScroll:p.scrollWidth,overflows:[...document.querySelectorAll('.plan-line,.line-controls,.line-controls input,.line-controls select')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({class:e.className,tag:e.tagName,client:e.clientWidth,scroll:e.scrollWidth}))};});
  report.viewports.push(geometry);check('No document or internal plan overflow at '+width,geometry.document===width&&geometry.planScroll<=geometry.plan+1&&geometry.overflows.length===0);
  if(width>=800)check('Quantity and context inputs align despite wrapping labels at '+width,await page.locator('.line-controls').evaluateAll(es=>es.every(e=>Math.abs(e.querySelector('input').getBoundingClientRect().bottom-e.querySelector('select').getBoundingClientRect().bottom)<=1)));
  await page.screenshot({path:path.join(evidence,'workspace-'+width+'.png'),fullPage:true});report.screenshots.push('workspace-'+width+'.png');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(evidence,'viewport-'+width+'.png')});report.screenshots.push('viewport-'+width+'.png');
  await page.locator('.result-row').nth(12).scrollIntoViewIfNeeded();const scrolledRow=await page.locator('.result-row').nth(12).evaluate(e=>{const b=e.querySelector('.row-main'),r=b.getBoundingClientRect();return {id:e.dataset.id,hit:b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),font:parseFloat(getComputedStyle(e.querySelector('.row-title')).fontSize)};});check('Real result remains readable and clickable after scrolling at '+width,scrolledRow.id===catalog.positions[12].id&&scrolledRow.hit&&scrolledRow.font===17);await page.screenshot({path:path.join(evidence,'results-scrolled-'+width+'.png')});report.screenshots.push('results-scrolled-'+width+'.png');
  await page.locator('.plan-line').first().scrollIntoViewIfNeeded();const planHit=await page.locator('.plan-line input').first().evaluate(e=>{const r=e.getBoundingClientRect();return e===document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);});check('Real plan quantity is reachable after scrolling at '+width,planHit);await page.screenshot({path:path.join(evidence,'plan-scrolled-'+width+'.png')});report.screenshots.push('plan-scrolled-'+width+'.png');
  if(width<800){await page.locator('.mobile-tabs a[href="#plan-title"]').click();check('Mobile plan is directly reachable at '+width,await page.locator('#plan-title').evaluate(e=>e.getBoundingClientRect().top>=40&&e.getBoundingClientRect().top<150));await page.screenshot({path:path.join(evidence,'plan-'+width+'.png')});report.screenshots.push('plan-'+width+'.png');await page.locator('.mobile-tabs a[href="#catalog-title"]').click();}
 }
 await page.locator('#source-info-mobile').click();await page.waitForFunction(()=>document.querySelector('#sources-body .original-note').textContent.includes('Allgemeine Vorbemerkungen'));
 check('Original preface is accessible on mobile',(await page.locator('#sources-body').textContent()).includes('Ziffer 1 = Kauf, 2 = Miete, 3 = Kauf und Miete.'));
 const dialogGeometry=await page.locator('#sources').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));check('Source notes modal has no horizontal overflow',dialogGeometry.scroll<=dialogGeometry.width+1);await page.locator('#sources .close').click();
 await page.emulateMedia({media:'print'});check('Print view hides catalog and retains plan',!(await page.locator('.catalog').isVisible())&&await page.locator('#plan').isVisible()&&await page.locator('.print-source').isVisible());await page.emulateMedia({media:'screen'});
 const preserved=await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY);const sync=await context.newPage();observe(sync);await sync.goto(url);await sync.waitForFunction(()=>!document.getElementById('search').disabled);
 await sync.evaluate(k=>localStorage.setItem(k,'{bad incoming'),STORAGE_KEY);await page.locator('#storage-warning').waitFor({state:'visible'});check('Malformed cross-tab storage does not replace current plan',await page.locator('.plan-line').count()===3);
 await page.locator('.plan-line[data-key="D4|self"] input').fill('4');check('Malformed cross-tab storage suspends subsequent writes',await page.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)==='{bad incoming');
 await sync.evaluate(({key,value})=>localStorage.setItem(key,value),{key:STORAGE_KEY,value:preserved});
 check('Later valid external state does not silently replace paused in-memory work',await page.locator('.plan-line[data-key="D4|self"] input').inputValue()==='4');
 await sync.evaluate(()=>localStorage.clear());await page.waitForFunction(()=>localStorage.getItem('migel.workspace.v1')===null);
 check('External storage clear preserves the current three-line plan and corrected quantity',await page.locator('.plan-line').count()===3&&await page.locator('.plan-line[data-key="D4|self"] input').inputValue()==='4');
 await sync.close();
 await context.close();
 // Separate owned contexts for corruption/blocked storage; no shared browser/profile.
 const badContext=await browser.newContext();await badContext.addInitScript(({key})=>{localStorage.setItem(key,'{broken');},{key:STORAGE_KEY});const bad=await badContext.newPage();observe(bad);await bad.goto(url);await bad.waitForFunction(()=>!document.getElementById('search').disabled);check('Corrupt storage leaves app usable and warning visible',await bad.locator('#storage-warning').isVisible());await bad.locator('[data-id="D4"] .add').click();check('Corrupt stored bytes are not overwritten',await bad.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)==='{broken');await badContext.close();
 const driftContext=await browser.newContext();const drift=await driftContext.newPage();observe(drift);await drift.goto(url);await drift.waitForFunction(()=>!document.getElementById('search').disabled);await drift.locator('[data-id="D4"] .add').click();
 const driftRaw=await drift.evaluate(k=>{const incoming=JSON.parse(localStorage.getItem(k));incoming.lines[0].quantity='5';const raw=JSON.stringify(incoming);localStorage.setItem(k,raw);return raw;},STORAGE_KEY);
 await drift.locator('.plan-line[data-key="D4|self"] input').fill('2');
 check('Unnotified raw-storage drift is checked before writing; foreign bytes and own in-memory edit both survive',await drift.evaluate(k=>localStorage.getItem(k),STORAGE_KEY)===driftRaw&&await drift.locator('#storage-warning').isVisible()&&await drift.locator('.plan-line input').inputValue()==='2');await driftContext.close();
 const blockedContext=await browser.newContext();await blockedContext.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});});const blocked=await blockedContext.newPage();observe(blocked);await blocked.goto(url);await blocked.waitForFunction(()=>!document.getElementById('search').disabled);await blocked.locator('[data-id="D4"] .add').click();check('Blocked storage still supports in-memory calculations',await blocked.locator('#total').textContent()==='CHF 47.17'&&await blocked.locator('#storage-warning').isVisible());await blockedContext.close();
 report.importRefusals=[];
 for(const mode of ['protected','drift','read-denied','write-denied','healthy']){
  const isolated=await browser.newContext(),p=await isolated.newPage();observe(p);
  await p.goto(url);await p.waitForFunction(()=>!document.getElementById('search').disabled);
  const current={...JSON.parse(json),lines:[{id:'D4',context:'self',quantity:'2'}],favorites:['D4']};
  const incoming={...current,lines:[{id:'D7',context:'care',quantity:'3'}],favorites:['D7']};
  await p.evaluate(({key,current})=>{localStorage.setItem(key,JSON.stringify(current));localStorage.setItem('physiotherapie.workspace.v1','synthetic foreign namespace Ω');},{key:STORAGE_KEY,current});
  await p.reload();await p.waitForFunction(()=>!document.getElementById('search').disabled);
  await p.locator('.plan-line input').fill('');
  const expectedView=await p.locator('.plan-line').evaluateAll(es=>es.map(e=>({key:e.dataset.key,quantity:e.querySelector('input').value})));
  await p.locator('#import-file').setInputFiles({name:'synthetic-replacement.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
  await p.locator('#import-preview[open]').waitFor();
  let expectedRaw=JSON.stringify(current);
  if(mode==='protected'||mode==='drift'){
   const foreign={...current,lines:[{id:'D4',context:'self',quantity:'8'}]};expectedRaw=JSON.stringify(foreign);
   const writer=mode==='protected'?await isolated.newPage():p;
   if(writer!==p){observe(writer);await writer.goto(url);await writer.waitForFunction(()=>!document.getElementById('search').disabled);}
   await writer.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:STORAGE_KEY,raw:expectedRaw});
   if(writer!==p){await p.locator('#storage-warning').waitFor({state:'visible'});await writer.close();
    // A real foreign event dismisses stale previews; a fresh explicit preview must still refuse to erase current work.
    await p.locator('#import-file').setInputFiles({name:'synthetic-after-protection.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});await p.locator('#import-preview[open]').waitFor();}
  }
  await p.evaluate(({key,mode})=>{
   const get=Storage.prototype.getItem,set=Storage.prototype.setItem;window.__readImportRaw=()=>get.call(localStorage,key);window.__importBoundaryCalls=0;
   Storage.prototype.getItem=function(k){if(this===localStorage&&k===key&&mode==='read-denied'){window.__importBoundaryCalls++;throw new DOMException('Synthetic read refusal','SecurityError');}return get.call(this,k);};
   Storage.prototype.setItem=function(k,v){if(this===localStorage&&k===key&&mode==='write-denied'){window.__importBoundaryCalls++;throw new DOMException('Synthetic write refusal','QuotaExceededError');}return set.call(this,k,v);};
  },{key:STORAGE_KEY,mode});
  await p.locator('#apply-import').click();
  const observed=await p.evaluate(()=>({raw:window.__readImportRaw(),boundaryCalls:window.__importBoundaryCalls,view:[...document.querySelectorAll('.plan-line')].map(e=>({key:e.dataset.key,quantity:e.querySelector('input').value})),total:document.getElementById('total').textContent,exportDisabled:document.getElementById('export-json').disabled,status:document.getElementById('status').textContent,preview:document.getElementById('import-preview').open,favorite:document.querySelector('[data-id="D4"] .favorite').getAttribute('aria-pressed'),foreign:localStorage.getItem('physiotherapie.workspace.v1')}));
  observed.importSummary=await p.locator('#import-summary').textContent();observed.importMessageVisible=await p.locator('#import-summary').isVisible();
  report.importRefusals.push({mode,expectedView,expectedRaw,incoming,observed});
  if(observed.preview)await p.locator('#import-preview .close').click();
  if(mode==='healthy'){await p.reload();await p.waitForFunction(()=>!document.getElementById('search').disabled);assert.equal(await p.locator('.plan-line input').inputValue(),'3');}
  await isolated.close();
 }
 for(const {mode,expectedView,expectedRaw,incoming,observed}of report.importRefusals){
  if(mode==='healthy'){
   assert.deepEqual(JSON.parse(observed.raw),incoming);assert.deepEqual(observed.view,[{key:'D7|care',quantity:'3'}]);assert.equal(observed.preview,false);check('Healthy explicit import still replaces and persists the candidate');continue;
  }
  assert.deepEqual(observed.view,expectedView,mode+': refused import must preserve the current plan and unfinished quantity draft');
  assert.equal(observed.raw,expectedRaw,mode+': protected raw bytes must survive');
  assert.equal(observed.total,'—');assert.equal(observed.exportDisabled,true);assert.equal(observed.favorite,'true');
  assert.equal(observed.preview,true,mode+': refusal leaves the candidate cancelable');assert.ok(observed.status.startsWith('Import nicht übernommen.'),mode+': do not announce import success');
  assert.equal(observed.importSummary,observed.status,mode+': show the refusal inside the active modal, not only behind it');assert.equal(observed.importMessageVisible,true);
  assert.equal(observed.foreign,'synthetic foreign namespace Ω');
  if(mode.endsWith('denied'))assert.ok(observed.boundaryCalls>0,mode+': injected native boundary actually reached');
  check('Failed import preserves current plan, draft, favorites and raw storage: '+mode);
 }
 check('No page/console errors',report.errors.length===0);check('No failed requests',report.request_failures.length===0);report.success=true;
}catch(error){report.success=false;report.failure=error.stack;throw error;}
finally{await writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');if(browser)await browser.close();await new Promise(r=>server.close(r));console.log(JSON.stringify(report,null,2));}
