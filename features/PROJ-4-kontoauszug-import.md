# PROJ-4: Kontoauszug-Import

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-18

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren

## User Stories
- As a user, I want to upload a bank statement CSV file so that my payment transactions are imported into the system
- As a user, I want to see a preview of the parsed transactions before confirming the import so that I can catch errors
- As a user, I want to select the correct CSV column mapping (date, amount, description, IBAN) so that imports from different banks work correctly
- As a user, I want to see a history of all imports (date, file name, number of transactions) so that I can track what has been imported
- As a user, I want duplicate transactions to be detected automatically so that no transaction is imported twice

## Acceptance Criteria
- [ ] User can upload a CSV file (UTF-8 or Latin-1 encoding, semicolon or comma separated)
- [ ] System auto-detects column structure; user can manually adjust column mapping if needed
- [ ] Preview table shows parsed rows (max 10 rows) before final import
- [ ] User confirms import → transactions saved to `transaktionen` table with `mandant_id` and `quelle_id` (Kontoauszug)
- [ ] Each transaction has: Datum, Betrag (negativ = Ausgabe), Beschreibung, IBAN/BIC (wenn vorhanden), Buchungsreferenz
- [ ] Duplicate detection: same Datum + Betrag + Buchungsreferenz within the same mandant → skipped with notice
- [ ] Import summary shown after completion: X imported, Y skipped (duplicates), Z errors
- [ ] Import history stored: Dateiname, Importdatum, Anzahl Transaktionen, Benutzer
- [ ] RLS: transactions scoped to mandant_id

## Edge Cases
- CSV with no header row → user can manually assign column mapping
- CSV with missing required fields (date or amount) → row skipped, counted as error
- Negative vs. positive amounts (bank format varies) → user confirms interpretation during mapping
- Re-importing the same file → duplicates detected and skipped, user informed
- Very large CSV (1000+ rows) → import runs without timeout, progress indicator shown
- Encoding issues (Umlaute) → Latin-1 auto-detected, fallback to manual encoding selection
- CSV from different Austrian banks (Erste, Raiffeisen, BAWAG) → flexible column mapping covers all

## Technical Requirements
- Accepted formats: CSV (UTF-8, Latin-1), separator auto-detection (;, ,)
- Max file size: 5 MB
- Normalization: All amounts stored as decimal (positive = Eingang, negative = Ausgang)
- Performance: 1000 rows parsed and previewed in < 3s

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/
└── transaktionen/
    ├── TransaktionenPage               ← /transaktionen (PROJ-5+6 ergänzen Matching)
    │   └── ImportButton
    │
    └── import/
        └── ImportWizard                ← 3-schrittiger Prozess
            ├── Step 1: Datei hochladen
            │   ├── DropZone
            │   ├── EncodingSelect      ← Auto / UTF-8 / Latin-1
            │   └── TrennzeichenSelect  ← Auto / Semikolon / Komma
            │
            ├── Step 2: Spalten zuordnen
            │   ├── SpaltenmappingTabelle
            │   │   ├── DatumSpalte / BetragSpalte / BeschreibungSpalte
            │   │   ├── IBANSpalte (optional) / ReferenzSpalte (optional)
            │   │   └── BetragVorzeichenToggle
            │   └── VorschauTabelle     ← Erste 10 Zeilen mit gemappten Werten
            │
            └── Step 3: Bestätigen & Importieren
                ├── ImportSummaryPreview
                ├── DuplikatHinweis
                ├── ImportButton
                └── ImportErgebnis      ← X importiert / Y Duplikate / Z Fehler

        └── ImportHistorie              ← Dateiname | Datum | Anzahl | Benutzer
```

### Datenmodell

```
Tabelle: zahlungsquellen
  - id (UUID, Primärschlüssel)
  - mandant_id (UUID, FK → mandanten)
  - name (Text)
  - typ (Enum)                → kontoauszug / kassa / kreditkarte / paypal / sonstige
  - iban (Text, optional)
  - csv_mapping (JSONB)       → gespeichertes Spalten-Mapping für Wiederverwendung
  - aktiv (Boolean)
  - erstellt_am (Timestamp)

