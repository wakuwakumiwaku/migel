# MiGeL · Katalog & Höchstvergütung

Eigenständiger deutscher Browser für die **vollständige Mittel- und Gegenständeliste des BAG, Ausgabe 1. Juli 2026**. Der mitgelieferte Katalog wird beim Öffnen und bei jedem Neuladen automatisch geladen: **786 Positionen, 250 Gruppenhinweise, 24 Produktgruppen**. Kein manueller Katalogimport, keine Konten, keine Laufzeitbibliotheken oder externen Schriften.

## Funktionen

- Schnelle Volltextsuche nach Position, Bezeichnung, Einheit, Limitation und Gruppenhinweisen; Umlaute und Umschreibungen werden toleriert.
- Produktgruppen-, Kategorie- und Kauf-/Mietsystemfilter; lokal gespeicherte Favoriten.
- Direkte Katalogwechsel zu **DENTOTAR, MiGeL und Spezialitätenliste**: eigene umbrechende Navigationszeile, aktive MiGeL-Markierung, volle Ziel-URLs, mindestens 44 Pixel hohe Links, kein erzwungener neuer Tab.
- Vollständige Originalbezeichnung und Limitationen in den Details, inklusive übergeordneter Gruppenhinweise, Quellzeile und Versionsnachweis.
- Persönliche Zusammenstellung mit **Quelleneinheiten** und separater Auswahl von **HVB Selbstanwendung / HVB Pflege** pro Zeile. Kauf-/Mietsysteme werden nicht zusammengelegt.
- Exakte Dezimalrechnung mit ganzzahliger Centrechnung: Zeilenbetrag auf Rappen runden, danach summieren. Textwerte und fehlende HVB bleiben offen; eine Summe mit offenen Zeilen wird ausdrücklich als unvollständige Teilsumme bezeichnet.
- JSON-Sicherung mit vollständiger Validierung und ausdrücklicher Übernahme, CSV-Download mit Originalhinweisen, Druckansicht.
- Lokaler Speicher unter `migel.workspace.v1`. Änderungen aus anderen Tabs pausieren eigene Schreibvorgänge, statt aktuelle Arbeit und Mengenentwürfe zu ersetzen. Beschädigter oder blockierter Speicher wird nicht still überschrieben; die Anwendung bleibt im Arbeitsspeicher nutzbar. Aktuelle Arbeit als JSON sichern und zum Übernehmen des anderen Speicherstands neu laden.
- Original-PDF, Original-XLSX, Importbericht und Provenienz werden von derselben Website bereitgestellt. Mobile Sprungnavigation zwischen Katalog und Zusammenstellung.

## Fachliche Grenzen

**Höchstvergütungsbeträge sind keine Verkaufspreise, keine zugesicherte Erstattung und kein Tarifpunktwert.** Effektiver Preis, Franchise und Selbstbehalt sind nicht eingerechnet. MWST ist laut BAG bereits in den HVB enthalten. Indikation, ärztliche Verordnung, Limitationen, Frequenzen, Kostengutsprache, Kombinationen und pro-rata-Regeln werden **nicht automatisch geprüft**. Die Menge bedeutet immer ein Vielfaches der angezeigten **Menge / Einheit** aus der Quelle, z. B. `1 Stück`, `50 Stück`, `Miete / Tag` oder `pro Jahr (pro rata)`; nicht beliebig Packungen oder einzelne Stücke. Teilzeiträume müssen fachlich korrekt manuell abgebildet werden.

Die letzte Positionsziffer bezeichnet nach PDF-Ziffer 4.2 die Anwendbarkeit beim Kauf-/Mietsystem: 1 = Kauf, 2 = Miete, 3 = Kauf und Miete. Bei Zubehör bedeutet dies nicht automatisch den Erwerbsmodus des Zubehörs. Die Anwendungsspalte bestimmt den verwendeten HVB. Texte wie `Kategorie A` sind **kein numerischer Betrag** und werden nicht als CHF 0 interpretiert. Auch zwei als Text gespeicherte Zahlen bleiben bewusst nicht berechenbar.

Keine Patientendaten eingeben. JSON- und CSV-Dateien verlassen den Browser nur als ausdrücklich ausgelöste lokale Downloads. Es gibt keine Uploads an einen Server, API-Schreibzugriffe, Telemetrie oder Werbung. JSON öffnen liest ausschliesslich eine lokale Sicherungsdatei.

## Lokal starten

Voraussetzungen: Node.js 22 oder neuer; Python 3.12 oder neuer für die Importtests. Der öffentliche Build hat keine Paketabhängigkeiten.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
npm run serve
```

Anschliessend `http://127.0.0.1:3007/` öffnen. Optional: `PORT=3017 npm run serve`. `dist/` ist das alleinige Veröffentlichungsverzeichnis. Der Server liefert nur ausdrücklich erlaubte Laufzeitdateien aus, keine Quellcache-, Test-, Sicherungs- oder Projektdateien. Die Anwendung muss über HTTP(S) geöffnet werden; `file://` wird nicht unterstützt.

## Daten reproduzieren

Die unveränderten BAG-Dateien liegen in `public/data/`. Das gebündelte `public/data/provenance.json` trennt Veröffentlichungsdatum, Wirksamkeitsdatum und tatsächliche Erfassung; Original-URLs, Dateigrössen und SHA-256 sind enthalten. Importer und Tests verwenden diesen veröffentlichten Nachweis und benötigen keinen ignorierten Quellencache. Bei einer lokalen Neuerfassung bleiben zusätzlich `sources/manifest.json` und `sources/source-page.html` als Erwerbsbelege erhalten; sie werden nicht in Repository oder Website-Build kopiert.

