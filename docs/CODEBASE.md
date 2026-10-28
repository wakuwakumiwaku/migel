# Aufbau und Prüfregeln

## Dateikarte

| Pfad | Aufgabe |
| --- | --- |
| `index.html` | Deutsche semantische Oberfläche, Dialoge, relative Datenlinks, mobile Sprungnavigation und separate Drei-Katalog-Navigation |
| `src/app.js` | Browser-UI, Katalogstart, schrittweises Rendern, Details, Zusammenstellung, lokaler Speicher und Downloads |
| `src/domain.js` | Reine Suche/Filter, exakte Mengen-/Centrechnung, vollständige Sicherungsvalidierung und CSV |
| `src/styles.css` | Dunkle hochkontrastreiche Oberfläche, responsive Layouts, Druckregeln |
| `public/data/` | Vollständiger generierter Katalog, Berichte, Provenienz, Vorbemerkungen und unveränderte Originale |
| `sources/` | Optionaler lokaler Erwerbsbeleg und bewahrte BAG-Quellenseite; nicht veröffentlicht und keine Test-/Importer-Voraussetzung |
| `scripts/acquire_sources.py` | Erwerb exakt benannter offizieller Originale, Signatur-/Hashprüfung, Manifest |
| `scripts/import_catalog.py` | Python-Standardbibliothek: ZIP/ElementTree/Decimal; Poppler nur für PDF-Text |
| `scripts/files.mjs` | **Explizite Allowlist** aller 11 veröffentlichten Laufzeitdateien |
| `scripts/build.mjs` | Sauberes `dist/`, nur Allowlist kopieren, Symlinks nicht als Eingabedatei akzeptieren |
| `scripts/serve.mjs` | Sicherer Loopback-Server mit `createAppServer({root, basePath})`, ausschliesslich GET/HEAD und erlaubte Pfade |
| `scripts/check.mjs` | Syntax, vollständige Quellfingerabdrücke, feste Editionszählung |
| `tests/build.test.mjs` | Echte Build-CLI: vollständiges Output bei Inputfehlern bewahren, gestufter Verzeichnisersatz und Wiederherstellung |
| `tests/*.test.mjs` | Node-Tests für Domäne, HTTP-Sicherheit, Unterpfade, Build-Mitgliedschaft und Bytes |
| `tests/test_import_catalog.py` | Vollständiger Reimport-/Quellabgleich, Betragsarten, Code- und Hinweiserhalt |
| `tests/browser.mjs` | Isolierte native Browser-Abnahme; nur `.local/` als Evidenzziel |
| `.github/workflows/pages.yml` | Check/Test/Build und GitHub-Pages-Artefakt aus `dist/` |

## Datenfluss

Original-XLSX → reproduzierbarer Import → `public/data/catalog.json` → gleichursprünglicher `fetch` beim Start → Suchindex und lokale UI. Die gesamte deutsche Liste ist Teil der Anwendung. Die UI rendert anfänglich 60 Datensätze und erweitert explizit in weiteren 60er-Gruppen, sucht und filtert aber stets über **alle 786 Positionen**. Vollständige Quelltexte werden erst in den Details gerendert. Keine externe Laufzeit oder externes Such-API.

Importer und Quelltests lesen das gebündelte `public/data/provenance.json`. Ein sauberer Checkout ohne `sources/`, `.local/` und Buildverzeichnisse muss `npm ci`, Tests, Check und Build bestehen. Der dokumentierte `--check`-Reimport verwendet ebenfalls nur die gebündelten Originale; Poppler bleibt die gesonderte Voraussetzung für die PDF-Textprüfung. Eine fehlende ignorierte Manifestdatei ist ein Verpackungs-/CI-Fehler, kein Grund, den privaten Erwerbscache nachträglich zu veröffentlichen.

Text aus Quellen und Dateien wird mit `textContent`, Textknoten oder `Option` eingesetzt, nicht als HTML interpretiert. CSV-Zellen sind quotiert, Anführungszeichen verdoppelt und Formelanfänge mit einem Apostroph neutralisiert. Das sichere lokale Serververhalten ist zusätzliche Entwicklungsabsicherung; der öffentliche Build bleibt eine normale statische Website.

### Suchindex und begrenzte Mitgliedschaftslisten

`searchIndex(catalog)` liefert weiterhin eine `Map<ID, normalisierter Volltext>`. Eine modulinterne `WeakMap` ordnet diesem Index Listen für Produktgruppe, Kategorie und System sowie den ersten Hinweis je Quellcode zu. Der Katalog ist für die Lebensdauer des Index unveränderlich; ein Editionswechsel benötigt einen neuen Index. Die Listen referenzieren die bestehenden Positionen und entstehen einmal in deren exakter Quellreihenfolge. Kategoriezugehörigkeit vereinigt `hierarchy` und die zugeordneten Originalhinweise, insbesondere den exakten Präfixhinweis von `D904`; Kategorien ohne eigene Überschrift bleiben erhalten.