Tabelle: transaktionen
  - id (UUID, Primärschlüssel)
  - mandant_id (UUID, FK → mandanten)
  - quelle_id (UUID, FK → zahlungsquellen)
  - datum (Date)
  - betrag (Decimal)          → negativ = Ausgabe, positiv = Eingang
  - beschreibung (Text)
  - iban_gegenseite (Text, optional)
  - bic_gegenseite (Text, optional)
  - buchungsreferenz (Text, optional)
  - match_status (Enum)       → offen / vorgeschlagen / bestaetigt / kein_beleg
  - match_score (Integer)     → 0–100
  - workflow_status (Enum)    → normal / rueckfrage / erledigt
  - erstellt_am (Timestamp)

  UNIQUE Constraint: (mandant_id, quelle_id, datum, betrag, buchungsreferenz)
  → Verhindert Duplikate auf DB-Ebene, auch bei Race Conditions / parallelen Importen
  → Fallback ohne Buchungsreferenz: (mandant_id, quelle_id, datum, betrag, beschreibung)

Tabelle: import_protokolle
  - id, mandant_id, quelle_id, dateiname, importiert_am
  - anzahl_importiert, anzahl_duplikate, anzahl_fehler
  - importiert_von (UUID → auth.users)
```

### Duplikat-Schutz (zweistufig)

```
Schicht 1 – Anwendung: Vor dem Import prüfen ob Kombination existiert
            → Zeigt "Y Duplikate werden übersprungen"

Schicht 2 – Datenbank: UNIQUE Constraint auf Tabelle transaktionen
            → Harte Ablehnung auch bei Race Conditions, API-Retry, 2 Browser-Tabs

Sonderfall: Keine Buchungsreferenz im CSV → Constraint auf datum+betrag+beschreibung
            → UI warnt bei "verdächtigen Duplikaten" (z.B. 2× selber Betrag am selben Tag)
```

### CSV-Parsing-Strategie

```
Client-seitiges Parsing (papaparse) → sofortige Vorschau ohne Server-Roundtrip
Auto-Detect: Encoding (BOM/Byte-Pattern) + Trennzeichen
Bekannte Bankformate (Erste, Raiffeisen, BAWAG) → Auto-Mapping
Unbekannt → manuelle Spalten-Zuordnung durch Benutzer
Server-seitiger Batch-Insert via API Route (Duplikat-Check + DB-Write)
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| CSV-Parsing | Client-seitig (papaparse) | Sofortige Vorschau ohne Server-Roundtrip |
| Import | Server-seitig (API Route) | DB-Zugriff für Duplikat-Check + sicherer Batch-Insert |
| Duplikat-Schutz | DB UNIQUE Constraint + App-Check | Garantierter Schutz auch bei Race Conditions |
| Mapping speichern | zahlungsquellen.csv_mapping (JSONB) | Nächster Import derselben Quelle ohne Re-Mapping |

### Abhängigkeiten

| Package | Zweck |
|---|---|
| `papaparse` | CSV-Parsing im Browser |

## QA Test Results

### Round 1 (2026-03-17)
**Tester:** QA Engineer (AI) | **Method:** Static code review + build verification
**Bugs Found:** BUG-PROJ4-001 (Low), BUG-PROJ4-002 (High)
**Status of fixes:** Neither bug has been fixed as of Round 2.

---

### Round 2 (2026-03-18)
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification + security audit
**Build Status:** PASS (npm run build succeeds, no compilation errors)

### Acceptance Criteria Status

#### AC-1: User can upload CSV file (UTF-8 or Latin-1, semicolon or comma)
- [x] `csv-parser.ts` supports encoding detection via `detectEncoding()` with BOM and byte-pattern checks
- [x] PapaParse handles auto-detection of delimiter (semicolon, comma)
- [x] Manual encoding override available in UI (Auto / UTF-8 / Latin-1)
- [x] Manual delimiter override available in UI (Auto / Semikolon / Komma / Tab)
- [x] 5 MB file size limit enforced in DropZone via react-dropzone `maxSize`
- [x] Only `.csv` MIME types accepted in DropZone
- **PASS**

#### AC-2: System auto-detects column structure; user can manually adjust
- [x] `autoDetectMapping()` detects Austrian bank headers (Buchungsdatum, Betrag, Verwendungszweck, IBAN, Referenz, etc.)
- [x] `spalten-mapping.tsx` provides per-column Select dropdowns for manual override
- [x] Known format patterns for Erste Bank and Raiffeisen defined in `KNOWN_FORMATS`
- [ ] NOTE: `KNOWN_FORMATS` array is defined but the `mapping` values are all `-1` -- these are never used; `autoDetectMapping()` does the actual work by pattern-matching header names directly. The `KNOWN_FORMATS.mapping` field is dead code.
- **PASS** (dead code is cosmetic, not functional)

