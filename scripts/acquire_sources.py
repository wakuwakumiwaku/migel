#!/usr/bin/env python3
"""Download pinned official source originals, never overwrite different existing bytes."""
from pathlib import Path
import datetime, hashlib, json, urllib.request
ROOT = Path(__file__).resolve().parents[1]
PAGE = 'https://www.bag.admin.ch/de/mittel-und-gegenstaendeliste-migel'
SOURCES = {
 'source-migel.xlsx': 'https://www.bag.admin.ch/dam/de/sd-web/4GEgEMgJ45A6/Mittel-%20und%20Gegenst%C3%A4ndeliste%20per%201.%20Juli%202026%20(in%20Excel-Format).xlsx',
 'source-migel.pdf': 'https://www.bag.admin.ch/dam/de/sd-web/tmtz2K0-RTAB/Mittel-%20und%20Gegenst%C3%A4ndeliste%20per%2001.07.2026.pdf',
}
def main():
 manifest_path = ROOT/'sources/manifest.json'
 if manifest_path.exists():
  manifest=json.loads(manifest_path.read_text())
  for f in manifest['files']:
   raw=(ROOT/'public/data'/f['file']).read_bytes()
   assert hashlib.sha256(raw).hexdigest()==f['sha256'], f['file']
  print('Preserved source manifest verified; no download needed.')
  return
 files=[]
 for name,url in SOURCES.items():
  request=urllib.request.Request(url,headers={'User-Agent':'MiGeL source archive/1.0'})
  with urllib.request.urlopen(request,timeout=120) as res:
   raw=res.read(); final=res.url; content_type=res.headers.get('Content-Type')
  assert raw.startswith(b'PK\x03\x04' if name.endswith('xlsx') else b'%PDF-'), name
  target=ROOT/'public/data'/name; target.parent.mkdir(parents=True,exist_ok=True)
  if target.exists() and target.read_bytes()!=raw: raise ValueError('Refusing to replace source: '+name)
  target.write_bytes(raw)
  files.append(dict(file=name,url=url,final_url=final,bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest(),content_type=content_type,captured_at=datetime.datetime.now(datetime.timezone.utc).isoformat()))
 manifest=dict(schema_version=1,authority='Bundesamt für Gesundheit BAG',source_page=PAGE,effective_date='2026-07-01',publication_date='2026-06-24',files=files)
 manifest_path.parent.mkdir(parents=True,exist_ok=True)
 manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(manifest,ensure_ascii=False,indent=2))
if __name__=='__main__': main()
