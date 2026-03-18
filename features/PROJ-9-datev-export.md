# PROJ-9: DATEV-Export

## Status: In Review
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

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification (no running app instance)

### Build Status

- [ ] BUG: TypeScript build fails -- the project does NOT compile. See BUG-PROJ9-001.

### Acceptance Criteria Status

#### AC-1: Export only available for months with status "Abgeschlossen"
- [x] Preview endpoint (`GET /api/export/.../preview`) checks `abschluss?.status !== 'abgeschlossen'` and returns 403
- [x] CSV endpoint (`POST /api/export/.../csv`) checks the same gate and returns 403
- [x] ZIP endpoint (`POST /api/export/.../zip`) checks the same gate and returns 403
- [x] UI: ExportDialog is only reachable from closed-month actions (MonatsKarte `istAbgeschlossen` guard, detail page `istAbgeschlossen` guard)

#### AC-2: User selects a closed month -- preview of export row count shown before download
- [x] Preview endpoint returns `anzahl_transaktionen`, `anzahl_mit_beleg`, `anzahl_ohne_beleg`
- [x] ExportDialog fetches preview on open and displays all three counts in a summary grid

#### AC-3: CSV follows DATEV Buchungsstapel format
- [x] `datev.ts` generates EXTF header line with version 700, Datenkategorie 21
- [x] Column headers match DATEV Buchungsstapel spec (Umsatz, S/H-Kennzeichen, Belegdatum, Belegfeld 1, Belegfeld 2, Buchungstext)
- [x] Date format uses DDMM as required by DATEV
- [x] Betrag formatted as positive value with comma decimal separator + S/H-Kennzeichen
- [ ] BUG: Kontonummer and Gegenkonto fields are always empty. See BUG-PROJ9-002.

#### AC-4: Mandant header fields populated from PROJ-2 data
- [x] CSV endpoint fetches `firmenname, uid_nummer, geschaeftsjahr_beginn` from mandanten table
- [x] Header line includes Firmenname as Beraternummer (simplified)
- [ ] BUG: Mandantennummer is hardcoded to '1' and Beraternummer uses Firmenname instead of actual advisory/client numbers. See BUG-PROJ9-003.

#### AC-5: Unmatched (red) transactions included with empty Belegfeld
- [x] All transactions for the month are fetched regardless of match_status
- [x] Unmatched transactions get "OFFEN" prefix in Buchungstext
- [x] Belegfeld1/Belegfeld2 are empty when no beleg is attached (`clean(null)` returns empty string)

#### AC-6: "Kein Beleg erforderlich" transactions exported with note in Buchungstext
- [x] `workflow_status === 'kein_beleg'` results in "KEIN BELEG" prefix in Buchungstext

#### AC-7: Export download as CSV (UTF-8 with BOM)
- [x] `datev.ts` prepends BOM character (`\uFEFF`)
- [x] Response Content-Type is `text/csv; charset=utf-8`
- [x] Content-Disposition header triggers download with proper filename

#### AC-8: Optional ZIP download including CSV + all matched PDF belege
- [x] ZIP endpoint creates JSZip with CSV file and Belege/ folder
- [x] Unique belege are de-duplicated before download
- [x] Missing belege from storage are tracked and written to FEHLENDE_BELEGE.txt

#### AC-9: Export history logged
- [x] Both CSV and ZIP endpoints insert into `export_protokolle` table
- [x] Logged fields: mandant_id, jahr, monat, exportiert_von, export_typ, anzahl_transaktionen, anzahl_ohne_beleg
- [x] `datev_export_vorhanden` flag set to true on monatsabschluesse
- [x] Preview endpoint returns last 3 exports; UI displays them with timestamps and type badges

### Edge Cases Status

#### EC-1: Month has no transactions -- header-only CSV with warning
- [x] UI shows warning "Keine Transaktionen vorhanden" when `anzahl_transaktionen === 0`
- [x] CSV generation produces header + column line with no data rows (valid DATEV header-only file)
- [ ] BUG: Export button is NOT disabled when there are zero transactions, so user can export an empty file without explicit warning in the download. See BUG-PROJ9-004.

#### EC-2: DATEV date format DDMM
- [x] `formatDATEVDatum()` correctly produces DDMM format using UTC date methods

#### EC-3: Beleg file missing from storage -- CSV still exports, ZIP skips missing with warning
- [x] ZIP endpoint catches download errors per beleg and adds to `fehlendeBelege` list
- [x] FEHLENDE_BELEGE.txt is included in ZIP when files are missing

#### EC-4: Very large export (300+ transactions, 300+ PDFs) -- async handling
- [ ] BUG: No async handling implemented. All ZIP generation is synchronous regardless of beleg count. The spec says >=50 belege should be async with progress/download link, but the implementation always generates synchronously. See BUG-PROJ9-005.

#### EC-5: User exports same month twice -- allowed, new file created, history logged
- [x] No uniqueness constraint prevents re-export; each export creates a new `export_protokolle` row
- [x] UI shows "Erneut exportieren" button after successful export