`filterPositions` wählt die kleinste gesetzte Mitgliedschaftsliste und prüft darauf weiterhin **alle** Filter und alle Suchwörter. Der Rückgabewert ist jedes Mal ein neues Array. Es gibt weder eine unbegrenzte Query-Cache-Tabelle noch gespeicherte Favoritenresultate; ein Favoriten-Set wird nur bei aktivem Favoritenfilter erstellt. Ein extern übergebener normaler Text-`Map` bleibt über den vollständigen Scan nutzbar. Normierung, Suchfelder, Geldrechnung und Speicherformat sind unverändert. Es gibt keine Entprellung und keine ausstehenden Such-Timer; Kategorie, Zurücksetzen und Menge arbeiten weiter synchron. Suche ersetzt nicht die Plan-DOM-Knoten.

### Navigation und Kontrast

`nav[aria-label="Kataloge"]` liegt als **nicht haftende**, umbrechende Zeile unter der Kopfzeile. Alle drei absoluten Pages-URLs bleiben sichtbar; nur MiGeL hat `aria-current="page"`. Links sind mindestens 44 Pixel hoch, nativ fokussierbar und öffnen im selben Tab. Die separate mobile Arbeitsbereichsnavigation bleibt bestehen. Druck blendet beide Navigationen aus.

Die Schriftgrössen bleiben 17 Pixel für Ergebnistitel und Formulare, 18 für Beträge, 15 für Codes und mindestens 16 für Originalhinweise. Neue Kontrasttoken: Trennlinien `#ac96bb`, Felder/Fokus `#ead4ff`, aktive Rahmen `#e2bfff`, deaktivierte Beschriftungen `#c6b8d4` ohne reduzierte Gesamtdeckkraft. Mengen- und Anwendungsfelder richten sich bei umbrechenden Labels unten aus. Gemessene Browserkontraste: Feldrahmen zum Panel **14,08:1**, Ergebnis-Trennlinie **7,18:1**, aktiver Katalogtext **14,62:1**. Dies sind gezielte Kontrastprüfungen, keine vollständige Accessibility-Zertifizierung.

### Kontrollierte Vorher-/Nachher-Messung

Beide Versionen verwenden dieselben unveränderten 786 Positionen und werden aus getrennten lokalen Sites in eigenen Browserkontexten geladen. CPU: Node `performance.now`, 400 Aufwärmaufrufe, 121 Stichproben zu je 30 vollständigen `filterPositions`-Aufrufen, pro Aufruf ausgewiesen. Browser-DOM-Messung: 10 Aufwärmdurchläufe, danach 81 Stichproben mit Browseruhr um ein via `dispatchEvent` ausgelöstes Input-Ereignis und die echte synchrone DOM-Erstellung; erzwungenes Layout separat. Diese Ereignisse sind synthetisch, nicht als native Tastatureingaben ausgegeben. Der tatsächliche automatisierte `fill`-Rundweg wird separat mit Node-Uhr erfasst und ist **keine CPU- oder Paint-Zeit**. Submillisekundenwerte im Browser sind timerbedingt quantisiert. Keine Drosselung, Fake-Latenz oder Ersatzdaten.

| CPU-Abfrage | Treffer | Median vorher → nachher, ms | p95 vorher → nachher, ms | Maximum vorher → nachher, ms |
| --- | ---: | ---: | ---: | ---: |
| Alle Positionen | 786 | 0,015612 → 0,011707 | 0,025008 → 0,017769 | 0,029186 → 0,022553 |
| Milchpumpe | 5 | 0,335625 → 0,347737 | 0,379590 → 0,405257 | 0,429062 → 0,462939 |
| Hoergeraete | 4 | 0,403315 → 0,422934 | 0,437982 → 0,536976 | 0,457162 → 0,684108 |
| Kategorie 01.01 | 5 | 0,037283 → 0,001602 | 0,048439 → 0,002718 | 0,116366 → 0,013559 |
| Kategorie 26.01 ohne Überschrift | 9 | 0,023630 → 0,001439 | 0,029728 → 0,001793 | 0,035215 → 0,013857 |
| Exakt-Präfix-Kategorie 35.06.08 | 4 | 0,031322 → 0,001415 | 0,038982 → 0,001949 | 0,042211 → 0,009520 |
| Gruppe 13 | 4 | 0,012562 → 0,001335 | 0,021127 → 0,001695 | 0,034146 → 0,015031 |
| System Miete | 43 | 0,012173 → 0,002146 | 0,016837 → 0,004048 | 0,018262 → 0,076423 |
| Gruppe/Kategorie/Miete/Milch | 1 | 0,008960 → 0,000851 | 0,013423 → 0,001647 | 0,016909 → 0,011953 |