```sh
npm run acquire          # bestehende Originale prüfen; ohne Manifest: exakt angegebene BAG-URLs laden
npm run import           # XLSX importieren; PDF-Vorbemerkungen mit pdftotext extrahieren
python3 scripts/import_catalog.py --check
```

Der Import benötigt zusätzlich Poppler (`pdftotext`, geprüft mit Version 24.02.0), aber weder pandas noch openpyxl. Der JavaScript-Build benötigt keinen erneuten Download und keine PDF-Werkzeuge. Die Python-Tests importieren die mitgelieferte XLSX erneut und vergleichen den gesamten Datensatz. Ein Editionswechsel muss bewusst als neue Quellversion geprüft werden; die Importzählung ist auf diese Ausgabe festgelegt. Keine automatische Aktualisierung im öffentlichen Browser.

## Browser-Prüfung

`npm run test:browser` startet einen eigenen Firefox-kompatiblen Browser und einen eigenen kurzlebigen Loopback-Server. Keine bestehende Browserinstanz wird verwendet. Dafür bereitstellen:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright-core/index.mjs \
BROWSER_EXECUTABLE=/path/to/firefox-compatible-binary \
npm run test:browser
```

Das Ergebnis und Screenshots werden ausschliesslich unter `.local/browser/` geschrieben. Geprüft werden echter Katalogstart, Suche, vollständige Hinweise, Filter, Kontext-/Mengensummen, native Downloads, JSON-Validierung über `setInputFiles`, Reload und mehrere Tabs, beschädigter/blockierter Speicher, Druck-CSS und horizontale Überläufe bei 1440, 1024, 390 und 320 Pixeln. `setInputFiles` ist keine Prüfung eines Betriebssystem-Dateidialogs.

Zusätzlich prüft der Browserlauf die drei Kataloglinks per nativer Tastatur und Pointer, ihre sichtbaren 44-Pixel-Ziele und Hit-Tests, alle 786 Positionen nach „Weitere Positionen“, unverzögerte Suche gefolgt von Kategorie/Zurücksetzen, berechnete Kontrastverhältnisse sowie reale Ergebniszeilen und Mengenfelder nach dem Scrollen. Die Ziel-Websites werden dabei nicht geöffnet; ihre Veröffentlichung und physische Touchgeräte sind separate Prüfungen.

## Suchpfad und Reaktionszeit

Die Volltextsuche normalisiert Quelltext einschliesslich sämtlicher zugeordneter Hinweise einmal beim Start. Produktgruppen, Kategorien und Systeme erhalten zusätzlich begrenzte Mitgliedschaftslisten in Quellreihenfolge. Bei gesetzten Filtern wird nur die kleinste passende Liste durchsucht; alle aktiven Bedingungen bleiben wirksam. Kategorien ohne eigene Quellüberschrift und die exakten Zusatzhinweise bleiben enthalten. Favoriten werden bei jeder Abfrage aus dem aktuellen Workspace gelesen, nicht als Suchergebnis zwischengespeichert.

Die kontrollierte Messung über den echten Gesamtkatalog ergab für Kategorie `01.01` (5 Treffer) CPU-Median **0,0373 → 0,0016 ms**, p95 **0,0484 → 0,0027 ms**. Die unbeschränkte Volltextsuche war bereits schnell und wurde nicht mit einem zusätzlichen Suchindex oder künstlicher Eingabeverzögerung umgebaut: `Milchpumpe` (5 Treffer) lag bei **0,3356 → 0,3477 ms** Median. Das ist ausdrücklich kein allgemeiner Volltext-Speedup.

Der native Browser brauchte für die synchrone Suchereignis-/DOM-Aktualisierung der ersten 60 von 786 Positionen vor und nach der Änderung **3 ms Median**; Layout wurde getrennt gemessen. Diese Werte sind lokale Messungen, keine Gerätegarantie und keine Paint-Latenzen. Methodik, p95/Maxima und Erhaltungsregeln stehen in [CODEBASE](docs/CODEBASE.md).

## GitHub Pages

Zielpfad: `https://wakuwakumiwaku.github.io/migel/`. Alle Laufzeit- und Daten-URLs sind relativ. `.github/workflows/pages.yml` führt bei Push auf `main` oder manuellem Start Check, Tests und den explizit erlaubten Build aus und veröffentlicht nur `dist/`. In den Repository-Einstellungen muss GitHub Pages auf GitHub Actions eingestellt werden. Der Build selbst führt keine Repository-Erstellung und keine Veröffentlichung aus.

## Quellen und Dokumentation

- [Offizielle BAG-Quellenseite](https://www.bag.admin.ch/de/mittel-und-gegenstaendeliste-migel)
- [Datenmodell und Provenienz](docs/DATA.md)
- [Code-Aufbau und Prüfregeln](docs/CODEBASE.md)

Die offiziellen BAG-Daten bleiben ihrer Quelle zugeordnet. Dieses Projekt beansprucht keine Rechte an fremden Unterlagen und vergibt dafür keine eigene Lizenz. Massgebend bleiben Originalunterlagen und anwendbare Rechtsgrundlagen. Es handelt sich um ein unabhängiges Nachschlagewerk, nicht um ein Angebot des BAG.
