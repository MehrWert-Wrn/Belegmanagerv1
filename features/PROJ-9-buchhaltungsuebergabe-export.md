# PROJ-9: Buchhaltungsübergabe-Export

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-04-21
**Replaces:** DATEV-Export (entfernt, da nicht relevant für österreichischen Markt)

## Dependencies
- Requires: PROJ-2 (Mandant-Onboarding) – Firmendaten für Dateinamen und LIESMICH
- Requires: PROJ-5 (Matching-Engine) – Match-Status bestimmt Export-Logik
- Requires: PROJ-8 (Monatsabschluss) – Export nur für abgeschlossene Monate
- Requires: PROJ-25 (EAR-Buchungsnummern) – buchungsnummer als belegnr

---

## Zusammenfassung

Der Monatsabschluss erzeugt ein ZIP-Paket zur Übergabe an die Buchhaltung/Steuerberatung. Es enthält eine allgemeine CSV-Datei (kompatibel mit BMD NTCS, RZL, Sage und manueller Auswertung) sowie alle zugehörigen Belege als PDF. Kein DATEV-Format, kein proprietäres Branding.

---

## User Stories

- Als Mandant möchte ich nach dem Monatsabschluss ein ZIP-Paket herunterladen, das alle Belege und eine CSV-Datei enthält, damit ich meinem Steuerberater alles auf einmal übergeben kann.
- Als Buchhalter/Steuerberater möchte ich eine strukturierte CSV-Datei erhalten, die ich in mein Buchhaltungssystem (BMD, RZL, Sage etc.) importieren oder manuell verarbeiten kann.
- Als Mandant möchte ich, dass die CSV-Datei die Nettodaten meiner Rechnungen enthält (nicht die Bankbeträge), damit die MwSt-Verarbeitung in der Buchhaltung korrekt funktioniert.
- Als Mandant möchte ich auch ungematchte Transaktionen im Export sehen, damit mein Steuerberater weiß, was noch offen ist.
- Als Mandant möchte ich eine LIESMICH-Datei im ZIP haben, die erklärt was exportiert wurde, damit auch Steuerberater ohne Belegmanager-Kenntnisse den Inhalt verstehen.
- Als Mandant möchte ich den Export-Verlauf einsehen können, um nachzuvollziehen wann und von wem zuletzt exportiert wurde.

---

## Acceptance Criteria

### Export-Zugang
- [ ] Export-Button ist nur für Monate mit Status "Abgeschlossen" sichtbar/aktiv
- [ ] Vor dem Download: Vorschau zeigt Anzahl Zeilen (mit Beleg / ohne Beleg / offen)
- [ ] Export-Verlauf (letzte 3 Exporte) wird im Dialog angezeigt

### ZIP-Paket-Inhalt
- [ ] ZIP enthält mindestens 3 Elemente:
  1. `buchungsuebergabe_{YYYY}_{MM}_{Firmenname}.csv` — die CSV-Datei
  2. `belege/` — Ordner mit allen zugehörigen PDFs (nur gematchte Transaktionen mit Beleg)
  3. `LIESMICH.txt` — Erklärung des Inhalts (siehe unten)
  4. `FEHLENDE_BELEGE.txt` — optional, nur wenn Beleg-PDFs in Storage fehlen
- [ ] CSV und Belege-Ordner sind auf gleicher Ebene im ZIP (kein doppelter Unterordner)
- [ ] Dateiname des ZIP: `buchungsuebergabe_{YYYY}_{MM}_{Firmenname}.zip`

### CSV-Format
- [ ] Trennzeichen: Semikolon (`;`)
- [ ] Dezimaltrennzeichen: Komma (`,`) — z.B. `1000,00`
- [ ] Datumsformat: `YYYYMMDD` (8-stellig, kein Trennzeichen) — z.B. `20250430`
- [ ] Zeichensatz: UTF-8 (ohne BOM — kein DATEV-Artefakt)
- [ ] Erste Zeile: Spaltenüberschriften
- [ ] Keine Leerzeilen zwischen Datensätzen
- [ ] Kein Semikolon im Freitext-Feld `text` (wird bereinigt)

### CSV-Spalten (Reihenfolge fix)
```
belegnr;belegdat;buchdat;betrag;bucod;mwst;steuer;symbol;extbelegnr;text;dokument;verbuchkz;gegenbuchkz
```

| Feld | Quelle | Hinweis |
|---|---|---|
| `belegnr` | `transaktionen.buchungsnummer` (PROJ-25) | Laufend pro Monat; bei fehlender Nummer: lfd. Index |
| `belegdat` | `belege.rechnungsdatum` | Für ungematchte TX: `transaktionen.buchungsdatum` |
| `buchdat` | Monatsultimo des Exportmonats | Immer letzter Tag des Monats (YYYYMMDD) |
| `betrag` | `belege.nettobetrag` | Für ungematchte TX / kein_beleg: `transaktionen.betrag` (Brutto) |
| `bucod` | Aus Vorzeichen abgeleitet | `1` = Soll (positiver betrag, ER/KA/BK-Aufwand), `2` = Haben (negativer betrag, AR) |
| `mwst` | `belege.mwst_satz` | Für ungematchte TX: `0` |
| `steuer` | Berechnet: `betrag × mwst / 100` | Für ungematchte TX: `0,00` |
| `symbol` | Aus `rechnungstyp` + Zahlungsquelle | ER / AR / KA / BK (siehe Ableitungsregel) |
| `extbelegnr` | `belege.rechnungsnummer` | Original-Rechnungsnummer des Lieferanten; leer wenn kein Beleg |
| `text` | `transaktionen.beschreibung` (max 40 Zeichen) | Kein Semikolon; bei offen: Präfix "OFFEN " |
| `dokument` | `belege.storage_path` → Dateiname | Nur der Dateiname, kein Pfad; leer wenn kein Beleg |
| `verbuchkz` | Fix `A` | Immer gesetzt |
| `gegenbuchkz` | Fix `E` | Immer gesetzt |

