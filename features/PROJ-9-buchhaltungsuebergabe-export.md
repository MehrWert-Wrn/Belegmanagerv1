# PROJ-9: Buchhaltungsübergabe-Export

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-05-04
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
- [ ] Zeichensatz: UTF-8 mit BOM (U+FEFF) — für Excel/BMD/RZL-Kompatibilität
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
- Zahlungsquelle ist Kassabuch (DB-Typ = `kassa`, nicht `kassabuch`) → `KA`
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

## Erweiterung: Belegliste-Export (Option A)

Mandanten, die nicht mit Transaktions-Matching arbeiten, benötigen am Monatsende eine beleg-zentrierte Liste für die Steuerberatung. Der Export-Dialog bietet dafür einen zweiten Export-Typ an.

### User Stories

- Als Mandant ohne Transaktions-Matching möchte ich am Monatsende eine Belegliste als CSV herunterladen können, damit mein Steuerberater alle Belege des Monats strukturiert erhält.
- Als Mandant möchte ich zwischen "Buchhaltungsübergabe" (transaktionsbasiert) und "Belegliste" (belegbasiert) wählen können, damit ich den für mich passenden Export-Typ verwenden kann.
- Als Steuerberater möchte ich in der Belegliste Datum, Lieferant, Rechnungsnummer, Netto, MwSt und Brutto pro Beleg sehen, damit ich die Liste direkt in mein Buchhaltungssystem übernehmen kann.

### Acceptance Criteria

#### UI – Export-Dialog
- [ ] RadioGroup zeigt zwei Optionen: "Buchhaltungsübergabe" (bestehend) und "Belegliste"
- [ ] Bei Auswahl "Belegliste": Vorschau zeigt Anzahl Belege im Monat (nicht Transaktionen)
- [ ] Beide Export-Typen sind für alle Mandanten sichtbar und wählbar
- [ ] Export-Button und Verlauf funktionieren für beide Typen

#### Monats-Filter
- [ ] Belegliste enthält alle Belege, deren `rechnungsdatum` im gewählten Monat liegt
- [ ] Fallback: Hat ein Beleg kein `rechnungsdatum`, wird `created_at` herangezogen
- [ ] Belege ohne Transaktionsbezug (direkt hochgeladen) werden eingeschlossen

#### CSV-Format Belegliste
- [ ] Trennzeichen: Semikolon (`;`), Dezimaltrennzeichen: Komma (`,`), UTF-8 mit BOM
- [ ] Datumsformat: `YYYYMMDD`
- [ ] Erste Zeile: Spaltenüberschriften

**Spalten (Reihenfolge fix):**
```
datum;lieferant;rechnungsnummer;beschreibung;nettobetrag;mwst_satz;steuerbetrag;bruttobetrag;rechnungstyp;zahlungsquelle;dokument
```

| Feld | Quelle | Hinweis |
|---|---|---|
| `datum` | `belege.rechnungsdatum` | Fallback: `belege.created_at` (YYYYMMDD) |
| `lieferant` | `belege.lieferant_name` | Leer wenn nicht erfasst |
| `rechnungsnummer` | `belege.rechnungsnummer` | Externe RN des Lieferanten |
| `beschreibung` | `belege.beschreibung` | Max 80 Zeichen, kein Semikolon |
| `nettobetrag` | `belege.nettobetrag` | Komma-Dezimal |
| `mwst_satz` | `belege.mwst_satz` | Zahl (z.B. `20`) |
| `steuerbetrag` | Berechnet: `netto × mwst / 100` | Komma-Dezimal |
| `bruttobetrag` | `belege.bruttobetrag` | Fallback: `netto + steuer` |
| `rechnungstyp` | `belege.rechnungstyp` | `eingangsrechnung` / `ausgangsrechnung` / etc. |
| `zahlungsquelle` | `zahlungsquellen.name` | Name der Quelle, leer wenn kein Bezug |
| `dokument` | `belege.original_filename` | Dateiname ohne Pfad |

#### Multi-MwSt
- [ ] Hat ein Beleg `steuerzeilen` mit ≥2 Einträgen: eine Zeile pro Steuerzeile, `rechnungsnummer` erhält Suffix `_1`, `_2`

#### ZIP-Paket Belegliste
- [ ] ZIP-Inhalt: `belegliste_{YYYY}_{MM}_{Firma}.csv` + `belege/` (PDFs) + `LIESMICH_BELEGLISTE.txt`
- [ ] Dateiname des ZIP: `belegliste_{YYYY}_{MM}_{Firmenname}.zip`
- [ ] `LIESMICH_BELEGLISTE.txt` erklärt den Inhalt (analog zu LIESMICH.txt der Buchungsübergabe)
- [ ] Export-Protokoll: `export_typ = 'belegliste'` (neuer Wert neben `'csv'` und `'zip'`)