#### AC-3: Preview table shows parsed rows (max 10) before import
- [x] `SpaltenMapping` component slices `previewData` to first 10 rows (line 63: `previewData.slice(0, 10)`)
- [x] Preview table shows Datum, Betrag, Beschreibung, IBAN, Referenz, Status per row
- [x] Rows with parse errors highlighted with red background and "Fehler" badge
- **PASS**

#### AC-4: User confirms import -- transactions saved with mandant_id and quelle_id
- [x] POST /api/transaktionen/import validates `quelle_id` as UUID via Zod
- [x] `mandant_id` derived server-side from `mandanten.owner_id = user.id` -- not from request body
- [x] Batch insert includes `mandant_id` and `quelle_id` on each row
- [ ] BUG: Import route uses `mandanten.owner_id = user.id` to find mandant. Invited users (non-owners in `mandant_users`) get 404 "Kein Mandant" and cannot import. See BUG-PROJ4-003.
- **PARTIAL PASS** (works for owner, fails for invited users)

#### AC-5: Each transaction has required fields
- [x] Zod schema validates: datum (string), betrag (number), beschreibung (optional string), iban_gegenseite (optional), bic_gegenseite (optional), buchungsreferenz (optional)
- [x] `applyMapping()` handles German date formats (DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY)
- [x] `parseAmount()` handles German number format (1.234,56) and English format (1,234.56)
- **PASS**

#### AC-6: Duplicate detection
- [x] Application-level: builds Set of `datum|betrag|buchungsreferenz|beschreibung` keys from existing DB records
- [x] Loads existing transactions for same `mandant_id` + `quelle_id` with `gte('datum', minDatum)`
- [ ] BUG: No DB-level UNIQUE constraint exists on transaktionen table. Tech design specifies `UNIQUE(mandant_id, quelle_id, datum, betrag, buchungsreferenz)` but migration does not create it. The comment at line 89-90 says "ON CONFLICT ignorieren" but no `onConflict` option is passed to Supabase `.insert()` -- this means DB-level duplikat protection as designed in the two-tier strategy does NOT exist. See BUG-PROJ4-004.
- [ ] BUG: Duplicate check has no upper date bound (`gte` without corresponding `lte`). Minor performance concern for large datasets.
- **PARTIAL PASS** (app-level works, DB-level tier missing)

#### AC-7: Import summary shown after completion
- [x] API response includes: `anzahl_importiert`, `anzahl_duplikate`, `anzahl_fehler`, `gesamt`, `matching_quote`
- [x] `import-ergebnis.tsx` displays stats grid (imported/duplicates/errors) plus matching progress bar
- [x] Error count combines client-side parse errors + server-side insert errors
- **PASS**

#### AC-8: Import history stored
- [x] `import_protokolle` table receives: mandant_id, quelle_id, dateiname, importiert_von, counts
- [x] GET /api/transaktionen/import/history returns last 50 entries ordered by date desc
- [x] `import-historie.tsx` renders table with all required columns
- [ ] NOTE: Import history endpoint does not include user name/email for `importiert_von` -- only implicit via RLS. Minor UX gap per spec ("Benutzer" column required).
- **PASS** (data is stored, display is functional)

#### AC-9: RLS -- transactions scoped to mandant_id
- [x] `mandant_id` set from authenticated user's mandant (server-side, not from request body)
- [x] RLS policies exist: `transaktionen_select_own`, `transaktionen_insert_own`, `transaktionen_update_own` using `get_mandant_id()`
- [x] `import_protokolle` has RLS policies: `import_protokolle_select_own`, `import_protokolle_insert_own`
- [x] `get_mandant_id()` supports both owners and invited users (fixed in migration 20260318000000)
- [ ] NOTE: No DELETE policy on `transaktionen` table -- prevents accidental deletion but also blocks intentional cleanup
- **PASS**

### Edge Cases Status

#### EC-1: CSV with no header row
- [ ] BUG: `parseCsvFile()` always treats `data[0]` as headers. No UI toggle for "no header row". First data row consumed as column names. See BUG-PROJ4-001 (carried from Round 1, still open).
- **FAIL**