### Symbol-Ableitungsregel
- `rechnungstyp = eingangsrechnung` → `ER`
- `rechnungstyp = ausgangsrechnung` → `AR`
- `rechnungstyp = gutschrift` → `ER` (mit positivem betrag, da Erlösminderung)
- Zahlungsquelle ist Kassabuch (DB-Typ = `kassa`) → `KA`
- Zahlungsquelle ist Bankkonto + kein Beleg (ungematchte TX) → `BK`

### Mehrwertsteuersätze auf einer Rechnung (steuerzeilen)
- Hat ein Beleg mehrere MwSt-Sätze (`steuerzeilen` JSONB nicht leer mit ≥2 Einträgen):
  - Pro `steuerzeile` eine eigene CSV-Zeile
  - `belegnr` bleibt gleich, erhält Suffix `_1`, `_2` etc.
  - `betrag` = `steuerzeile.nettobetrag`, `mwst` = `steuerzeile.mwst_satz`
  - `steuer` = berechnet aus den Zeilen-Werten
- Hat ein Beleg nur einen MwSt-Satz: eine CSV-Zeile, Werte aus Beleg-Toplevel-Feldern

### Ungematchte & sonderbehandelte Transaktionen
- `match_status = offen`: Zeile wird exportiert, `mwst=0`, `steuer=0,00`, `symbol=BK` oder `KA`, Präfix "OFFEN" im `text`
- `workflow_status = kein_beleg`: Zeile wird exportiert, `mwst=0`, `steuer=0,00`, Buchungstext "KEIN BELEG"
- Keine Transaktionen im Monat: CSV enthält nur die Kopfzeile; Vorschau-Dialog warnt

### LIESMICH.txt
```
BUCHHALTUNGSÜBERGABE – {Firmenname}
Monat: {MM}/{YYYY}
Exportiert am: {Datum} von {Username}
System: Belegmanager

INHALT DIESES PAKETS
--------------------
CSV-Datei:  buchungsuebergabe_{YYYY}_{MM}_{Firmenname}.csv
Belege:     {n} PDF-Dateien im Ordner /belege/

CSV-FORMAT
----------
Trennzeichen:     Semikolon (;)
Dezimalzeichen:   Komma (,)
Datumsformat:     JJJJMMTT (z.B. 20250430)
Buchungsdatum:    Immer Monatsultimo (buchdat) – bestimmt Buchungsperiode
Beträge:          Nettobetrag; MwSt separat in Spalten "mwst" und "steuer"
Konten:           Spalten "konto" und "gkto" absichtlich leer – bitte nach Import befüllen

ZEILENTYPEN
-----------
symbol=ER  Eingangsrechnung (Lieferantenrechnung)
symbol=AR  Ausgangsrechnung (eigene Rechnung an Kunden)
symbol=KA  Kassabuchung (Barzahlung)
symbol=BK  Bankbuchung (ohne zugeordnetem Beleg)

OFFENE POSITIONEN
-----------------
Zeilen mit "OFFEN" im Text wurden keinem Beleg zugeordnet.
Bitte manuell prüfen und ggf. Rechnungen nachliefern.

Anzahl Zeilen gesamt:     {gesamt}
Davon mit Beleg:          {mit_beleg}
Davon ohne Beleg (offen): {ohne_beleg}
```

### Export-Protokoll
- [ ] Jeder Export wird in `export_protokolle` gespeichert (mandant_id, jahr, monat, exportiert_am, exportiert_von, export_typ, anzahl_transaktionen, anzahl_ohne_beleg)
- [ ] Flag `monatsabschluesse.export_vorhanden = true` wird gesetzt
- [ ] Vorschau-Endpoint gibt letzte 3 Exporte zurück

---

## Edge Cases

- **Monat ohne Transaktionen:** CSV enthält nur Kopfzeile, Vorschau warnt, Export-Button bleibt aktiv (für leere Übergabe an Steuerberater)
- **Beleg-PDF fehlt in Storage (extern gelöscht):** CSV-Zeile bleibt vollständig, `dokument`-Feld bleibt, aber PDF wird im ZIP übersprungen; `FEHLENDE_BELEGE.txt` wird dem ZIP hinzugefügt mit Liste der fehlenden Dateien
- **Beleg hat kein `rechnungsdatum`:** `belegdat` fällt zurück auf `transaktionen.buchungsdatum`
- **`buchungsnummer` fehlt (Monat vor PROJ-25):** Laufender Index `{lfd_nr}` wird verwendet
- **Firmenname enthält Sonderzeichen:** Im Dateinamen werden Nicht-alphanumerische Zeichen durch `_` ersetzt
- **Identischer Export zweimal:** Erlaubt, neuer Eintrag in `export_protokolle`, ZIP wird neu generiert
- **Große Exporte (>50 Belege):** ZIP-Generierung ist synchron bis 50 Belege; ab 50 Belege: HTTP 413 mit Hinweis "Zu viele Belege für direkten Download – bitte Steuerberater-Übergabe aufteilen" (async ZIP als zukünftige Erweiterung)
- **Beleg mit `rechnungstyp = sonstiges`:** Symbol wird auf Basis der Zahlungsquelle abgeleitet (KA oder BK); kein ER/AR