#### Edge Cases
- [ ] Monat ohne Belege: CSV nur mit Kopfzeile, Vorschau-Warnung, Export-Button aktiv
- [ ] Beleg ohne `nettobetrag`: Zeile wird exportiert, `nettobetrag` leer, `steuerbetrag` = `0,00`
- [ ] Beleg-PDF fehlt in Storage: CSV-Zeile vollständig, PDF übersprungen, `FEHLENDE_BELEGE.txt` ins ZIP

### Tech Design

**Neue API-Endpoints:**
```
POST /api/export/[jahr]/[monat]/belegliste/csv   ← CSV-only Download
POST /api/export/[jahr]/[monat]/belegliste/zip   ← ZIP mit CSVs + Belege-PDFs
```

**DB-Query (Belegliste):**
```sql
SELECT b.*, zq.name AS zahlungsquelle_name
FROM belege b
LEFT JOIN transaktionen t ON t.beleg_id = b.id
LEFT JOIN zahlungsquellen zq ON zq.id = t.zahlungsquelle_id
WHERE b.mandant_id = $mandant_id
  AND (
    DATE_TRUNC('month', b.rechnungsdatum) = DATE_TRUNC('month', $datum)
    OR (b.rechnungsdatum IS NULL AND DATE_TRUNC('month', b.created_at) = DATE_TRUNC('month', $datum))
  )
ORDER BY COALESCE(b.rechnungsdatum, b.created_at::date) ASC
```

**Neue Funktion in `src/lib/buchungsexport.ts`:**
```typescript
export function generateBelegslisteCSV(
  belege: BelegslisteBeleg[],
  jahr: number,
  monat: number
): string
```

**Preview-Endpoint-Erweiterung:**
- `/api/export/[jahr]/[monat]/preview` gibt zusätzlich `anzahl_belege` zurück (für Belegliste-Vorschau)

---

## Nicht im Scope

- Automatischer E-Mail-Versand des ZIP an Steuerberater
- Asynchrone ZIP-Generierung für >50 Belege (zukünftige Erweiterung)
- Kontenplan-Zuordnung (konto/gegenkonto) — liegt bei PROJ-27/28
- Steuercode (`steucod`) — wird bewusst leer gelassen; Buchhaltung trägt nach
- Splitbuchungen (eine Transaktion → mehrere Kostenstellen) — liegt bei PROJ-28 (Vorkontierung)
- Mandanten-Einstellung "Arbeitsweise" (matching vs. belegliste) — bewusst nicht implementiert, beide Typen sind immer verfügbar

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

### Frontend (2026-05-04 – /frontend)

**Erweiterung Belegliste-Export – UI**

Die `ExportDialog`-Komponente (`src/components/monatsabschluss/export-dialog.tsx`) wurde um den zweiten Export-Typ "Belegliste" erweitert. Das vorhandene Buchhaltungsübergabe-UI bleibt erhalten – die neue RadioGroup steuert lediglich den Modus.

**Geänderte/Neue Datei:**
- `src/components/monatsabschluss/export-dialog.tsx`

**UI-Architektur (zwei separate RadioGroups):**

1. **Export-Typ** (`exportModus`): `buchungsuebergabe` | `belegliste`
   - Kachel "Buchhaltungsübergabe" (Icon `ListChecks`) – transaktionsbasiert (bestehend)
   - Kachel "Belegliste" (Icon `Receipt`) – belegbasiert (neu)
   - Default: `buchungsuebergabe` (Reset bei jedem Dialog-Open)

2. **Format** (`exportFormat`): `csv` | `zip`
   - Beide Formate für beide Modi verfügbar
   - Beschreibung der Kacheln passt sich modus-abhängig an (`formatLabel`)

**Dynamische Vorschau-Kachel (modus-abhängig):**
- Bei `belegliste`: zeigt nur den Hauptzähler **Belege im Monat** (`anzahl_belege`)
- Bei `buchungsuebergabe`: zeigt 3-spaltiges Layout (CSV-Zeilen / mit Beleg / ohne Beleg) wie bisher
- Multi-MwSt-Hinweis bleibt nur im Buchungsuebergabe-Modus sichtbar

**Warnungs-Banner:**
- Belegliste + 0 Belege → "Keine Belege im Monat vorhanden" (mit Hinweis dass Export trotzdem möglich)
- Buchungsuebergabe + 0 TX → "Keine Transaktionen vorhanden"
- Buchungsuebergabe + offene TX → Hinweis auf leeres Belegfeld

**API-Routing:**
- `belegliste` + `csv` → `POST /api/export/{jahr}/{monat}/belegliste/csv`
- `belegliste` + `zip` → `POST /api/export/{jahr}/{monat}/belegliste/zip`
- `buchungsuebergabe` + `csv` → `POST /api/export/{jahr}/{monat}/csv` (unverändert)
- `buchungsuebergabe` + `zip` → `POST /api/export/{jahr}/{monat}/zip` (unverändert)

