export const runtimeFiles = {
  'index.html':'index.html', 'favicon.svg':'public/favicon.svg',
  'src/app.js':'src/app.js','src/domain.js':'src/domain.js','src/styles.css':'src/styles.css',
  ...Object.fromEntries(['catalog.json','import-report.json','provenance.json','preface.json','source-migel.xlsx','source-migel.pdf'].map(name=>['data/'+name,'public/data/'+name]))
};