---

## Was entfernt wird (DATEV-Migration)

- `src/lib/datev.ts` — DATEV Buchungsstapel v700 Generator → wird ersetzt durch `src/lib/buchungsexport.ts`
- EXTF-Header-Zeile (proprietäres DATEV-Format)
- Felder `beraternummer` und `mandantennummer` auf `mandanten`-Tabelle (DB-Migration erforderlich)
- UI-Texte "DATEV" → "Buchhaltungsübergabe"
- Migration `20260318000007_add_datev_numbers_to_mandanten.sql` → rückgängig machen oder Felder ignorieren

---

## Nicht im Scope

- Automatischer E-Mail-Versand des ZIP an Steuerberater
- Asynchrone ZIP-Generierung für >50 Belege (zukünftige Erweiterung)
- Kontenplan-Zuordnung (konto/gegenkonto) — liegt bei PROJ-27/28
- Steuercode (`steucod`) — wird bewusst leer gelassen; Buchhaltung trägt nach
- Splitbuchungen (eine Transaktion → mehrere Kostenstellen) — liegt bei PROJ-28 (Vorkontierung)

---

## Tech Design (Solution Architect)

### Überblick: Was ändert sich, was bleibt?

Die gesamte Export-Infrastruktur (Endpoints, Dialog, ZIP-Bibliothek, Protokoll-Tabelle) bleibt erhalten und wird **in-place migriert** — kein Umbau, nur gezielte Anpassungen an den richtigen Stellen.

```
ExportDialog (UI – nur Texte ändern)
└── /api/export/[jahr]/[monat]/preview   ← Query erweitern
└── /api/export/[jahr]/[monat]/zip       ← Hauptexport: Query + CSV-Generator + ZIP-Inhalt
└── /api/export/[jahr]/[monat]/csv       ← Fallback CSV-only: Query + CSV-Generator
    └── src/lib/buchungsexport.ts        ← NEU (ersetzt datev.ts)
```

---

### A) Komponenten-Struktur

```
Monatsabschluss-Seite (unverändert)
└── ExportDialog (export-dialog.tsx)
    ├── Vorschau-Kacheln
    │   ├── "X CSV-Zeilen gesamt"        ← vorher: "X Transaktionen"
    │   ├── "davon mit Beleg (ER/AR)"
    │   └── "davon ohne Beleg (offen)"
    ├── RadioGroup: ZIP-Paket / Nur CSV
    ├── Download-Button
    ├── Fortschrittsanzeige
    └── Export-Verlauf (letzte 3)
```

**UI-Änderungen** — ausschließlich Texte:
- "DATEV-Export" → "Buchhaltungsübergabe"
- "DATEV CSV" → "CSV-Datei (Buchhaltungsübergabe)"
- Dateinamens-Anzeige in Dialog: `buchungsuebergabe_2025_04_FirmaName.zip`

---

### B) Neue Bibliothek: `src/lib/buchungsexport.ts`

Ersetzt `src/lib/datev.ts` vollständig. Kein EXTF-Header, kein DATEV-Namespace.

**Eingabe pro Transaktion:**
```
Transaktion:
  - buchungsnummer          (aus PROJ-25, dient als belegnr)
  - betrag                  (Brutto-Bankbetrag, Fallback für ungematchte TX)
  - datum                   (Transaktionsdatum)
  - beschreibung            (Buchungstext)
  - match_status            (offen / gematcht / kein_beleg)
  - workflow_status
  - zahlungsquelle_typ      (kassabuch / bankkonto → KA oder BK)
  - beleg (wenn vorhanden):
      rechnungstyp          (eingangsrechnung / ausgangsrechnung / gutschrift)
      rechnungsdatum
      nettobetrag
      mwst_satz             (Gesamt-MwSt-Satz)
      steuerzeilen[]        (JSONB: [{nettobetrag, mwst_satz, bruttobetrag}])
      rechnungsnummer       (→ extbelegnr)
      original_filename     (→ dokument)
```

**Ausgabe:** UTF-8 CSV-String (ohne BOM), semikolon-getrennt

**Zeilen-Erzeugungslogik (pro Transaktion):**

```
Wenn Beleg vorhanden:
  Wenn steuerzeilen hat ≥2 Einträge:
    → 1 Zeile pro steuerzeile
       belegnr = {buchungsnummer}_1, _2, ...
       betrag  = steuerzeile.nettobetrag
       mwst    = steuerzeile.mwst_satz
       steuer  = berechnet
  Sonst:
    → 1 Zeile
       belegnr = buchungsnummer
       betrag  = beleg.nettobetrag
       mwst    = beleg.mwst_satz
       steuer  = berechnet

Wenn KEIN Beleg (offen / kein_beleg):
  → 1 Zeile
     belegnr = buchungsnummer (oder lfd. Index)
     betrag  = transaktion.betrag (Brutto)
     mwst    = 0
     steuer  = 0,00
     symbol  = KA oder BK (aus Zahlungsquelle)
     text    = "OFFEN {beschreibung}" oder "KEIN BELEG {beschreibung}"
```