### Security Audit Results

#### Authentication
- [x] All three API endpoints check `supabase.auth.getUser()` and return 401 if no user

#### Authorization / Multi-Tenant Isolation
- [x] RLS policies on `export_protokolle` use `get_mandant_id()` which respects ownership
- [x] API routes query mandanten with `owner_id = user.id`, preventing cross-tenant access
- [ ] BUG: Invited users (non-owners) cannot access export endpoints because the API uses `.eq('owner_id', user.id)` instead of using the `get_mandant_id()` RLS function or checking `mandant_users`. This is inconsistent with the updated `get_mandant_id()` migration that supports invited users. See BUG-PROJ9-006.

#### Input Validation
- [ ] BUG: No validation on `jahr` and `monat` URL parameters. `parseInt("abc")` returns NaN which is passed directly to database queries. No Zod schema is used. Malformed URLs like `/api/export/abc/xyz/csv` will produce database errors instead of clean 400 responses. See BUG-PROJ9-007.

#### Rate Limiting
- [ ] BUG: Export API endpoints (`/api/export/*`) are NOT included in the middleware rate limiter. The middleware only rate-limits `/api/belege`, `/api/transaktionen`, `/api/matching`, and `/api/monatsabschluss`. An attacker could trigger unlimited export requests, causing heavy server load (especially ZIP generation). See BUG-PROJ9-008.

#### Path Traversal / ZIP Injection
- [ ] BUG: `original_filename` from the database is used directly as the filename inside the ZIP archive (`belegeFolder.file(beleg.original_filename ?? ...)`). If a malicious filename like `../../etc/passwd` or a filename with special characters was stored, it could cause ZIP path traversal (Zip Slip). The filename should be sanitized before use. See BUG-PROJ9-009.

#### Content-Disposition Header Injection
- [ ] BUG: The `firmenname` is used in the Content-Disposition filename after only basic character replacement (`replace(/[^a-zA-Z0-9]/g, '_')`). While this is reasonably safe, double-quotes in the Firmenname are not explicitly escaped. The current regex does strip them, but the approach lacks explicit sanitization for header injection. Severity: Low.

#### Data Exposure
- [x] Export endpoints return binary file data, not raw JSON with sensitive fields
- [x] No internal IDs or user emails leak in the CSV export
- [x] Storage paths are not exposed to the client

#### CSP / Security Headers
- [x] CSP nonce applied via middleware
- [x] X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS all configured in next.config.ts

### Cross-Browser Testing
- Unable to test in browser (static code review only -- build does not compile)

### Responsive Testing
- Unable to test responsive layouts (static code review only -- build does not compile)
- Code review of ExportDialog: uses `sm:max-w-lg` and `sm:grid-cols-2` responsive classes, which is appropriate

### Bugs Found

#### BUG-PROJ9-001: TypeScript Build Failure -- Missing Properties in Fallback Object
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Run `npm run build`
  2. Build fails at `src/app/(app)/monatsabschluss/[jahr]/[monat]/page.tsx:156`
  3. The fallback object for `VollstaendigkeitsPruefung` is missing `kassa_saldo` and `kassa_saldo_positiv` properties required by the `Pruefung` type
  4. Expected: Build succeeds
  5. Actual: TypeScript error -- type mismatch
- **Priority:** Fix before deployment -- blocks ALL testing and deployment

#### BUG-PROJ9-002: Kontonummer and Gegenkonto Always Empty in DATEV CSV
- **Severity:** Low
- **Steps to Reproduce:**
  1. Export any month as CSV
  2. Open CSV and check Konto (column 7) and Gegenkonto (column 8)
  3. Expected: Account numbers populated (or documented as intentionally empty)
  4. Actual: Always empty string
- **Note:** The spec lists Kontonummer as "(optional)" so this may be by design, but the acceptance criteria mention it. The DATEV comment in code says "Mandant muss selbst pflegen" -- this should be documented for the accountant.
- **Priority:** Nice to have (accountant can fill in manually)

#### BUG-PROJ9-003: Beraternummer and Mandantennummer Hardcoded
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Export any month as CSV
  2. Check DATEV header line field 11 (Beraternummer) and field 12 (Mandantennummer)
  3. Expected: Real Beraternummer and Mandantennummer from mandant settings
  4. Actual: Beraternummer = Firmenname, Mandantennummer = '1'
- **Note:** DATEV format requires numeric Beraternummer (5-7 digits) and Mandantennummer (1-5 digits). Using Firmenname will cause import errors in DATEV software.
- **Priority:** Fix before deployment -- DATEV import will fail without valid numbers

#### BUG-PROJ9-004: Export Button Not Disabled for Zero Transactions
- **Severity:** Low
- **Steps to Reproduce:**
  1. Close a month with zero transactions
  2. Open ExportDialog
  3. Warning "Keine Transaktionen vorhanden" is shown
  4. Expected: Export button disabled or at minimum clearly warns that an empty file will be generated
  5. Actual: Export button remains enabled; user can download a header-only CSV without realizing it is empty