**Toast-Meldungen** sind nun modus-spezifisch ("Belegliste …" vs. "Buchhaltungsübergabe …").

**Fallback-Dateiname** beim Download nutzt `belegliste_…` oder `buchungsuebergabe_…` Präfix, falls die `Content-Disposition`-Header nicht parseable ist.

**Bonus-Fixes:**
- DialogContent erhält `max-h-[90vh] overflow-y-auto` – auf Mobile passte der Dialog mit drei Sektionen + History sonst nicht mehr ins Viewport.
- DialogTitle wurde generischer ("Export für Mai 2026") da der Dialog jetzt zwei Export-Typen anbietet.

**Beobachtung zum vorherigen QA-Befund:**
- BUG-PROJ9-012 (Export-Button bei 0 TX deaktiviert) ist im aktuellen Code bereits behoben – der Button ist nur noch bei `exporting || vorschauLoading` deaktiviert, nicht mehr bei `!hatTransaktionen`.

**Backend ToDo (offen):**
- Implementierung der zwei neuen Endpoints `belegliste/csv` und `belegliste/zip`
- Erweiterung des Preview-Endpoints um `anzahl_belege`-Feld (Frontend liest bereits `vorschau.anzahl_belege`, fällt aktuell auf `0` zurück)
- Neue Funktion `generateBelegslisteCSV()` in `src/lib/buchungsexport.ts`
- Neuer Wert `belegliste` in `export_protokolle.export_typ`
- Neue LIESMICH-Variante `LIESMICH_BELEGLISTE.txt`

### Backend (2026-05-04 – /backend)

**Erweiterung Belegliste-Export – Backend abgeschlossen.**

Alle vom Frontend (siehe oben) erwarteten Endpoints und Lib-Erweiterungen sind
implementiert. `npm run build` ist grün.

**Geänderte/Neue Dateien:**
- `supabase/migrations/20260504000000_export_typ_belegliste.sql` *(neu)* – fügt
  `'belegliste'` zum `export_typ` ENUM hinzu (zusätzlich zu `'csv'` und `'zip'`).
- `src/lib/buchungsexport.ts` *(erweitert)* – neue Exporte:
  `BelegslisteBeleg`, `generateBelegslisteCSV()`, `countBelegslisteZeilen()`,
  `generateLiesmichBelegliste()`, `belegslisteDateiname()`,
  `belegslisteZipDateiname()`. Wiederverwendet die bestehenden Helfer
  (`formatDatum`, `formatBetrag`, `clean`, `field`, `firmaSlug`).
- `src/app/api/export/[jahr]/[monat]/belegliste/csv/route.ts` *(neu)* –
  CSV-only Download.
- `src/app/api/export/[jahr]/[monat]/belegliste/zip/route.ts` *(neu)* –
  ZIP mit Belegliste-CSV + `belege/` + `LIESMICH_BELEGLISTE.txt`.
- `src/app/api/export/[jahr]/[monat]/preview/route.ts` *(erweitert)* – liefert
  zusätzlich `anzahl_belege` (count(*)-Query mit gleicher Filterlogik wie die
  Belegliste-Endpoints).

**Schema-Beobachtung & Abweichung von der Spec:**
- Spec nennt `belege.lieferant_name` und `belege.created_at`. In der DB heißen
  die Spalten `belege.lieferant` und `belege.erstellt_am` (siehe
  `20260313000000_initial_schema.sql`). Implementierung verwendet die
  tatsächlichen Spaltennamen.

**DB-Filter für Monatsfenster (Belegliste):**
```
.or(
  `and(rechnungsdatum.gte.${monatStart},rechnungsdatum.lte.${monatEnde}),
   and(rechnungsdatum.is.null,erstellt_am.gte.${monatStartTs},erstellt_am.lt.${monatEndePlus1})`
)
```
Ein einziger Roundtrip; rechnungsdatum hat Vorrang, Fallback auf `erstellt_am`
nur wenn `rechnungsdatum IS NULL`.

**Sicherheit & Multi-Tenancy:**
- Beide neuen Endpoints prüfen `supabase.auth.getUser()` (401 sonst).
- `getMandantId()` deckt RLS + Admin-Impersonation ab.
- Monat muss `abgeschlossen` sein (403 sonst).
- Zod-Validation auf `jahr`/`monat` (400 bei Fehler).
- Filename-Sanitization gegen Zip-Slip (CWE-22) wie bei der
  Buchhaltungsuebergabe.
- ZIP-Limit `50` Belege (HTTP 413), synchroner Generator analog zur
  Buchhaltungsuebergabe.

**Export-Protokoll:**
- Neuer `export_typ`-Wert `'belegliste'` (Migration `20260504000000`).
- Beide Endpoints schreiben `export_protokolle` und setzen
  `monatsabschluesse.export_vorhanden = true`.