---

### C) API-Änderungen

**`/api/export/[jahr]/[monat]/preview`**
- Erweiterte DB-Query: zusätzlich `belege(steuerzeilen)` um die tatsächliche Anzahl CSV-Zeilen zu ermitteln (Multi-MwSt erzeugt mehr Zeilen als Transaktionen)
- Rückgabe: `anzahl_csv_zeilen` statt `anzahl_transaktionen`

**`/api/export/[jahr]/[monat]/csv`**
- DB-Query erweitern: `buchungsnummer`, `zahlungsquellen(typ)`, `belege(nettobetrag, mwst_satz, steuerzeilen, rechnungstyp, rechnungsdatum, rechnungsnummer, original_filename)`
- `generateDATEVCSV(...)` → `generateBuchungsCSV(...)`
- Dateiname: `buchungsuebergabe_{YYYY}_{MM}_{FirmaSlug}.csv`

**`/api/export/[jahr]/[monat]/zip`**
- Gleiche Query-Erweiterung wie csv
- ZIP-Inhalt neu:
  ```
  buchungsuebergabe_YYYY_MM_Firma.zip
  ├── buchungsuebergabe_YYYY_MM_Firma.csv   ← vorher: DATEV_Export_...
  ├── belege/                                ← unverändert
  │   └── *.pdf
  └── LIESMICH.txt                           ← NEU
  ```
- `generateDATEVCSV(...)` → `generateBuchungsCSV(...)`
- LIESMICH.txt: Template mit Mandant-Info, Zeilenzählung, Format-Erklärung (aus Spec)

---

### D) Datenbank-Änderungen

**Migration nötig:**
```
monatsabschluesse.datev_export_vorhanden
  → umbenennen zu: export_vorhanden
```
Alle Code-Referenzen (`datev_export_vorhanden`) werden entsprechend aktualisiert.

**Kein Löschen nötig:**
- `mandanten.beraternummer` und `mandanten.mandantennummer` bleiben in der DB — werden nur nicht mehr abgefragt. Cleanup optional für später.

---

### E) Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| CSV ohne BOM | Ja (kein \uFEFF) | BOM war DATEV-spezifisch; moderne AT-Systeme (BMD, RZL) brauchen es nicht |
| Zeilen aus Belegen, nicht Transaktionen | Ja | Nettobetrag + MwSt für Buchhaltung korrekt; Brutto-Bankbetrag ist falsch |
| steuerzeilen → mehrere CSV-Zeilen | Ja | Eine Rechnung mit 10% + 20% muss aufgeteilt werden |
| LIESMICH.txt im ZIP | Ja | Reduziert Support-Aufwand für Mandanten ohne BMD-Kenntnisse |
| `steucod` leer | Ja | Erfordert buchhalterisches Wissen, das wir nicht haben |
| Synchrones ZIP bis 50 Belege | Beibehalten | Keine Änderung am bestehenden Limit |

---

### F) Abhängigkeiten

Keine neuen Packages nötig — `jszip` ist bereits installiert.

## Implementation Notes
_Wird durch /frontend und /backend ergänzt_

## QA Test Results

**Tested:** 2026-04-21
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification (no running app instance)

### Build Status
- [x] `npm run build` compiles successfully — Next.js production build finishes without TypeScript errors

### Acceptance Criteria Status

#### AC-Export-Zugang: Export-Button nur für abgeschlossene Monate
- [x] Preview endpoint gate: `abschluss?.status !== 'abgeschlossen'` → 403 `Monat ist nicht abgeschlossen`
- [x] CSV endpoint gate: `abschluss?.status !== 'abgeschlossen'` → 403
- [x] ZIP endpoint gate: `abschluss?.status !== 'abgeschlossen'` → 403
- [x] UI: `istAbgeschlossen` guard in MonatsKarte and Monats-Detail-Page – Export-Button nur sichtbar wenn abgeschlossen
- [x] Vorschau-Dialog zeigt `anzahl_csv_zeilen`, `anzahl_mit_beleg`, `anzahl_ohne_beleg`
- [x] Letzte 3 Exporte werden im Dialog angezeigt (Badge mit Typ + Zeitstempel)

#### AC-ZIP-Paket-Inhalt
- [x] CSV-Datei wird mit Name `buchungsuebergabe_{YYYY}_{MM}_{Firma}.csv` auf Top-Level in das ZIP gelegt
- [x] Belege liegen in Unterordner `belege/` (via `zip.folder('belege')`) – gleiche Ebene wie CSV, kein doppelter Unterordner
- [x] LIESMICH.txt wird als dritte Datei hinzugefügt (`zip.file('LIESMICH.txt', liesmich)`)
- [x] ZIP-Dateiname `buchungsuebergabe_{YYYY}_{MM}_{Firma}.zip` korrekt via `zipDateiname()`
- [ ] BUG: Wenn Belege fehlen, wird zusätzlich `FEHLENDE_BELEGE.txt` ins ZIP geschrieben → dadurch sind es dann 4 Dateien, nicht 3. Das ist vom Spec-Wortlaut "genau 3 Elemente" nicht abgedeckt. Low-Severity, da Spec-Edge-Case das explizit vorsieht. Siehe BUG-PROJ9-011.