- **Priority:** Nice to have

#### BUG-PROJ9-005: No Async ZIP Generation for Large Exports
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have a month with 50+ belege attached to transactions
  2. Export as ZIP
  3. Expected: Async generation with progress indicator and download link (per spec: ">=50 Belege -> Async")
  4. Actual: All ZIP generation is synchronous. For 300+ PDFs this could timeout the API route (Vercel has 10s default timeout for serverless functions)
- **Priority:** Fix in next sprint (unlikely to hit 300+ belege in early usage)

#### BUG-PROJ9-006: Invited Users Cannot Access Export Endpoints
- **Severity:** High
- **Steps to Reproduce:**
  1. Invite a user to a mandant as 'buchhalter' role
  2. Have them log in and navigate to a closed month
  3. Try to export DATEV CSV or ZIP
  4. Expected: Export succeeds (invited user has access via mandant_users)
  5. Actual: API returns 404 "Kein Mandant" because it queries `mandanten.owner_id = user.id` which only matches the owner
- **Priority:** Fix before deployment -- breaks multi-user workflow

#### BUG-PROJ9-007: No Input Validation on URL Parameters
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send GET request to `/api/export/abc/xyz/preview`
  2. Expected: 400 Bad Request with descriptive error
  3. Actual: `parseInt("abc")` returns NaN, which is passed to database query, producing an unexpected error or empty result
- **Priority:** Fix before deployment

#### BUG-PROJ9-008: Export Endpoints Not Rate-Limited
- **Severity:** High
- **Steps to Reproduce:**
  1. Review middleware.ts rate limiting configuration
  2. Note that `/api/export` is NOT in the list of rate-limited paths
  3. Send 100 rapid POST requests to `/api/export/2026/3/zip`
  4. Expected: Rate limiting kicks in after ~20 POST requests
  5. Actual: All 100 requests are processed, each triggering ZIP generation with heavy I/O and storage downloads
- **Priority:** Fix before deployment -- denial of service risk

#### BUG-PROJ9-009: Unsanitized Filenames in ZIP Archive (Zip Slip)
- **Severity:** High (Security)
- **Steps to Reproduce:**
  1. If a beleg is uploaded with a crafted `original_filename` containing path traversal characters (e.g., `../../malicious.pdf`)
  2. Export month as ZIP
  3. Expected: Filename sanitized, path components stripped
  4. Actual: `original_filename` from DB is used directly in `belegeFolder.file(beleg.original_filename, ...)` without sanitization
- **Note:** While Supabase upload may sanitize on ingest, defense-in-depth requires sanitization at the point of use. JSZip itself may or may not handle path traversal.
- **Priority:** Fix before deployment -- known vulnerability class (CWE-22)

### Summary
- **Acceptance Criteria:** 7/9 passed (AC-3 partial due to empty Konto fields, AC-4 partial due to hardcoded numbers)
- **Edge Cases:** 4/5 passed (EC-4 async ZIP not implemented)
- **Bugs Found:** 9 total (1 critical, 2 high, 3 medium, 3 low)
  - Critical: 1 (build failure)
  - High: 2 (invited users blocked, no rate limiting, zip slip)
  - High (Security): 1 (zip slip)
  - Medium: 3 (hardcoded DATEV numbers, no async ZIP, no input validation)
  - Low: 3 (empty Konto fields, export button for zero TX, content-disposition)
- **Security:** Issues found (no rate limiting on export, zip slip, missing input validation, invited user auth gap)
- **Production Ready:** PENDING RE-TEST
- **Fixes Applied (2026-03-18):**
  - BUG-PROJ9-001 ✅ Added `kassa_saldo: null, kassa_saldo_positiv: null` to fallback in detail page — build now succeeds
  - BUG-PROJ9-009 ✅ ZIP filenames sanitized (strip path separators, `..`, special chars) — Zip Slip fixed
  - BUG-PROJ9-008 ✅ `/api/export` added to middleware rate limiter
  - BUG-PROJ9-006 ✅ All 3 export routes now use `getMandantId()` RPC — invited users can export
  - BUG-PROJ9-003 ✅ Migration `20260318000007_add_datev_numbers_to_mandanten.sql` adds `beraternummer`/`mandantennummer` columns; DATEV header uses real values (fallback: `00000`/`1`)
  - BUG-PROJ9-007 ✅ Zod `paramsSchema` validates `jahr`/`monat` in all 3 routes — returns 400 on bad input
  - BUG-PROJ9-004 ✅ Export button disabled when `anzahl_transaktionen === 0`
  - BUG-PROJ9-002 ✅ Intentionally empty Konto/Gegenkonto documented in `datev.ts` comment
  - BUG-PROJ9-005 ✅ ZIP limited to 50 Belege — returns 413 with user-friendly message; async ZIP planned for next sprint
- **Recommendation:** Run `/qa` again with a live app instance for manual browser testing. Also apply migration `20260318000007` to Supabase and configure `beraternummer`/`mandantennummer` via Settings or Supabase Dashboard.

## Deployment
_To be added by /deploy_