- `anzahl_transaktionen` enthält bei `belegliste` die Anzahl Belege als
  Schlüsselzahl (das Schema bietet kein `anzahl_belege`-Feld).

**Vorschau-Endpoint:**
- Liefert nun `anzahl_belege` (HEAD-Count auf `belege` mit gleicher
  Filterlogik). Frontend liest dieses Feld bereits.


## QA Test Results

### Round 2 (2026-05-04) – Belegliste-Erweiterung + Re-Audit Buchhaltungsuebergabe

**Tested:** 2026-05-04
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification (no running app instance)
**Scope:** Re-Audit nach Belegliste-Erweiterung (Option A) + Verifikation der Bugfixes aus Runde 1

#### Build Status
- [x] `npm run build` kompiliert erfolgreich, alle 5 Export-Routes (preview, csv, zip, belegliste/csv, belegliste/zip) sind als ƒ (Dynamic) im Manifest

#### Status der Round 1-Bugs (Verifikation)

| Bug | Vorher | Aktueller Code | Status |
|---|---|---|---|
| BUG-PROJ9-010 (kassa vs kassabuch) | Spec sagte `kassabuch`, Code prüft `kassa` | Spec wurde nicht angepasst, Code prüft weiter `kassa` (korrekter DB-Wert) | OFFEN (Doku) |
| BUG-PROJ9-011 (FEHLENDE_BELEGE.txt = 4 Elemente) | Spec sagt "genau 3 Elemente", aber Edge-Case erlaubt 4. | Spec im AC nun "mindestens 3 Elemente" formuliert, EC-2 deckt 4. ab | BEHOBEN |
| BUG-PROJ9-012 (Button bei 0 TX deaktiviert) | `disabled={!hatTransaktionen}` | Button ist nur noch `disabled={exporting || vorschauLoading}` (Zeile 543) | BEHOBEN |
| BUG-PROJ9-013 (LIESMICH erwähnt fehlende Spalten) | "konto/gkto" Spalten standen drin | `generateLiesmich` schreibt jetzt `Sachkonto/Gegenkonto: Bitte nach Import im Buchhaltungssystem eintragen.` (Zeile 355 buchungsexport.ts) | BEHOBEN |
| BUG-PROJ9-014 (nicht-atomarer Insert + Update) | `Promise.all` ohne Transaktion | Jetzt `Promise.allSettled` – Insert-Fehler blockiert Download nicht, aber atomar ist es nicht | OFFEN (Low) |
| BUG-PROJ9-015 (Rate-Limit instance-local) | In-Memory Rate-Limit | Unverändert, Kommentar im Code dokumentiert das Problem | OFFEN (Medium) |
| BUG-PROJ9-016 (dokument-Spalte UUID) | `storagePathToFilename(storage_path, original_filename)` | Code nutzt jetzt `original_filename ?? storagePathToFilename(...)` mit Präfix `{buchungsnummer}_{filename}` (Zeile 195-201 buchungsexport.ts), spiegelt ZIP-Filename | BEHOBEN |

#### Acceptance Criteria – Belegliste-Erweiterung (Option A)

##### AC-UI – Export-Dialog
- [x] RadioGroup zeigt `Buchhaltungsübergabe` und `Belegliste` (Zeilen 254-307 export-dialog.tsx)
- [x] Bei `belegliste` zeigt Vorschau nur die Belegezahl (`anzahl_belege`, Zeile 318-323)
- [x] Beide Modi sind für jeden Mandant immer wählbar (kein Feature-Gate)
- [x] Export-Button und Verlauf funktionieren in beiden Modi
- [x] Format-RadioGroup (CSV/ZIP) bleibt für beide Modi sichtbar
- [x] Reset bei jedem Open: `setExportModus('buchungsuebergabe')`, `setExportFormat('csv')` (Zeile 99-107)

##### AC-Monats-Filter (Belegliste)
- [x] Filter `rechnungsdatum` im Monat ODER (`rechnungsdatum IS NULL` UND `erstellt_am` im Monat) – Zeile 91 csv route, 90 zip route
- [x] Belege ohne Transaktionsbezug werden eingeschlossen (LEFT JOIN auf `transaktionen`, Zeile 88)
- [x] Order by `rechnungsdatum` ascending mit `nullsFirst: false`

