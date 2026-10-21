#!/usr/bin/env python3
"""Reproducible MiGeL D importer (Python standard library + Poppler pdftotext)."""
from pathlib import Path
import argparse, collections, datetime, decimal, hashlib, json, re, subprocess, zipfile
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
CODE=re.compile(r'\d{2}\.\d{2}\.\d{2}\.\d{2}\.([123])\s*\Z')
EXPECTED_HEADERS={'H':'Positions-Nr.','J':'Bezeichnung','K':'Limitation','L':'Menge / Einheit','M':'HVB Selbstanwendung','N':'HVB Pflege'}

def sheets(path):
 with zipfile.ZipFile(path) as z:
  ss=[''.join(t.text or '' for t in x.iter('{'+NS['m']+'}t')) for x in ET.fromstring(z.read('xl/sharedStrings.xml'))]
  styles=[int(x.get('numFmtId')) for x in ET.fromstring(z.read('xl/styles.xml')).findall('m:cellXfs/m:xf',NS)]
  result=[]
  for idx,sheet in enumerate(ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet',NS),1):
   rows=[]
   for row in ET.fromstring(z.read(f'xl/worksheets/sheet{idx}.xml')).findall('m:sheetData/m:row',NS):
    cells={}
    for c in row.findall('m:c',NS):
     v=c.findtext('m:v',default='',namespaces=NS); typ=c.get('t','n')
     if typ=='s': value=ss[int(v)] if v else ''
     elif typ=='inlineStr': value=''.join(c.find('m:is',NS).itertext())
     else: value=v
     if value!='': cells[re.sub(r'\d+$','',c.get('r'))]={'value':value,'type':typ,'format':styles[int(c.get('s','0'))]}
    rows.append({'row':int(row.get('r')),'cells':cells})
   result.append({'name':sheet.get('name'),'rows':rows})
  return result

def amount(cell):
 if not cell or not cell['value'].strip(): return {'kind':'missing','raw':cell['value'] if cell else ''}
 if cell['type']!='n': return {'kind':'text','raw':cell['value']}
 # XLSX XML carries floating serialization artifacts; the official cell format is two decimals.
 if cell['format']!=43: raise ValueError('Unexpected amount number format: '+repr(cell))
 d=decimal.Decimal(cell['value'])
 if not d.is_finite() or d<0: raise ValueError('Invalid numeric HVB')
 return {'kind':'numeric','raw':cell['value'],'decimal':str(d.quantize(decimal.Decimal('0.01'),rounding=decimal.ROUND_HALF_UP)),'number_format':43}

def compile_catalog(manifest,workbook):
 german=next(s for s in workbook if s['name']=='MiGeL D')
 def val(row,col): return row['cells'].get(col,{}).get('value','')
 for k,v in EXPECTED_HEADERS.items():
  if val(german['rows'][0],k)!=v: raise ValueError('Unexpected column '+k)
 positions=[]; notes=[]; blanks=[]; seen=set(); known={}
 for row in german['rows'][1:]:
  cells=row['cells']; code=val(row,'H'); title=val(row,'J'); hierarchy=[val(row,k) for k in 'ABCDEFG' if val(row,k).strip()]
  if code.strip():
   match=CODE.fullmatch(code)
   if not match or code in seen: raise ValueError('Invalid/duplicate literal source code: '+repr(code))
   seen.add(code)
   if not title or not hierarchy: raise ValueError('Missing position metadata')
   applicable=[]
   for h in hierarchy:
    # Some source hierarchy values have no separate heading row. Preserve them,
    # but never fabricate a title or note for such a value.
    if h in known: applicable.append(known[h])
   # Independently retain an exact literal position-prefix heading. This covers
   # D904's source C-cell '35.06.08.' without repairing that original token.
   applicable=[n['id'] for n in notes if n['id'] in applicable or code.startswith(n['code']+'.')]
   date=val(row,'O')
   if date and cells['O']['type']=='n': date=(datetime.date(1899,12,30)+datetime.timedelta(days=int(date))).isoformat()
   positions.append(dict(id='D'+str(row['row']),code=code,title=title,unit=val(row,'L'),limitation=val(row,'K'),limitation_flag=val(row,'I'),chapter=hierarchy[0],hierarchy=hierarchy,note_ids=applicable,system={'1':'Kauf','2':'Miete','3':'Kauf und Miete'}[match[1]],amounts={'self':amount(cells.get('M')),'care':amount(cells.get('N'))},valid_from=date,revision=val(row,'P'),source_row=row['row'],source_cells=cells))
  elif title:
   if not hierarchy: raise ValueError('Unscoped note')
   note=dict(id='D'+str(row['row']),code=hierarchy[-1],title=title,limitation=val(row,'K'),level=len(hierarchy),source_row=row['row'],source_cells=cells)
   if note['code'] in known: raise ValueError('Duplicate note code')
   notes.append(note); known[note['code']]=note['id']
  elif any(v['value'].strip() for v in cells.values()): raise ValueError('Unclassified nonempty row: '+str(row['row']))
  else: blanks.append(row['row'])
 chapters=[dict(code=n['code'],title=n['title'].split('\n')[0],note_id=n['id'],count=sum(p['chapter']==n['code'] for p in positions)) for n in notes if n['level']==1]
 reports={}
 for sheet in workbook:
  rows=sheet['rows'][1:]; codes=[val(r,'H') for r in rows if val(r,'H').strip()]
  reports[sheet['name']]={'source_rows':len(rows),'position_count':len(codes),'unique_literal_codes':len(set(codes))}
 amounts={ctx:dict(collections.Counter(p['amounts'][ctx]['kind'] for p in positions)) for ctx in ['self','care']}
 report=dict(schema_version=1,position_count=len(positions),note_count=len(notes),chapter_count=len(chapters),blank_rows=blanks,classifications_total=len(positions)+len(notes)+len(blanks),sheets=reports,selected_sheet='MiGeL D',excluded_languages=['MiGeL F','MiGeL I'],hierarchy_without_heading=sorted({h for p in positions for h in p['hierarchy'] if h not in known}),prefix_heading_links=[{'position_id':p['id'],'note_id':n['id'],'method':'exact literal position prefix'} for p in positions for n in notes if n['id'] in p['note_ids'] and n['code'] not in p['hierarchy']],amount_types=amounts,literal_code_whitespace=[{'id':p['id'],'code':p['code']} for p in positions if p['code']!=p['code'].strip()],text_amounts=[{'id':p['id'],'code':p['code'],'context':ctx,'raw':p['amounts'][ctx]['raw']} for p in positions for ctx in ['self','care'] if p['amounts'][ctx]['kind']=='text'],system_counts=dict(collections.Counter(p['system'] for p in positions)),rules=['Canonical code is column H, never cached sorting formula Q.','Source code whitespace is preserved; id is source sheet row.','Numeric cells use official two-decimal Excel number format 43; raw XML value retained.','Text-looking numbers stay text/unresolved; missing cells are never zero.','System labels follow official PDF section 4.2 (last digit), not product names.','No eligibility, period, frequency, cumulation or pro-rata validation.'])
 assert len(positions)==786 and len(notes)==250 and len(chapters)==24, 'Pinned edition counts changed; review required'
 assert len(german['rows'])-1==report['classifications_total']
 return dict(schema_version=1,edition='MiGeL 01.07.2026',provenance=manifest,positions=positions,notes=notes,chapters=chapters,stats=report),report

def dump(obj): return json.dumps(obj,ensure_ascii=False,indent=2)+'\n'
def main():
 parser=argparse.ArgumentParser(); parser.add_argument('--check',action='store_true'); args=parser.parse_args()
 manifest=json.loads((ROOT/'public/data/provenance.json').read_text())
 for f in manifest['files']:
  raw=(ROOT/'public/data'/f['file']).read_bytes()
  assert len(raw)==f['bytes'] and hashlib.sha256(raw).hexdigest()==f['sha256'],f['file']
 catalog,report=compile_catalog(manifest,sheets(ROOT/'public/data/source-migel.xlsx'))
 preface=subprocess.run(['pdftotext','-f','1','-l','18','-layout',str(ROOT/'public/data/source-migel.pdf'),'-'],check=True,capture_output=True).stdout.decode('utf-8')
 assert 'Ziffer 1 = Kauf, 2 = Miete, 3 = Kauf und Miete.' in preface
 outputs={'catalog.json':dump(catalog),'import-report.json':dump(report),'provenance.json':dump(manifest),'preface.json':dump({'source':'source-migel.pdf','extraction':'pdftotext -f 1 -l 18 -layout','pages':'1–18 (PDF-Seiten, unverändert extrahierter Text)','text':preface})}
 for name,text in outputs.items():
  path=ROOT/'public/data'/name
  if args.check:
   assert path.read_text()==text, f'Non-reproducible generated file: {name}'
  else: path.write_text(text)
 print(dump({k:report[k] for k in ['position_count','note_count','chapter_count','amount_types','system_counts','classifications_total']}))
if __name__=='__main__': main()