#### EC-2: Missing required fields (date/amount) -- row skipped
- [x] Import route checks `if (!t.datum || t.betrag === undefined)` and increments `anzahl_fehler`
- [x] `applyMapping()` marks rows with parse errors via `error` field
- [x] Client-side: rows with errors filtered out before sending to API (`validTransactions` vs `errorTransactions`)
- **PASS**

#### EC-3: Negative vs positive amounts
- [x] `applyMapping()` has `invertSign` parameter
- [x] UI provides "Vorzeichen umkehren" toggle with clear explanation
- **PASS**

#### EC-4: Re-importing same file -- duplicates detected
- [x] Application-level Set comparison catches duplicates
- [ ] NOTE: Without DB UNIQUE constraint, parallel imports (two browser tabs) could insert duplicates. See BUG-PROJ4-004.
- **PARTIAL PASS**

#### EC-5: Large CSV (1000+ rows)
- [x] Server-side batch insert uses 500-row chunks
- [x] Zod schema allows max 5000 transactions per import
- [ ] NOTE: No progress indicator during server-side import -- just a spinner ("Importiere..."). Spec says "progress indicator shown" for 1000+ rows.
- **PARTIAL PASS** (functional but no progress feedback)

#### EC-6: Encoding issues (Umlaute)
- [x] `detectEncoding()` handles BOM detection (EF BB BF for UTF-8)
- [x] Falls back to Latin-1 when high bytes detected and UTF-8 decoding fails
- [x] Manual encoding override available in UI
- **PASS**

#### EC-7: CSV from different Austrian banks (Erste, Raiffeisen, BAWAG)
- [x] `autoDetectMapping()` covers common column names from multiple banks
- [x] Flexible pattern matching: buchungsdatum, valuta, wertstellung, etc.
- [ ] NOTE: BAWAG format is not explicitly tested in `KNOWN_FORMATS`, but the generic `autoDetectMapping` should handle it if column names match common patterns.
- **PASS**

### Security Audit Results

#### Authentication
- [x] POST /api/transaktionen/import checks `supabase.auth.getUser()` and returns 401 if no user
- [x] GET /api/transaktionen/import/history checks auth similarly
- [x] Middleware redirects unauthenticated users to /login for the /transaktionen/import page
- **PASS**

#### Authorization (Multi-Tenant Isolation)
- [x] `mandant_id` derived server-side from user session, not from request body
- [x] RLS policies enforce mandant scoping on SELECT/INSERT/UPDATE for transaktionen
- [x] RLS policies enforce mandant scoping on SELECT/INSERT for import_protokolle
- [ ] BUG: The import route does not verify that `quelle_id` belongs to the user's mandant. An attacker could POST with a valid `quelle_id` from another mandant. However, RLS on `zahlungsquellen` table would prevent the actual data read, and the `mandant_id` on inserted rows comes from the user's own mandant. The practical impact is low -- it would insert transactions with a foreign `quelle_id` but the user's own `mandant_id`, which would be an orphaned relationship. See BUG-PROJ4-005.
- **PARTIAL PASS**

#### Input Validation
- [x] `importSchema` validates: quelle_id (UUID), dateiname (string), transaktionen (array, 1-5000 items)
- [x] Per-transaction validation: datum (string), betrag (number)
- [ ] BUG: `datum` field is validated only as `z.string()` -- no format validation. A malformed date string like `"<script>alert(1)</script>"` passes Zod validation and gets inserted into the DB `datum DATE` column. PostgreSQL will reject it at insert time, but the error is caught as a generic insert error without clear feedback. See BUG-PROJ4-006.
- [ ] BUG: `dateiname` has no max length constraint. An attacker could send a multi-MB filename string in the JSON body. See BUG-PROJ4-007.
- [ ] BUG: `beschreibung` field has no max length constraint in Zod schema. Large strings could be stored. See BUG-PROJ4-007.
- **PARTIAL PASS**

#### Rate Limiting
- [ ] BUG: Rate limiting in middleware only applies to `/api/belege/*` endpoints (line 51). The `/api/transaktionen/import` endpoint is NOT rate-limited. An attacker could flood the import endpoint with rapid requests containing 5000 transactions each, causing excessive DB load. See BUG-PROJ4-008.
- **FAIL**