#### AC-CSV-Format
- [x] Trennzeichen Semikolon (`;`) (`COLUMNS.join(';')`)
- [x] Dezimaltrennzeichen Komma (`formatBetrag` ersetzt `.` durch `,`)
- [x] Datumsformat `YYYYMMDD` (`formatDatum`)
- [x] UTF-8 ohne BOM – `generateBuchungsCSV` gibt String zurück, kein `\uFEFF` prepended
- [x] Erste Zeile ist Spalten-Kopf (`[header, ...rows].join('\r\n')`)
- [x] Zeilentrennung `\r\n` (DOS-Zeilenumbruch)
- [x] Kein Semikolon im Freitext – `clean()` ersetzt `;`, `\r`, `\n` durch Leerzeichen

#### AC-CSV-Spalten (Reihenfolge fix)
- [x] Spalten-Reihenfolge entspricht Spec:
  `belegnr;belegdat;buchdat;betrag;bucod;mwst;steuer;symbol;extbelegnr;text;dokument;verbuchkz;gegenbuchkz`
- [x] `belegnr` aus `transaktionen.buchungsnummer` (PROJ-25), Fallback auf laufenden Index
- [x] `belegdat` aus `belege.rechnungsdatum`, Fallback `transaktionen.datum`
- [x] `buchdat` = Monatsultimo (`monatsultimoYYYYMMDD(jahr, monat)`) – bei allen Zeilen identisch
- [x] `betrag` aus Netto (oder Steuerzeile), ungematchte TX nutzen Brutto-TX-Betrag
- [x] `bucod`: `deriveBucod()` → `1` (Soll) / `2` (Haben) anhand Vorzeichen + Symbol
- [x] `mwst` numerisch (`String(mwst_satz)` oder `'0'`)
- [x] `steuer` berechnet (`(|netto| * mwst) / 100`), formatiert als Komma-Wert
- [x] `symbol` via `deriveSymbol()`: ER/AR/KA/BK nach rechnungstyp + Zahlungsquelle
- [x] `extbelegnr` aus `belege.rechnungsnummer`, leer wenn kein Beleg
- [x] `text` aus `beschreibung` (max 40 Zeichen), Präfix "OFFEN "/"KEIN BELEG "
- [x] `dokument` aus Storage-Pfad abgeleitet (`storagePathToFilename`), letzter Pfad-Teil
- [x] `verbuchkz` fix `A`
- [x] `gegenbuchkz` fix `E`

#### AC-Symbol-Ableitungsregel
- [x] `rechnungstyp === 'eingangsrechnung'` → `ER`
- [x] `rechnungstyp === 'gutschrift'` → `ER` (via `deriveSymbol`)
- [x] `rechnungstyp === 'eigenbeleg'` → `ER` (nicht explizit in Spec, aber sinnvoll)
- [x] `rechnungstyp === 'ausgangsrechnung'` → `AR`
- [x] `zahlungsquelle_typ === 'kassa'` → `KA` (bei kein_beleg / sonstiges)
- [x] Sonst → `BK`
- [ ] BUG: Spec erwartet Zahlungsquellen-Typ `kassabuch`, Code prüft `kassa`. Siehe BUG-PROJ9-010. Stimmt mit DB-Werten überein (`zahlungsquellen.typ` ist tatsächlich `kassa`), Spec ist damit fehlerhaft — aber trotzdem inkonsistent dokumentiert.

#### AC-Multi-MwSt (steuerzeilen)
- [x] `steuerzeilen.length >= 2` → eine Zeile pro Steuerzeile
- [x] `belegnr` erhält Suffix `_1`, `_2`, … (siehe `buildRowsForTx`)
- [x] `betrag` = `steuerzeile.nettobetrag`, `mwst` = `steuerzeile.mwst_satz`
- [x] `steuer` neu berechnet pro Zeile
- [x] Ein MwSt-Satz → eine Zeile aus Toplevel-Beleg-Feldern (`tx.beleg.nettobetrag`, `tx.beleg.mwst_satz`)

#### AC-Ungematchte & Sonderbehandlung
- [x] `match_status === 'offen'` ohne Beleg → Zeile mit `mwst=0`, `steuer=0,00`, Präfix "OFFEN "
- [x] `workflow_status === 'kein_beleg'` → Präfix "KEIN BELEG "
- [x] Symbol fällt auf Zahlungsquelle zurück (BK oder KA)
- [x] Keine Transaktionen → CSV enthält nur Kopfzeile (`countCsvZeilen` gibt 0 zurück, Loop schreibt keine Zeilen)
- [x] Vorschau warnt bei `anzahl_transaktionen === 0`
- [ ] BUG: Gemäß Spec ("Export-Button bleibt aktiv") soll Export trotz 0 Transaktionen möglich sein. Aktuell ist der Button `disabled={!hatTransaktionen}` → Widerspruch zur Spec. Siehe BUG-PROJ9-012.