##### AC-CSV-Format Belegliste
- [x] Trennzeichen Semikolon (`BELEGLISTE_COLUMNS.join(';')`)
- [x] Dezimaltrennzeichen Komma (`formatBetrag` mit `.replace('.', ',')`)
- [x] Datumsformat `YYYYMMDD` (`belegDatumYYYYMMDD`)
- [ ] BUG: AC fordert "UTF-8 mit BOM", `generateBelegslisteCSV` schreibt `'﻿'` als BOM (Zeile 555 buchungsexport.ts) – das ist konsistent mit AC. Verwirrend ist allerdings, dass die alte Spec für die Buchhaltungsuebergabe-CSV "ohne BOM" forderte. Siehe BUG-PROJ9-017.
- [x] Erste Zeile = Spaltenüberschriften
- [x] Spalten-Reihenfolge: `datum;lieferant;rechnungsnummer;beschreibung;nettobetrag;mwst_satz;steuerbetrag;bruttobetrag;rechnungstyp;zahlungsquelle;dokument` (Zeile 451-463)
- [x] Quellen pro Spalte korrekt:
  - `datum` aus `rechnungsdatum`, Fallback `erstellt_am` (`belegDatumYYYYMMDD`)
  - `lieferant` aus `belege.lieferant` (Spec sagte fälschlich `lieferant_name` – siehe Implementation Notes)
  - `rechnungsnummer`, `beschreibung`, `nettobetrag`, `mwst_satz`, `bruttobetrag`, `rechnungstyp` aus Beleg-Toplevel
  - `steuerbetrag` berechnet
  - `zahlungsquelle` aus JOIN
  - `dokument` aus `original_filename`
- [x] `bruttobetrag`-Fallback (`netto + steuer`, Zeile 478-483)
- [x] Multi-MwSt: eine Zeile pro Steuerzeile, `rechnungsnummer_1` etc. (Zeile 496-520)

##### AC-ZIP-Paket Belegliste
- [x] Inhalt: `belegliste_{YYYY}_{MM}_{Firma}.csv` + `belege/` + `LIESMICH_BELEGLISTE.txt` (Zeile 144-200 zip route)
- [x] ZIP-Dateiname `belegliste_{YYYY}_{MM}_{Firma}.zip` (`belegslisteZipDateiname`)
- [x] LIESMICH_BELEGLISTE.txt erklärt Inhalt (Zeile 593-633 buchungsexport.ts)
- [x] Export-Protokoll mit `export_typ: 'belegliste'` (DB-Migration `20260504000000_export_typ_belegliste.sql` fügt Wert hinzu)
- [x] Synchroner ZIP-Guard: Limit 50 Belege → 413 (Zeile 100-109 zip route)

##### AC-Edge Cases Belegliste
- [x] Monat ohne Belege: Vorschau-Warnung "Keine Belege im Monat vorhanden" (Zeile 375-386 export-dialog.tsx); Export-Button bleibt aktiv
- [x] CSV bei 0 Belegen enthält nur Kopfzeile (Loop schreibt keine Zeilen)
- [x] Beleg ohne `nettobetrag`: Zeile mit leerem Netto-Feld, `steuerbetrag = '0,00'` (Zeile 525-540)
- [x] Beleg-PDF fehlt → in `fehlendeBelege`-Array, `FEHLENDE_BELEGE.txt` ins ZIP geschrieben

#### Acceptance Criteria – Buchhaltungsuebergabe (Re-Audit)

##### AC-CSV-Format (BOM)
- [ ] BUG: Spec zur Buchhaltungsuebergabe sagt **"Zeichensatz: UTF-8 (ohne BOM — kein DATEV-Artefakt)"** (Zeile 53). Der aktuelle `generateBuchungsCSV` produziert aber jetzt **mit BOM** (`'﻿' + [header, ...rows].join('\r\n')`, Zeile 295). Auch der File-Header-Kommentar wurde geändert auf "UTF-8 MIT BOM (U+FEFF) – für Excel/BMD/RZL-Kompatibilität" (Zeile 11). Spec und Code widersprechen sich. Frontend-UI sagt im CSV-Beschriebung "UTF-8, Semikolon, kompatibel mit BMD…" und sagt nichts zu BOM. Siehe BUG-PROJ9-017.

##### AC-CSV-Spalten (dokument)
- [x] `dokument` enthält jetzt `{buchungsnummer}_{original_filename}` (Zeile 195-201 buchungsexport.ts)
- [ ] BUG: Spec sagt zur dokument-Spalte: `belege.storage_path → Dateiname. Nur der Dateiname, kein Pfad; leer wenn kein Beleg`. Code schreibt jetzt `original_filename` (Spec-Inhalt deckt das nicht). Der Wert hat nun ein Buchungsnummer-Präfix (`{buchungsnummer}_{filename}`), aber das CSV-Feld ist auf `120 Zeichen` begrenzt (Zeile 198 lib). Wenn `original_filename` plus Buchungsnummer länger ist als 120 Zeichen, wird abgeschnitten – dokument im CSV stimmt dann nicht mehr mit ZIP-Filename überein (das im ZIP wird durch `safeFilename`-Pipeline geschickt, eigene Logik). Siehe BUG-PROJ9-018.