Für 60 gerenderte von 786 Treffern: native synchrone Input-/DOM-Zeit Median **3 → 3 ms**, p95 **5 → 4 ms**, Maximum **7 → 8 ms**; Layout separat **5 → 5**, **8 → 8**, **10 → 10 ms**. Der native `fill`-Rundweg mit geprüften Ergebnis-IDs lag bei Median **15,23 → 14,87 ms**, p95 **19,71 → 18,79 ms**, Maximum **28,69 → 21,69 ms**. Daraus wird weder ein allgemeiner Rendering-Speedup noch eine gemessene Paint-Latenz abgeleitet. Der tatsächliche Gewinn betrifft die gefilterte Auswahl; die bereits schnelle unbeschränkte Volltextsuche bleibt ein linearer Scan.

Die lokale Handoff-Evidenz liegt unter `.local/evidence/{baseline,candidate,ordered-parity}.json`, mit Messharness `.local/full-data-evidence.mjs` und unabhängiger Rohtextreferenz `.local/ordered-parity.mjs`. Diese Dateien sind Entwicklungsbelege, keine Runtime-Dateien. 17 312 vollständige geordnete Ergebnisvergleiche je Version (34 624 insgesamt) decken Quellcodes, Volltexte, Produktgruppen, Kategorien, Systeme, Kombinationen sowie wiederverwendete Indizes mit vor Ort mutierten Favoritenarrays ab. Die identische Navigations-Vertragsprüfung schlägt an der eingefrorenen Baseline fehl und besteht am Kandidaten. Der native Browserlauf ergänzt Tastatur-/Pointer-Aktivierung, sichtbare Hit-Tests, unverzögerte Such-/Resetfolge, alle 786 geladenen Zeilen und Scroll-/Überlaufprüfungen bei 320/390/1024/1440 Pixeln. Ein nativer Touch-Tap-Versuch hing im verwendeten Camofox-Treiber; dessen gesonderter Fehlbeleg bleibt erhalten. Physische Touchbedienung ist nicht als geprüft ausgewiesen.

## Workspace und Persistenz

Schlüssel **`migel.workspace.v1`**; getrennt von anderen Katalogen. JSON-Format:

```json
{
  "app": "migel.workspace",
  "version": 1,
  "edition": "MiGeL 01.07.2026",
  "source_sha256": "6335483a46fc558cba2591896d38bc97911b40a8f4eef46729dedf0b101b1df2",
  "lines": [{"id":"D4","context":"self","quantity":"2"}],
  "favorites": ["D4"]
}
```

Es gibt keine Namen, Freitextpatientenfelder, Accounts oder API-Schreibzugriffe. Die Validierung prüft das **gesamte Dokument**, exakte Schlüsselmengen, Anwendung, bekannte IDs, Ausgabe, Quellhash, gültige Mengentexte, eindeutige Favoriten und eindeutige ID/Anwendungs-Paare. Maximal 2000 Zeilen und 2 MB lokale Importdatei. Erst nach vollständiger Prüfung und ausdrücklicher Übernahme ersetzt eine Sicherung den bisherigen Workspace. Ein Versionszähler verwirft überholte asynchrone Dateilesungen, auch bei einer zwischenzeitlichen Tab-Aktualisierung.

Die Anwendung je Zeile muss genau die Zeichenfolge `self` oder `care` sein. `Object.hasOwn` wird erst nach der Typprüfung verwendet: Arrays wie `["self"]` und verschachtelte Arrays dürfen nicht durch implizite Property-Key-Konvertierung als gültige Anwendung erscheinen. `tests/context-types.test.mjs` und native Dateiimporte in einen bereits gefüllten Plan prüfen die Ablehnung vor jeder Vorschau oder Speicheränderung; gültige getrennte Selbst-/Pflegezeilen bleiben zulässig. Der optionale Erwerb legt seinen ignorierten Manifest-Elternordner selbst an; `tests/test_acquire_sources.py` prüft den echten Dateischreibpfad mit unveränderten Originalbytes und einer ausdrücklich ersetzten HTTPS-Transportgrenze.

Ungültige Mengen bleiben als flüchtiger Entwurf sichtbar; gespeicherte Werte bleiben zuletzt gültig. Die aktuelle Summenanzeige wird pausiert und JSON/CSV/Druck werden bis zur Korrektur gesperrt. Entwürfe werden nicht in Sicherungen eingeschmuggelt. Entfernen einer Zeile oder bewusstes Leeren entfernt deren Entwurf.