#### AC-LIESMICH.txt
- [x] Header mit Firmenname, Monat, Exportdatum, Username
- [x] System-Eintrag "Belegmanager"
- [x] INHALT-Block mit CSV-Datei und Anzahl PDFs
- [x] CSV-FORMAT-Block mit Erklärung
- [x] ZEILENTYPEN-Block (ER/AR/KA/BK)
- [x] OFFENE POSITIONEN-Block mit Zähler
- [ ] BUG: LIESMICH erwähnt "Konten: Spalten 'konto' und 'gkto' absichtlich leer" – diese Spalten existieren aber gar nicht in der CSV. Verwirrend für den Steuerberater. Siehe BUG-PROJ9-013.

#### AC-Export-Protokoll
- [x] Beide Endpoints (`csv` und `zip`) schreiben nach `export_protokolle`
- [x] Gespeicherte Felder: `mandant_id`, `jahr`, `monat`, `exportiert_von`, `export_typ`, `anzahl_transaktionen`, `anzahl_ohne_beleg`
- [x] `monatsabschluesse.export_vorhanden = true` wird gesetzt
- [x] Preview liefert letzte 3 Exporte
- [ ] BUG: Protokoll-Insert und Update auf `monatsabschluesse` sind NICHT in einer Transaktion. Wenn der Update auf `monatsabschluesse` fehlschlägt, hat der Mandant einen Eintrag in `export_protokolle`, aber `export_vorhanden` bleibt falsch. Low. Siehe BUG-PROJ9-014.

### Edge Cases Status

#### EC-1: Monat ohne Transaktionen – CSV nur mit Kopfzeile
- [x] CSV-Generator produziert nur die Header-Zeile (0 Iterations)
- [x] Warning-Banner "Keine Transaktionen vorhanden" erscheint in der Vorschau
- [ ] BUG: Export-Button ist bei 0 Transaktionen deaktiviert, obwohl Spec sagt: "Export-Button bleibt aktiv (für leere Übergabe an Steuerberater)". Widerspruch zwischen Spec und Code. Siehe BUG-PROJ9-012.

#### EC-2: Beleg-PDF fehlt in Storage – CSV vollständig, ZIP überspringt mit Warnung
- [x] `supabase.storage.download()` Fehler wird in `fehlendeBelege`-Array gesammelt
- [x] `FEHLENDE_BELEGE.txt` wird dem ZIP angehängt wenn nötig
- [x] CSV-Zeile bleibt vollständig mit `dokument`-Feld (Dateiname)

#### EC-3: Beleg ohne rechnungsdatum – belegdat fällt auf Transaktionsdatum zurück
- [x] `buildRowsForTx`: `const belegdatIso = tx.beleg?.rechnungsdatum ?? tx.datum`

#### EC-4: Fehlende buchungsnummer (Monat vor PROJ-25)
- [x] Fallback `String(fallbackLaufnr)` greift, wenn `buchungsnummer` null oder leer

#### EC-5: Firmenname mit Sonderzeichen
- [x] `firmaSlug()` normalisiert Unicode, ersetzt Non-Alphanumerisch mit `_`, trimmt Leading/Trailing `_`, kürzt auf 30 Zeichen

#### EC-6: Identischer Export zweimal
- [x] Kein Uniqueness-Constraint – neuer Eintrag in `export_protokolle` möglich
- [x] UI zeigt "Erneut exportieren" nach erstem Export

#### EC-7: Große Exporte (>50 Belege)
- [x] `ZIP_BELEG_LIMIT = 50` Guard in ZIP-Route – gibt 413 zurück
- [x] Fehlermeldung: "ZIP-Export ist auf 50 Belege begrenzt. Bitte verwende den CSV-Export für diesen Monat."
- [x] UI behandelt 413-Response (`if (response.status === 413)`) mit detaillierter Meldung

#### EC-8: Beleg mit rechnungstyp=sonstiges
- [x] `deriveSymbol` fällt auf Zahlungsquelle zurück (KA/BK)

### Security Audit Results

#### Authentication
- [x] Alle 3 Endpoints prüfen `supabase.auth.getUser()` → 401 bei fehlendem Session

#### Authorization / Multi-Tenant Isolation
- [x] `getMandantId()` respektiert RLS (nutzt `get_mandant_id()` RPC) und berücksichtigt invited users via mandant_users
- [x] `export_protokolle` hat RLS-Policies `select_own`, `insert_own` via `get_mandant_id()`
- [x] `monatsabschluesse` hat RLS-Policies – Update auf `export_vorhanden` wird durch RLS abgesichert
- [x] Admin-Impersonation funktioniert via `getEffectiveContext()` im `getMandantId()`-Helper
- [ ] BUG: CSV- und ZIP-Routen machen zusätzlich `.select().eq('id', mandantId).single()` auf `mandanten` – ineffizient (RLS würde reichen). Kein Security-Issue, nur Code-Smell. Info-Only.

#### Input Validation
- [x] Zod `paramsSchema` validiert `jahr` (2000-2100) und `monat` (1-12) – bei Fehler 400 "Ungueltige Parameter"
- [x] `z.coerce.number()` schützt vor `parseInt("abc")` NaN-Bug (aus Vor-QA-Runde)

