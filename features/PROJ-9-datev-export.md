# PROJ-9: DATEV-Export

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-2 (Mandant-Onboarding) – Firmendaten für DATEV-Header
- Requires: PROJ-5 (Matching-Engine) – Match-Daten werden exportiert
- Requires: PROJ-8 (Monatsabschluss) – Export nur für abgeschlossene Monate

## User Stories
- As a user, I want to export a closed month's data in DATEV-compatible CSV format so that my accountant can import it without manual rework
- As a user, I want to choose which month to export so that I can prepare the handover package for my accountant
- As a user, I want the export to include matched invoice references so that my accountant can trace each transaction to its document
- As a user, I want to download the export as a ZIP file (CSV + documents) so that I can send everything in one package

## Acceptance Criteria
- [ ] Export is only available for months with status "Abgeschlossen" (PROJ-8)
- [ ] User selects a closed month → preview of export row count shown before download
- [ ] CSV export follows DATEV Buchungsstapel format:
  - Umsatz (Betrag), Soll/Haben-Kennzeichen, Buchungsdatum, Kontonummer (optional), Gegenkonto, Buchungstext, Belegfeld1 (Rechnungsnummer), Belegfeld2 (Lieferant), Belegnummern-Datum
- [ ] Mandant header fields populated from PROJ-2 data (Firmenname, Beraternummer, Mandantennummer)
- [ ] Unmatched (red) transactions included in export with empty Belegfeld (accountant can handle manually)
- [ ] "Kein Beleg erforderlich" transactions exported with note in Buchungstext
- [ ] Export download as CSV (UTF-8 with BOM for Excel compatibility)
- [ ] Optional: ZIP download including CSV + all matched PDF belege
- [ ] Export history logged (month, exported_at, exported_by)

## Edge Cases
- Month has no transactions → export produces header-only CSV with warning
- DATEV format requires specific date format (DDMM) → handled by export formatter
- Beleg file missing from storage (deleted externally) → CSV still exports, ZIP skips missing file with warning
- Very large export (300+ transactions, 300+ PDFs) → ZIP generation runs async, download link sent (or progress shown)
- User exports same month twice → allowed, new file created, history logged

## Technical Requirements
- DATEV CSV: semicolon-separated, UTF-8 with BOM, DATEV Buchungsstapel format v700
- ZIP generation: server-side (Next.js API route or Supabase Edge Function)
- File naming: `DATEV_Export_{YYYY}_{MM}_{Mandantname}.csv`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI (integriert in PROJ-8 Monatsabschluss)

```
MonatsKarte (abgeschlossen)
└── ExportButton → ExportDialog (Modal)
    ├── ExportVorschau              ← "47 TX werden exportiert (3 ohne Beleg)"
    ├── NurCSVOption / ZIPOption
    ├── ExportButton (final)
    └── ExportFortschritt           ← Spinner/Progress bei ZIP

ExportHistorie in MonatsDetail      ← "Letzter Export: 14.03.2026 von Patrick"

API:
  GET  /api/export/[jahr]/[monat]/preview  → Vorschau
  POST /api/export/[jahr]/[monat]/csv      → CSV-Download
  POST /api/export/[jahr]/[monat]/zip      → ZIP (sync < 50 Belege, async ≥ 50)
```

### DATEV CSV-Struktur (Buchungsstapel v700)

```
Header: Formatname | Version | Mandantennummer | Beraternummer |
        Wirtschaftsjahr-Beginn | Datumvon | Datumbis | Bezeichnung

Pro Transaktion:
  Umsatz | S/H-Kennzeichen | Buchungsdatum (DDMM) | Buchungstext |
  Belegfeld1 (Rechnungsnummer) | Belegfeld2 (Lieferant) | Belegdatum

Encoding: UTF-8 mit BOM | Trennzeichen: Semikolon
```

### Datenmodell

```
Neue Tabelle: export_protokolle
  - id, mandant_id, jahr, monat
  - exportiert_am, exportiert_von
  - export_typ (csv / zip)
  - anzahl_transaktionen, anzahl_ohne_beleg

→ monatsabschluesse.datev_export_vorhanden = true (für Wiedereröffnen-Warnung)
```

### ZIP-Strategie

```
< 50 Belege  → Synchron: direkter Browser-Download
≥ 50 Belege → Async: Fortschrittsanzeige, dann Download-Link (24h gültig)
Fehlende Belege → CSV vollständig, ZIP überspringt mit Warnung
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| DATEV-Format | Buchungsstapel v700 | Standard für österreichische Steuerberater |
| UTF-8 with BOM | Ja | Excel öffnet sonst Umlaute falsch |
| ZIP server-seitig | Ja | Vertrauliche Daten nicht im Client verarbeiten |

### Abhängigkeiten

| Package | Zweck |
|---|---|
| `jszip` | ZIP mit CSV + Belege-PDFs (server-side) |

## Implementation Notes (Frontend)

### Components Created
- `src/components/monatsabschluss/export-dialog.tsx` — ExportDialog modal with:
  - Export preview (transaction count, with/without beleg counts)
  - CSV vs ZIP format selection via RadioGroup
  - Export progress bar during download
  - Success/error states after export
  - Export history display (last 3 exports with timestamps)
  - Warning states for no transactions and transactions without belege

### Components Modified
- `src/app/(app)/monatsabschluss/page.tsx` — Added ExportDialog integration on overview page
- `src/app/(app)/monatsabschluss/[jahr]/[monat]/page.tsx` — Replaced simple CSV link with ExportDialog modal
- `src/components/monatsabschluss/monats-karte.tsx` — Added `onExport` callback prop, replaced link with button

### API Endpoints Used (already existed from backend)
- `GET /api/export/[jahr]/[monat]/preview` — Preview data
- `POST /api/export/[jahr]/[monat]/csv` — CSV download
- `POST /api/export/[jahr]/[monat]/zip` — ZIP download

### Libraries Used (already existed)
- `src/lib/datev.ts` — DATEV Buchungsstapel v700 CSV generator

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
