# Datenquelle, Umfang und Import

## Ausgabe und Nachweis

Quelle: **Bundesamt für Gesundheit BAG**, Mittel- und Gegenständeliste (MiGeL).

- Wirksam ab **2026-07-01**, publiziert **2026-06-24**.
- Originale wurden am **2026-10-21** erfasst. Die exakten UTC-Zeitpunkte sind je Datei im Manifest verzeichnet und sind ausdrücklich **nicht** Wirksamkeits- oder Veröffentlichungsdaten.
- Quellenseite: <https://www.bag.admin.ch/de/mittel-und-gegenstaendeliste-migel>.
- Vollständige URLs, HTTP-Ziel-URLs, MIME-Typen, Dateigrössen und SHA-256: `public/data/provenance.json`, im öffentlichen Build als `data/provenance.json`. Der lokale Erwerbsbeleg `sources/manifest.json` ist eine zusätzliche identische Kopie, keine Voraussetzung für Tests oder Reimport im sauberen Repository.

| Original | Bytes | SHA-256 |
| --- | ---: | --- |
| `source-migel.xlsx` | 532339 | `6335483a46fc558cba2591896d38bc97911b40a8f4eef46729dedf0b101b1df2` |
| `source-migel.pdf` | 5601572 | `3e2a5975b5b118d12ebb3b29b01f901baf7fca75b13257b9bd694007bcb1a6b2` |

Die ZIP- bzw. PDF-Signatur sowie Dateigrösse und Hash werden geprüft. Vorhandene Originaldateien werden beim Erwerb nicht durch abweichende Bytes ersetzt. Das vollständige PDF und XLSX sind unverändert erhalten und über gleichursprüngliche Links herunterladbar. Positionslinks enthalten bewusst **keine unbestätigten PDF-Seitenfragmente**.

## Vollständigkeit

Das ausgewählte Blatt **MiGeL D** enthält nach der Kopfzeile **1037 Zeilen**:

- **786** echte Positionen (alle eindeutig, aus Spalte H).
- **250** Gruppen-/Kategoriehinweise, davon **24** Produktgruppen.
- **1** inhaltlich leere Zeile (Excel-Zeile 1038).

Alle Zeilen werden klassifiziert; nicht zuordenbare nichtleere Zeilen lassen den Import fehlschlagen. Die französischen und italienischen Blätter enthalten jeweils ebenfalls 786 Positionen. Sie dienen der Blattinventur, werden aber **nicht** als zusätzliche Datensätze importiert. Der Importbericht enthält Zählungen je Blatt, Betragsarten, Systemzahlen, Quellauffälligkeiten und Regeln.

| HVB-Spalte | Numerisch | Text | Fehlend |
| --- | ---: | ---: | ---: |
| Selbstanwendung | 737 | 0 | 49 |
| Pflege | 708 | 39 | 39 |

Von den 39 Pflege-Textwerten sind 37 `Kategorie A`; zwei Zellen enthalten die Texte `124.46\n` bzw. `14373.18\n`. Sie bleiben **Text**, auch wenn sie wie Zahlen aussehen. Fehlend bedeutet keine numerische Angabe, nicht Null. Die Pflegefinanzierung für Kategorie A folgt anderen Regeln (PDF 4.7).

Kaufsysteme nach offizieller Endzifferndefinition: **731 Kauf**, **43 Miete**, **12 Kauf und Miete**. Diese Zuordnung stammt aus PDF 4.2, nicht aus einer Interpretation von Produktnamen.

## Schema `catalog.json`