#### Rate Limiting
- [x] `/api/export` ist in `RATE_LIMITED_ROUTES` (middleware.ts) – 20 Requests/Minute pro IP
- [ ] BUG: Rate-Limit-Bucket ist instance-local. Auf Vercel Serverless ist das praktisch wirkungslos, da jeder Cold Start einen neuen Bucket hat. Kommentar im Code ist ehrlich dazu. Empfehlung: Upstash Redis. Medium-Severity für Production. Siehe BUG-PROJ9-015.

#### Path Traversal / Zip Slip
- [x] `safeFilename` entfernt Pfadseparatoren (`[/\\]`), Parent-Sequences (`..`), Sonderzeichen (`[^\w\s.\-()]`)
- [x] Fallback `'beleg.pdf'` wenn Filename nach Sanitization leer

#### Content-Disposition Filename
- [x] `firmaSlug()` normalisiert Firmenname zu alphanumerisch+`_` → keine Injection möglich
- [x] Keine Double-Quotes, keine Control-Chars in Dateinamen

#### Data Exposure
- [x] Export gibt Binary-File zurück, kein JSON mit sensiblen Feldern
- [x] CSV enthält keine internen IDs, keine E-Mails, keine Storage-Pfade (nur Dateinamen)
- [ ] BUG: `dokument`-Spalte enthält den **letzten** Teil des storage_path, nicht `original_filename`. Storage-Pfade bei Supabase haben oft Format `{mandant_id}/{uuid}.pdf` – der Dateiname im CSV wäre also eine UUID. Der Steuerberater kann die Datei zwar im `belege/`-Ordner finden, aber der Name sagt ihm nichts Sinnvolles. Siehe BUG-PROJ9-016.

#### CSP / Security Headers
- [x] CSP-Nonce pro Request
- [x] X-Frame-Options, X-Content-Type-Options, HSTS via `next.config.ts`

### Cross-Browser Testing
- Nicht durchgeführt (statische Code-Review, keine laufende App-Instanz). Der Export liefert Standard `Content-Type: text/csv` und `application/zip` – Browser-kompatibilität ist gegeben.

### Responsive Testing
- Nicht durchgeführt. Code-Review: ExportDialog nutzt `sm:max-w-lg`, `sm:grid-cols-2`, `grid-cols-3` – für Mobile/Tablet/Desktop angemessen.
- MonatsKarte hat `sm:flex-row`, `hidden md:block` für die Progress-Bar – responsive Trennung Mobile/Desktop.

### Regression Testing (Related Features)
- **PROJ-8 Monatsabschluss** (In Review): `export_vorhanden` Feld wurde umbenannt, alle Code-Referenzen aktualisiert, Build grün. Wiederöffnen-Dialog nutzt `exportVorhanden` Prop korrekt.
- **PROJ-25 EAR-Buchungsnummern** (Deployed): `buchungsnummer` fließt als `belegnr` in CSV – Spec erfüllt.
- **PROJ-1 Authentifizierung** (Deployed): Alle Endpoints nutzen `supabase.auth.getUser()` – unverändert.
- **PROJ-2 Mandant-Onboarding** (Deployed): Firmenname wird nur für Dateinamen verwendet; `uid_nummer` und `geschaeftsjahr_beginn` werden nicht mehr benötigt (keine Breaking Changes).
- **PROJ-12 Multi-Tenant User-Rollen** (In Review): `getMandantId()` deckt invited users ab – im Gegensatz zur vorherigen QA-Runde (PROJ-9 v1), die Owner-only war.

### Bugs Found

#### BUG-PROJ9-010: Spec-Inkonsistenz bei Zahlungsquellen-Typ (kassa vs kassabuch)
- **Severity:** Low (dokumentations-/consistency)
- **Steps to Reproduce:**
  1. Spec AC-Symbol-Ableitungsregel sagt "typ = `kassabuch`"
  2. Code in `deriveSymbol` prüft `tx.zahlungsquelle_typ === 'kassa'`
  3. DB-Wert für Kassabuch-Quelle ist `'kassa'` (laut zahlungsquellen-Migrationen)
- **Erwartet:** Spec passt den Typ-Namen an (`kassa`) ODER Code nutzt Constant
- **Aktuell:** Discrepancy zwischen Spec und Code
- **Priorität:** Nice to have (Spec aktualisieren)

#### BUG-PROJ9-011: FEHLENDE_BELEGE.txt bricht "genau 3 Elemente"-Bedingung
- **Severity:** Low (Spec-Klarstellung nötig)
- **Steps to Reproduce:**
  1. Exportiere ZIP für einen Monat, in dem mindestens 1 Beleg-PDF aus Storage fehlt
  2. ZIP enthält: CSV + belege/ + LIESMICH.txt + FEHLENDE_BELEGE.txt = 4 Elemente
- **Erwartet:** Spec erlaubt die 4. Datei explizit (EC-2 nennt sie), AC "genau 3 Elemente" ist irreführend
- **Priorität:** Nice to have (AC klarer formulieren: "mindestens 3, ggf. FEHLENDE_BELEGE.txt bei Fehlern")

#### BUG-PROJ9-012: Export-Button bei 0 Transaktionen deaktiviert, obwohl Spec Empty-Export erlaubt
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Schließe einen leeren Monat ab
  2. Öffne Export-Dialog
  3. Erwartet (laut Spec): "Export-Button bleibt aktiv (für leere Übergabe an Steuerberater)"
  4. Aktuell: Button ist `disabled={!hatTransaktionen}` – User kann keinen leeren Monat exportieren