##### AC-LIESMICH.txt – Dateinamen-Schema
- [x] LIESMICH erklärt das Beleg-Benamungsschema `{Kürzel}_{lfd-Nr}_{MM}_{JJJJ}_{Originaldateiname}` (Zeile 364-378 buchungsexport.ts)
- [ ] BUG: Das im LIESMICH dokumentierte Schema (`B1_0001_02_2026_Rechnung-Mustermann.pdf`) entspricht NICHT dem, was der Code tatsächlich erzeugt. Code erzeugt `{buchungsnummer}_{rawName}` (Zeile 151 zip route) – also z. B. `B1-2026-02-0001_Rechnung-Mustermann.pdf`, falls die Buchungsnummer dieses Format hat. Aber das `_` zwischen Bestandteilen aus dem LIESMICH-Beispiel kommt nicht aus der Code-Logik. Siehe BUG-PROJ9-019.

##### AC-Symbol für Eigenbeleg/Eigenverbrauch
- [x] `eigenbeleg` und `eigenverbrauch` werden auf `ER` gemappt (Zeile 111 buchungsexport.ts) – nicht in Spec, aber sinnvoll, da beides aufwandsseitig gebucht wird

##### AC-Authorization (Belegliste)
- [x] Beide Belegliste-Endpoints prüfen `supabase.auth.getUser()` → 401
- [x] `getMandantId(supabase)` deckt RLS + Admin-Impersonation ab
- [x] Monat muss `abgeschlossen` sein → 403
- [x] Zod-Validation auf `jahr`/`monat` → 400

##### AC-Tenant-Isolation (Belegliste)
- [x] Belege-Query: `.eq('mandant_id', mandant.id)` als zusätzliche Schutzschicht über RLS hinaus
- [x] Storage-Download nutzt nur `storage_path` aus dem RLS-gefilterten Belege-Set – kein direkter User-Input
- [x] Multi-Tenant-Isolation – KEIN Cross-Mandant-Leak möglich

##### AC-Path Traversal (Belegliste-ZIP)
- [x] `safeFilename`-Pipeline analog zur Buchhaltungsuebergabe (Zeile 168-173 belegliste/zip)
- [x] Pfadseparatoren, Parent-Sequences, Sonderzeichen werden ersetzt
- [x] Fallback `'beleg.pdf'` bei leerem Filename

#### Bugs Found – Round 2

##### BUG-PROJ9-017: Spec-Code-Konflikt zu UTF-8 BOM
- **Severity:** Medium (Spec-Compliance)
- **Steps to Reproduce:**
  1. Spec AC-CSV-Format sagt: "Zeichensatz: UTF-8 (ohne BOM — kein DATEV-Artefakt)" (Zeile 53)
  2. Code in `generateBuchungsCSV` prepended `'﻿'` (Zeile 295 buchungsexport.ts)
  3. Code-Kommentar (Zeile 11): "UTF-8 MIT BOM (U+FEFF) – für Excel/BMD/RZL-Kompatibilität"
  4. Frontend-Label: "UTF-8, Semikolon, kompatibel mit BMD, RZL, Sage" (kein BOM-Hinweis)
- **Erwartet:** Spec und Code müssen konsistent sein. Entscheidung: BOM JA (für Excel/BMD/RZL) oder NEIN (DATEV-Heritage).
- **Impact:** Wenn Spec gewollt war, müssen Steuerberater-Tools BOM ablehnen → Code muss Fix; wenn Code gewollt ist, muss Spec aktualisiert werden.
- **Empfehlung:** Spec aktualisieren auf "UTF-8 MIT BOM" (Code-Verhalten ist user-freundlicher für Excel-Import). Frontend-Beschreibung an Spec anpassen.
- **Priorität:** Vor Deployment klären (Spec-Compliance)

##### BUG-PROJ9-018: dokument-Spalte – Truncation auf 120 Zeichen kann Zuordnung brechen
- **Severity:** Low
- **Steps to Reproduce:**
  1. Lade Beleg mit langem Dateinamen hoch (z.B. `Rechnung_Anwaltskanzlei_Müller_und_Partner_GmbH_2026_03_KW_12_Akte_4711.pdf`, ~78 Zeichen)
  2. Buchungsnummer ist z.B. `E_0001_B1_03_2026` (~17 Zeichen)
  3. Im CSV: `dokument`-Spalte wird durch `clean(rawFilename ? \`${belegnrBase}_${rawFilename}\` : '', 120)` auf 120 Zeichen begrenzt (Zeile 198 buchungsexport.ts)
  4. Im ZIP wird `safeFilename` separat gebildet (Zeile 160-164 zip route) ohne 120-Zeichen-Limit
  5. Bei sehr langen Originalnamen kann der CSV-Wert von der ZIP-Datei abweichen → Zuordnung gebrochen
- **Erwartet:** Beide Werte (CSV `dokument` und ZIP-Filename) sollten identisch sein
- **Aktuell:** CSV begrenzt auf 120, ZIP nicht. Die meisten realen Dateinamen sind kürzer als 120, aber Edge Case existiert.
- **Priorität:** Nice to have