Beim Start wird nicht unaufgefordert geschrieben. Beschädigte oder versionsfremde gespeicherte Bytes bleiben erhalten und automatisches Speichern wird ausgesetzt. Schreibfehler führen zur Arbeitsspeicher-Sitzung mit sichtbarer Warnung. Das ausdrückliche Zurücksetzen betrifft ausschliesslich diesen MiGeL-Schlüssel und setzt die interne Rohwert-Baseline neu.

Ein reales `storage`-Ereignis aus einem anderen Tab pausiert eigene Schreibvorgänge, verwirft nur veraltete Importvorschauen und lässt aktuelle Zusammenstellung und Mengenentwürfe unverändert. Das gilt für gültige, beschädigte und gelöschte fremde Speicherstände. Vor jedem eigenen Schreibversuch wird zusätzlich der aktuelle Rohstring mit der beim Lesen bzw. letzten eigenen Speichern erfassten Baseline verglichen. Das schützt auch vor noch nicht zugestellten Ereignissen, ist aber keine tabübergreifende atomare Compare-and-swap-Garantie. Zum bewussten Übernehmen des fremden Stands aktuelle Arbeit als JSON sichern und neu laden. Die Browserprüfung enthält tatsächliche Zweitab-Ereignisse mit unfertigem Mengenentwurf, anschliessend korrigierter Arbeit, frischem Reload und unangekündigter Rohwertänderung. Die früheren Auto-Sync-/Clear-Erwartungen sind ausdrücklich durch diesen verlustvermeidenden Vertrag ersetzt; Rechen-, Quell-, Import- und Exportprüfungen bleiben erhalten.

## Beträge und Darstellung

Die Domäne unterscheidet Quelleneinheit, Kauf-/Mietsystem und HVB-Anwendung. Ein Wechsel der Katalog-HVB-Spalte betrifft **nur Anzeige und neu hinzugefügte Zeilen**; bestehende Zeilen bleiben in ihrer bisherigen Anwendung. Jede Zeile kann explizit wechseln. Existiert bereits dieselbe Position mit der Zielanwendung, wird dieser Wechsel statt einer stillen Zusammenlegung abgelehnt. Fehlende und textuelle Beträge erzeugen offene Zeilen und eine explizit unvollständige Teilsumme.

Die Herkunftsdetails nennen Quellzeile, Positionsgültigkeit, Ausgabe, Erfassung und Fingerabdrücke. Alle Gruppenhinweise und Limitationen sind vollständig einsehbar, auch die allgemeinen Vorbemerkungen. Das Drucklayout zeigt Quelleneinheiten, Mengen, Anwendung, Beträge, Quellversion und fachliche Grenzen.

## Prüfungen

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
python3 scripts/import_catalog.py --check
```

Der letzte Befehl benötigt Poppler; CI prüft die XLSX-Reproduktion ohne externe Downloads mit den regulären Python-Tests. Browser-Test separat mit `PLAYWRIGHT_MODULE` und `BROWSER_EXECUTABLE`, siehe README. Unterpfadbetrieb wird unter `/migel/` geprüft. Der Build liest und prüft sämtliche erlaubten Inputs, bevor er `dist/` verändert. Die vollständige neue Ausgabe entsteht in einem temporären Projektordner; erst danach ersetzt sie den alten Verzeichnisbaum. Fehlt eine Eingabe oder ist sie ein abgelehnter Symlink, bleibt die letzte vollständige Ausgabe unverändert. Scheitert der Ersatz, wird sie wiederhergestellt; scheitert auch dies, bleibt die Sicherung im gemeldeten temporären Ordner zur manuellen Wiederherstellung erhalten. Nichtreguläre oder symlinkbasierte `dist`-Ziele werden nicht entfernt. Dies schützt vor gewöhnlichen Buildfehlern, nicht vor Stromausfall oder gleichzeitigen Builds.

Veröffentlichungsdateien werden exakt gegen die Allowlist und die Quellbytes verglichen; `.local/`, `sources/`, Tests, Skripte und Sicherungen gehören niemals ins Pages-Artefakt. Die Workflow-Berechtigungen sind auf `contents: read`, im Build `pages: read` und im Deployment `pages: write` / `id-token: write` begrenzt.

Für Änderungen an Quellschema, Betragslogik, Import, Speicher oder CSS müssen die jeweils betroffenen Tests und anschliessend die integrierten Prüfungen erneut laufen. Responsive Prüfungen müssen auch die **interne** Scrollbreite des Plan-Panels messen, nicht nur die Dokumentbreite. Keine stillen Datenkorrekturen: Quellauffälligkeiten im Importbericht und in `docs/DATA.md` dokumentieren.