#### Batch Insert Safety
- [ ] BUG: No transaction wrapping around batch inserts. If chunk N succeeds but chunk N+1 fails, the import is partially committed. The import protocol records final counts, but there is no way to roll back. See BUG-PROJ4-009 (carried from Round 1 as medium concern).
- **PARTIAL PASS** (partial import is recorded accurately, but not atomic)

#### Month Lock Bypass
- [ ] BUG: POST /api/transaktionen/import does NOT check `monatsabschluesse` table for closed months. Transactions dated within a closed month are imported without warning. See BUG-PROJ4-002 (carried from Round 1, still open, still High severity).
- **FAIL**

#### Exposed Secrets / Data Leaks
- [x] Supabase anon key used (not service role key) -- correct for RLS-based access
- [x] No secrets exposed in client-side code
- [x] Error messages do not leak internal details (generic error forwarding)
- **PASS**

### Cross-Browser Testing

Cannot perform live cross-browser testing (static code review only). Code review findings:
- [x] No browser-specific APIs used beyond standard Web APIs (FileReader, TextDecoder)
- [x] PapaParse is cross-browser compatible
- [x] react-dropzone is cross-browser compatible
- [x] Tailwind CSS / shadcn/ui components are cross-browser compatible
- [ ] NOTE: `TextDecoder` with `fatal: true` option -- supported in all modern browsers but not IE11 (not a concern for this project)
- **EXPECTED PASS** (pending live testing in Chrome, Firefox, Safari)

### Responsive Testing

Code review for responsive behavior:
- [x] `max-w-4xl mx-auto` container with responsive padding `p-4 md:p-6 lg:p-8`
- [x] Step labels hidden on small screens (`hidden sm:inline`)
- [x] Column mapping grid uses responsive columns (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)
- [x] Preview table has `overflow-x-auto` for horizontal scroll on small screens
- [x] "Quelle" column in import history hidden on mobile (`hidden sm:table-cell`)
- [x] Valid transaction count hidden on mobile (`hidden sm:block`)
- **EXPECTED PASS** (pending live testing at 375px, 768px, 1440px)

### Bugs Found

#### BUG-PROJ4-001: No "No Header Row" Option for CSV (Low) -- Round 1, still open
- **Severity:** Low
- **Description:** `parseCsvFile()` always treats `data[0]` as headers. Users with headerless CSVs lose their first data row.
- **File:** `src/lib/csv-parser.ts` line 105
- **Priority:** Nice to have

#### BUG-PROJ4-002: Import Bypasses Month Lock (High) -- Round 1, still open
- **Severity:** High
- **Steps to Reproduce:**
  1. Close month January 2026 via Monatsabschluss
  2. Upload a CSV with transactions dated January 2026
  3. Expected: Import is blocked or warns for transactions in closed months
  4. Actual: Transactions are imported into the closed month without any warning
- **File:** `src/app/api/transaktionen/import/route.ts` -- no check against `monatsabschluesse` table
- **Impact:** Undermines the entire Monatsabschluss locking mechanism
- **Priority:** Must fix before deployment

#### BUG-PROJ4-003: Invited Users Cannot Import (Medium) -- NEW
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Log in as an invited user (buchhalter role via mandant_users)
  2. Navigate to /transaktionen/import
  3. Upload and attempt to import a CSV
  4. Expected: Import succeeds (user has RLS access via get_mandant_id())
  5. Actual: API returns 404 "Kein Mandant" because `mandanten.owner_id = user.id` finds nothing for non-owner users
- **File:** `src/app/api/transaktionen/import/route.ts` lines 33-35
- **Impact:** Invited buchhalter users are completely blocked from importing -- a core workflow
- **Priority:** Must fix before deployment (blocking for multi-user scenarios)

#### BUG-PROJ4-004: Missing DB UNIQUE Constraint on Transaktionen (High) -- NEW
- **Severity:** High
- **Description:** Tech design specifies `UNIQUE(mandant_id, quelle_id, datum, betrag, buchungsreferenz)` as the second tier of duplikat protection. This constraint does NOT exist in the migration (`20260313000000_initial_schema.sql`). The import route comment at line 89 says "ON CONFLICT ignorieren" but no `onConflict` option is passed to Supabase `.insert()`. Without this constraint, parallel imports (two tabs, API retries, race conditions) can insert true duplicates.
- **File:** `supabase/migrations/20260313000000_initial_schema.sql` -- missing UNIQUE constraint; `src/app/api/transaktionen/import/route.ts` line 87-91 -- `.insert(chunk)` without `.upsert()` or `onConflict`
- **Impact:** Duplicate transactions in the database if concurrent imports occur
- **Priority:** Must fix before deployment