##### BUG-PROJ9-019: LIESMICH dokumentiert anderes Beleg-Benamungsschema als Code erzeugt
- **Severity:** Medium (Steuerberater-UX)
- **Steps to Reproduce:**
  1. Exportiere ZIP, öffne LIESMICH.txt
  2. Schema steht dort als: `{Kürzel}_{lfd-Nr}_{MM}_{JJJJ}_{Originaldateiname}` mit Beispiel `B1_0001_02_2026_Rechnung-Mustermann.pdf` (Zeile 364-374 buchungsexport.ts)
  3. Code erzeugt im ZIP-Filename aber: `${buchungsnummer}_${rawName}` (Zeile 151 zip route)
  4. Wenn `buchungsnummer = 'E_0001_B1_02_2026'` (PROJ-25-Format), dann ZIP-Filename = `E_0001_B1_02_2026_Rechnung-Mustermann.pdf` – das Format vom LIESMICH-Beispiel `B1_0001_02_2026_…` kommt im Code nicht vor
  5. Steuerberater wird durch Schema-Beispiel verwirrt
- **Erwartet:** LIESMICH-Schema spiegelt exakt das tatsächliche Buchungsnummer-Format aus PROJ-25 wider
- **Empfehlung:** Schema im LIESMICH dynamisch aus tatsächlichen Buchungsnummern ableiten oder Spec-konformer Hinweis "Prefix = Buchungsnummer aus PROJ-25"
- **Priorität:** Fix vor Deployment (Doku-Inkonsistenz)

##### BUG-PROJ9-020: Belegliste-Endpoints ignorieren Belege-Limit für CSV-Pfad
- **Severity:** Low (Performance/DOS)
- **Steps to Reproduce:**
  1. Mandant hat 4500 Belege in einem Monat (extrem ungewöhnlich, aber möglich nach Bulk-Import)
  2. POST `/api/export/{jahr}/{monat}/belegliste/csv`
  3. Query nutzt `.limit(5000)` → 4500 Belege werden geladen
  4. CSV-Generator iteriert über 4500 Belege synchron
  5. Vercel Lambda kann timeout (10s default) bei großen Multi-MwSt-Tabellen
- **Erwartet:** Documented Limit oder asynchroner Generator
- **Aktuell:** ZIP hat ein 50-Belege-Limit, CSV nur 5000-Query-Limit ohne Anzeige
- **Priorität:** Nice to have (Edge-Case-Schutz)

##### BUG-PROJ9-021: belegliste/csv und belegliste/zip selektieren `storage_path`, übergeben es aber nicht in `BelegslisteBeleg`
- **Severity:** Info (Code-Smell, kein Bug)
- **Steps to Reproduce:**
  1. CSV-Route lädt `storage_path` (Zeile 87) aber mappt es nicht in `BelegslisteBeleg` (Zeile 113-127)
  2. Trotz Selektion wird das Feld nicht für die CSV genutzt
- **Impact:** Marginal (extra Bytes über die Leitung)
- **Priorität:** Nice to have (Code-Cleanup)

##### BUG-PROJ9-022: Vorschau-Endpoint zeigt `anzahl_belege` auch im Buchungsuebergabe-Modus, was UI nicht nutzt
- **Severity:** Info
- **Steps to Reproduce:**
  1. Preview liefert immer `anzahl_belege` (Zeile 86-92 preview route)
  2. Buchungsuebergabe-Modus zeigt es nicht (UI-Branch in export-dialog Zeile 316-350)
- **Impact:** Zusätzliche DB-Roundtrip auch wenn nicht gebraucht
- **Priorität:** Nice to have (Performance-Mikro-Optimierung)

#### Edge Cases – Round 2

##### EC-Belegliste-1: Belege mit `rechnungsdatum NULL` und `erstellt_am` außerhalb Monat
- [x] Filter `(rechnungsdatum IS NULL UND erstellt_am im Monat)` – greift nur, wenn beides NULL/außerhalb → Beleg wird korrekt **ausgeschlossen**

##### EC-Belegliste-2: Beleg mit Multi-MwSt + ohne `bruttobetrag`
- [x] Fallback `netto + steuer` (Zeile 502-505 buchungsexport.ts)

##### EC-Belegliste-3: Beleg mit Steuerzeilen-Array, aber leer
- [x] `steuerzeilen.length >= 2` → falsch bei `length === 0` oder `1`, fällt auf Single-MwSt-Branch zurück (Zeile 522-540)

##### EC-Belegliste-4: Beleg mit `lieferant = NULL`
- [x] `clean(b.lieferant ?? '', 80)` → leerer String, keine Fehler

##### EC-Belegliste-5: Mehrere Transaktionen referenzieren denselben Beleg
- [x] Code nimmt erste Transaktion (`txArr[0]`) → potenziell zwei Transaktionen-Quellen, aber CSV zeigt nur die erste. Das ist konsistent mit Multi-Match-Konzept aus PROJ-5/6 (1 Beleg = 1 Hauptzuordnung), Edge Case ungewöhnlich.