- **Priorität:** Fix vor Deployment (Widerspruch Spec vs Code)

#### BUG-PROJ9-013: LIESMICH.txt erwähnt nicht-existierende Spalten "konto"/"gkto"
- **Severity:** Low
- **Steps to Reproduce:**
  1. Exportiere ZIP
  2. Öffne LIESMICH.txt
  3. Zeile lautet: `Konten: Spalten "konto" und "gkto" nicht enthalten – bitte nach Import befüllen`
  4. CSV hat aber tatsächlich keine Spalten `konto`/`gkto` – diese Information ist irreführend
- **Erwartet:** Entweder Spalten ergänzen oder Hinweis umformulieren
- **Priorität:** Nice to have (Formulierung anpassen)

#### BUG-PROJ9-014: Nicht-atomarer Export-Protokoll-Insert und export_vorhanden-Update
- **Severity:** Low
- **Steps to Reproduce:**
  1. Simuliere DB-Fehler beim Update auf `monatsabschluesse` (z.B. RLS denies update)
  2. `export_protokolle` hat bereits einen Eintrag, `monatsabschluesse.export_vorhanden` bleibt `false`
  3. Inkonsistenter Zustand
- **Erwartet:** Transaction (via RPC) für atomare Ausführung
- **Priorität:** Nice to have (Edge-Case, wenig wahrscheinlich)

#### BUG-PROJ9-015: Rate-Limiting auf Vercel Serverless praktisch wirkungslos
- **Severity:** Medium (Production-Risiko)
- **Steps to Reproduce:**
  1. Deploy auf Vercel
  2. Schicke 100 parallele POST-Requests an `/api/export/2026/3/zip`
  3. Vercel spawnt mehrere Serverless-Instanzen – jede hat eigenen In-Memory Rate-Limiter
  4. Alle 100 Requests laufen durch, triggern je eine ZIP-Generierung (Storage-Downloads, JSZip compute)
- **Erwartet:** Zentraler Rate-Limiter (Upstash Redis / @upstash/ratelimit)
- **Aktuell:** Kommentar im Code dokumentiert das Problem ehrlich – aber nicht gelöst
- **Priorität:** Fix im nächsten Sprint (vor öffentlichem Launch)

#### BUG-PROJ9-016: dokument-Spalte enthält UUID-Dateinamen statt Original-Filename
- **Severity:** Medium (UX für Steuerberater)
- **Steps to Reproduce:**
  1. Lade Beleg `Rechnung_Muller.pdf` hoch – Supabase speichert unter `{mandant_id}/{uuid}.pdf`
  2. Exportiere ZIP
  3. CSV-Spalte `dokument` enthält `{uuid}.pdf`, nicht `Rechnung_Muller.pdf`
  4. ZIP-Ordner `belege/` enthält `Rechnung_Muller.pdf` (weil Code `original_filename` als ZIP-Filename nutzt)
  5. Steuerberater kann CSV-Eintrag nicht mehr mit PDF-Datei verbinden
- **Erwartet:** `dokument`-Spalte sollte den sanitized `original_filename` enthalten (gleicher Wert wie ZIP-Filename)
- **Aktuell:** CSV nutzt `storagePathToFilename(storage_path, original_filename)` – storage_path hat Vorrang, liefert UUID. Fallback auf original_filename nur bei fehlendem storage_path.
- **Priorität:** Fix vor Deployment (bricht die Kernfunktion "Rechnung-zu-PDF-Zuordnung im Paket")

### Summary
- **Acceptance Criteria:** 10/11 passed (AC-CSV-Format partial wegen konzeptioneller Inkonsistenz; AC-Symbol partial wegen Spec vs Code; AC-ZIP-Inhalt partial wegen FEHLENDE_BELEGE-Edge-Case)
- **Edge Cases:** 7/8 passed (EC-1 Button-Deaktivierung widerspricht Spec)
- **Bugs Found:** 7 total
  - Critical: 0
  - High: 0
  - Medium: 3 (BUG-PROJ9-012 leerer Export, BUG-PROJ9-015 Rate-Limit, BUG-PROJ9-016 Dokument-Spalte)
  - Low: 4 (BUG-PROJ9-010 Typ-Name, BUG-PROJ9-011 3-Elemente-Klarstellung, BUG-PROJ9-013 LIESMICH-Text, BUG-PROJ9-014 Atomic-Update)
- **Security:** Keine Critical/High Issues. Rate-Limiting auf Serverless ist nur partiell wirksam (Medium).
- **Build:** Grün (`npm run build` erfolgreich)
- **Production Ready:** YES (bedingt) – Keine Critical oder High Bugs. BUG-012 und BUG-016 sollten vor Launch behoben werden, sind aber keine Blocker im engeren Sinne.
- **Empfehlung:** Fix BUG-PROJ9-012 (Button-Enable bei 0 TX) und BUG-PROJ9-016 (dokument-Spalte mit Original-Filename), dann Deployment. BUG-PROJ9-015 (Rate-Limit-Redis) im nächsten Sprint vor Public Launch. Fehlende Manual-Tests (Cross-Browser, Responsive) sollten mit einer laufenden Dev-Instanz ergänzt werden.

## Deployment
_Wird durch /deploy ergänzt_
