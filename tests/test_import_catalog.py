import unittest, json, sys, hashlib, copy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from import_catalog import sheets,compile_catalog,amount

class ImportTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.manifest=json.loads((ROOT/'public/data/provenance.json').read_text())
  cls.workbook=sheets(ROOT/'public/data/source-migel.xlsx')
  cls.catalog,cls.report=compile_catalog(cls.manifest,cls.workbook)
 def test_exact_source_fingerprints_and_magic(self):
  for f in self.manifest['files']:
   b=(ROOT/'public/data'/f['file']).read_bytes()
   self.assertEqual(len(b),f['bytes']);self.assertEqual(hashlib.sha256(b).hexdigest(),f['sha256'])
   self.assertTrue(b.startswith(b'PK\x03\x04' if f['file'].endswith('xlsx') else b'%PDF-'))
 def test_entire_sheet_accounted_for(self):
  r=self.report
  self.assertEqual(r['position_count'],786);self.assertEqual(r['note_count'],250);self.assertEqual(r['chapter_count'],24)
  self.assertEqual(r['classifications_total'],1037);self.assertEqual(r['blank_rows'],[1038])
  self.assertEqual(len({p['code'] for p in self.catalog['positions']}),786)
  self.assertEqual(sum(c['count'] for c in self.catalog['chapters']),786)
 def test_no_duplicate_language_rows(self):
  self.assertEqual(self.report['selected_sheet'],'MiGeL D')
  self.assertEqual(len(self.report['sheets']),3)
  self.assertEqual(self.report['excluded_languages'],['MiGeL F','MiGeL I'])
 def test_generated_catalog_matches_reimport(self):
  self.assertEqual(self.catalog,json.loads((ROOT/'public/data/catalog.json').read_text()))
  self.assertEqual(self.report,json.loads((ROOT/'public/data/import-report.json').read_text()))
 def test_each_literal_cell_and_all_notes_preserved(self):
  rows={r['row']:r['cells'] for r in self.workbook[0]['rows']}
  for p in self.catalog['positions']+self.catalog['notes']:
   self.assertEqual(p['source_cells'],rows[p['source_row']]);self.assertEqual(p['title'],rows[p['source_row']]['J']['value'])
   self.assertEqual(p['limitation'],rows[p['source_row']].get('K',{}).get('value',''))
 def test_amount_format_rounding_and_types(self):
  self.assertEqual(amount({'value':'2.2000000000000002','type':'n','format':43})['decimal'],'2.20')
  self.assertEqual(amount({'value':'124.46\n','type':'s','format':43}),{'kind':'text','raw':'124.46\n'})
  self.assertEqual(amount(None),{'kind':'missing','raw':''})
  self.assertEqual(self.report['amount_types'],{'self':{'numeric':737,'missing':49},'care':{'numeric':708,'text':39,'missing':39}})
  with self.assertRaises(ValueError):amount({'value':'1.0','type':'n','format':0})
 def test_source_sort_formula_is_not_canonical_identity(self):
  p=next(p for p in self.catalog['positions'] if p['source_row']==13)
  self.assertEqual(p['code'],'01.02.06.00.1');self.assertEqual(p['source_cells']['Q']['value'],'01.02.05.00.1')
 def test_literal_prefix_note_reconciliation_without_token_repair(self):
  p=next(p for p in self.catalog['positions'] if p['id']=='D904')
  self.assertEqual(p['source_cells']['C']['value'],'35.06.08.')
  self.assertIn('D902',p['note_ids']);self.assertIn('D903',p['note_ids'])
  self.assertEqual(self.report['prefix_heading_links'],[{'position_id':'D904','note_id':'D902','method':'exact literal position prefix'}])
 def test_original_preface_complete_pages(self):
  preface=json.loads((ROOT/'public/data/preface.json').read_text())['text']
  for token in ['Allgemeine Vorbemerkungen','4.2','Ziffer 1 = Kauf, 2 = Miete, 3 = Kauf und Miete.','Kategorie A','Abkürzungen']:
   self.assertIn(token,preface)
 def test_bad_schema_and_literal_codes_fail_closed(self):
  data=copy.deepcopy(self.workbook);data[0]['rows'][0]['cells']['H']['value']='Other'
  with self.assertRaises(ValueError):compile_catalog(self.manifest,data)
  data=copy.deepcopy(self.workbook);data[0]['rows'][3]['cells']['H']['value']='bad code'
  with self.assertRaises(ValueError):compile_catalog(self.manifest,data)
if __name__=='__main__':unittest.main()