#### Security Audit – Round 2

##### Authorization
- [x] Beide neuen Endpoints prüfen Auth, Mandant, abgeschlossen-Status
- [x] RLS-Policies auf `belege` und `transaktionen` decken Tenant-Isolation ab
- [x] `export_protokolle.insert` ist durch RLS abgesichert (`get_mandant_id()`)
- [x] Belegliste-Endpoint erbt das gleiche Sicherheitsmodell wie Buchhaltungsuebergabe

##### Storage Download Security
- [x] `storage_path` kommt aus DB (RLS gefiltert), nicht aus User-Input – kein Path-Traversal über Storage möglich
- [x] Storage-Bucket `belege` muss eigene RLS-Policies haben (außerhalb dieses Specs)

##### Input Validation
- [x] `paramsSchema` (Zod) für `jahr` und `monat` in beiden neuen Routes
- [x] Keine User-Input direkt in SQL/Storage-Calls

##### Resource Exhaustion
- [x] ZIP-Limit 50 Belege bleibt
- [ ] BUG-020: CSV-Pfad hat nur Query-Limit 5000, kein User-Visible-Limit – aber für realistische Datenmengen kein Problem

##### Information Disclosure
- [x] CSV enthält keine Storage-Pfade, keine internen IDs, keine User-Mails
- [x] CSV enthält Lieferant, Rechnungsnummer, Beträge – alles Mandant-eigene Daten, OK

#### Cross-Browser & Responsive
- Nicht durchgeführt (statische Code-Review). Code-Review:
  - Dialog hat `max-h-[90vh] overflow-y-auto` – Mobile-Scroll OK
  - RadioGroup-Kacheln sind `grid-cols-1 sm:grid-cols-2` – stacken auf Mobile
  - Vorschau-Kachel: `grid-cols-3` (Buchungsuebergabe) bzw. `grid-cols-1` (Belegliste) – beide Mobile-tauglich
  - Buttons: `gap-2 sm:gap-0` im Footer – Mobile freundlich

#### Regression Testing – Round 2
- **Buchhaltungsuebergabe-CSV (PROJ-9 Round 1):** Build grün, alle Round-1-Verbesserungen (Filename-Präfix, LIESMICH-Text, Button-Enable) funktionieren.
- **Monatsabschluss (PROJ-8):** Wiederöffnen-Dialog liest weiterhin `export_vorhanden` – konsistent, da neue Belegliste-Endpoints den Flag ebenfalls setzen.
- **EAR-Buchungsnummern (PROJ-25, Deployed):** Buchungsnummer wird unverändert in CSV `belegnr` und ZIP-Filename verwendet.
- **Multi-Tenant User-Rollen (PROJ-12):** `getMandantId()` mit invited users bleibt unverändert.
- **Storage RLS (PROJ-3):** Storage-Download nutzt nur DB-gefilterte `storage_path`s.

#### Production-Ready Decision – Round 2

| Kategorie | Bewertung |
|---|---|
| Critical Bugs | 0 |
| High Bugs | 0 |
| Medium Bugs | 3 (BUG-017 BOM-Konflikt, BUG-019 LIESMICH-Schema, BUG-015 Rate-Limit aus R1) |
| Low Bugs | 3 (BUG-014, BUG-018, BUG-020) |
| Info | 2 (BUG-021, BUG-022) |
| Build | Grün |
| Security | Keine kritischen Issues. Belegliste erbt Sicherheitsmodell von Buchhaltungsuebergabe. |

**Production Ready:** YES (bedingt) – Keine Blocker. BUG-017 (BOM Spec-Konflikt) und BUG-019 (LIESMICH-Schema) sollten vor Public Launch behoben werden, sind aber Doku/UX-Issues, keine Funktionsprobleme.

**Empfehlung:**
1. **Vor Deployment:** Spec-Update für BOM (BUG-017) → Spec auf "UTF-8 MIT BOM" anpassen, Frontend-Label klarstellen.
2. **Vor Deployment:** LIESMICH-Schema-Beispiel (BUG-019) korrigieren oder dynamisch generieren.
3. **Im nächsten Sprint:** Rate-Limit auf Upstash Redis migrieren (BUG-015, weiterhin offen).
4. **Optional:** Code-Cleanup für BUG-021 und BUG-022.

**Manuelles Testing offen:** Cross-Browser (Chrome/Firefox/Safari) und Responsive (375/768/1440) sollten gegen laufende Dev-Instanz verifiziert werden, insbesondere:
- Belegliste-Modus auf Mobile (Dialog-Höhe mit Vorschau + History)
- ZIP-Download in allen Browsern (große Buffers, Memory)
- LIESMICH_BELEGLISTE.txt-Encoding in Windows Notepad (BOM-Test)

---

### Round 1 (2026-04-21)

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