- `schema_version`, `edition`, `provenance` und `stats`.
- `positions[]`: `id` (deutsche Blattzeile, z. B. `D4`), **literaler** `code`, unveränderte vollständige `title`, `unit`, `limitation`, `limitation_flag`, `chapter`, `hierarchy`, `note_ids`, `system`, `amounts.self/care`, `valid_from`, `revision`, `source_row`, `source_cells`.
- `notes[]`: alle 250 vollständigen Überschriften/Hinweise und Limitationen, mit Quellzeile und Originalzellen.
- `chapters[]`: die echten Produktgruppen mit zugehöriger Positionszahl.
- `source_cells`: tatsächliche Zellwerte, OOXML-Typ und Zahlenformat; somit bleibt auch die versteckte Originalhierarchie und Sortierspalte prüfbar. XML-Shared-String-Verweise werden aufgelöst, Text und Zeilenumbrüche nicht redigiert. Numerische Datumsserien werden im zusätzlichen `valid_from`-Feld nach Excel-Datumsbasis in ISO-Daten überführt; der Originalwert bleibt erhalten.
- `amounts`: `kind: numeric | text | missing`; immer `raw`, nur für numerische Zellen zusätzlich `decimal` und `number_format`.

### Präzision

Die numerischen HVB-Zellen haben das offizielle Excel-Zahlenformat 43 mit **zwei Nachkommastellen**. OOXML-Rohwerte wie `2.2000000000000002` werden als Dezimalzahlen auf das **angezeigte offizielle Zweidezimalformat** gebracht (`2.20`); der Rohwert bleibt separat erhalten. Es werden keine Zahlen aus Bezeichnungen oder Limitationen abgeleitet. Der Browser verarbeitet den offiziellen Dezimalbetrag mit `BigInt`-Centwerten, Mengen mit einer Skala von 10000. Er rundet **erst den fertigen Zeilenbetrag** kaufmännisch auf Rappen und summiert die gerundeten Zeilen. Mengengrenze: positiv, höchstens 1000000, höchstens vier Dezimalstellen; Dezimalkomma und -punkt werden akzeptiert. Regeln zu Stückaufrundung, Jahreshöchstbeträgen und pro rata sind nicht automatisiert.

### Quellauffälligkeiten werden nicht versteckt repariert

- **20** Positionsnummern enthalten abschliessenden Leerraum. Die Originalnummer bleibt exakt erhalten; interne Identität basiert auf der Quellzeile, nicht auf einer still normalisierten Nummer.
- Sortierspalte **Q ist nicht kanonisch**: z. B. enthält Zeile 13 in H `01.02.06.00.1`, während Q eine andere Nummer referenziert. Der Import verwendet immer H.
- Vier Hierarchietokens haben keine exakt gleich geschriebene separate Überschrift: `17.06.01`, `26.01`, `35.06.08.`, `99.02.01`. Dafür werden keine Titel erfunden. Die Kategorieauswahl bietet solche Tokens als `ohne separate Quellüberschrift` an.
- Bei **D904** steht in C `35.06.08.`. Der passende tatsächlich vorhandene Gruppenhinweis **D902**, Code `35.06.08`, wird zusätzlich über den **exakten literalen Präfix** der Positionsnummer `35.06.08.01.1` verknüpft. Der ursprüngliche C-Wert wird nicht verändert. Dieser eine Zusatzlink ist separat als `prefix_heading_links` im Importbericht ausgewiesen. Der dazugehörige speziellere Silber-Hinweis D903 bleibt ebenfalls verknüpft.

`preface.json` enthält den mit Poppler 24.02.0 extrahierten vollständigen Text der **PDF-Seiten 1–18**, einschliesslich allgemeiner Vorbemerkungen, Rechts-/Vergütungsregeln, Definitionen und Abkürzungen. Die Anzeige ist Text mit erhaltenen Quellzeilenumbrüchen; für das rechtlich massgebende Layout dient das Original-PDF. Im Gegensatz zur XLSX-Reproduktion kann PDF-Textlayout von der verwendeten Poppler-Version abhängen; `--check` vergleicht auch diese Ausgabe bytegenau.

## Aktualisierung

`npm run acquire` prüft bei vorhandenem Manifest nur die Originalfingerabdrücke. Neue Versionen nicht darüberkopieren: Ausgabe, Quellen und Erfassungsnachweise bewusst versionieren; alle Zählungen und Schemaannahmen überprüfen; vollständige Tests, Importdiff und Browser-Prüfung durchführen. Sicherungsdateien sind an Ausgabe und XLSX-Hash gebunden und werden nicht still einer anderen Edition zugeordnet. Kein Hintergrundabruf neuer Daten durch die öffentliche Anwendung.