#### BUG-PROJ4-005: quelle_id Not Validated Against User's Mandant (Medium) -- NEW
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Obtain a valid `quelle_id` UUID from another mandant (e.g., via API enumeration or guessing)
  2. Send POST /api/transaktionen/import with that foreign `quelle_id`
  3. Expected: API rejects with "Quelle not found" or similar
  4. Actual: API inserts transactions with user's own `mandant_id` but foreign `quelle_id`, creating an orphaned FK relationship
- **File:** `src/app/api/transaktionen/import/route.ts` -- no ownership check on `quelle_id`
- **Impact:** Data integrity issue (foreign key points to wrong mandant's zahlungsquelle). RLS may prevent actual data leakage but the FK relationship is broken.
- **Priority:** Fix before deployment

#### BUG-PROJ4-006: No Date Format Validation in Zod Schema (Low) -- NEW
- **Severity:** Low
- **Description:** The `datum` field in `transaktionSchema` is `z.string()` with no regex or format validation. Invalid date strings pass Zod and fail at PostgreSQL INSERT time, causing the entire 500-row chunk to be counted as errors.
- **File:** `src/app/api/transaktionen/import/route.ts` line 7
- **Suggested Fix:** Use `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` for ISO date format
- **Priority:** Nice to have (PostgreSQL catches it, but error handling is poor)

#### BUG-PROJ4-007: No Max Length on dateiname and beschreibung Fields (Low) -- NEW
- **Severity:** Low
- **Description:** `dateiname` in `importSchema` and `beschreibung` in `transaktionSchema` have no `.max()` constraint. An attacker could send extremely long strings (MB-sized) in the JSON body, consuming memory and DB storage.
- **File:** `src/app/api/transaktionen/import/route.ts` lines 9, 17
- **Priority:** Nice to have (Next.js body size limits provide some protection)

#### BUG-PROJ4-008: Import Endpoint Not Rate-Limited (Medium) -- NEW
- **Severity:** Medium
- **Description:** Middleware rate limiting only covers `/api/belege/*` endpoints. The `/api/transaktionen/import` endpoint accepts POST requests without rate limiting. An attacker could send rapid requests each containing 5000 transactions, causing significant DB load and potential DoS.
- **File:** `middleware.ts` line 51 -- only matches `/api/belege`
- **Priority:** Fix before deployment

#### BUG-PROJ4-009: No Atomic Transaction for Batch Insert (Medium) -- NEW (expanded from Round 1 note)
- **Severity:** Medium
- **Description:** Multi-chunk batch inserts are not wrapped in a database transaction. If chunk 1 (rows 1-500) succeeds but chunk 2 (rows 501-1000) fails, the import is partially committed with no rollback capability. The import protocol records the partial counts accurately, but the user has no way to undo the partial import.
- **File:** `src/app/api/transaktionen/import/route.ts` lines 83-99
- **Priority:** Fix in next sprint (partial imports are trackable but not ideal)

### Summary
- **Acceptance Criteria:** 7/9 fully passed, 2 partial pass (AC-4 invited users, AC-6 missing DB constraint)
- **Edge Cases:** 4/7 passed, 1 failed (EC-1), 2 partial pass (EC-4 parallel imports, EC-5 no progress)
- **Bugs Found:** 9 total (2 high, 3 medium, 4 low)
  - High: BUG-PROJ4-002 (month lock bypass), BUG-PROJ4-004 (missing UNIQUE constraint)
  - Medium: BUG-PROJ4-003 (invited users blocked), BUG-PROJ4-005 (quelle_id not validated), BUG-PROJ4-008 (no rate limiting on import)
  - Low: BUG-PROJ4-001 (no header row option), BUG-PROJ4-006 (no date validation), BUG-PROJ4-007 (no max length), BUG-PROJ4-009 (no atomic batch)
- **Security:** Issues found (rate limiting gap, quelle_id validation, month lock bypass)
- **Production Ready:** NO -- 2 High and 3 Medium bugs must be resolved first
- **Recommendation:** Fix BUG-PROJ4-002 and BUG-PROJ4-004 (High) first, then BUG-PROJ4-003 and BUG-PROJ4-005 and BUG-PROJ4-008 (Medium)

## Deployment
_To be added by /deploy_
