# PROJ-7: Kassabuch

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-18

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding)
- Requires: PROJ-3 (Belegverwaltung) – Belege für Kassazuordnung
- Requires: PROJ-5 (Matching-Engine) – Matching-Logik wird wiederverwendet
- Requires: PROJ-6 (Manuelle Zuordnung) – Manuelle Zuordnung gilt auch für Kassakassa

## User Stories
- As a user, I want to manage a cash register journal (Kassabuch) as a separate payment source so that cash transactions are tracked separately from bank transactions
- As a user, I want to manually enter cash transactions (date, amount, description, supplier) so that my cash payments are recorded
- As a user, I want cash transactions to go through the same matching process as bank transactions so that I don't need a separate workflow
- As a user, I want to see the running cash balance so that I can verify my physical cash count

## Acceptance Criteria
- [ ] Kassabuch is a separate `zahlungsquelle` in the system (type = KASSA, alongside type = KONTOAUSZUG)
- [ ] User can add cash transactions manually: Datum, Betrag (Ausgabe negativ, Einnahme positiv), Beschreibung, Lieferant (Freitext)
- [ ] User can edit and delete cash transactions (soft delete)
- [ ] Cash transactions appear in the same transaction list view, filterable by source (Kassa / Bank)
- [ ] Matching engine runs identically on cash transactions (same Stufe 1 + Stufe 2 logic)
- [ ] Manual assignment (PROJ-6) works identically for cash transactions
- [ ] Running cash balance displayed: Anfangssaldo + sum of all transactions = current balance
- [ ] User sets the opening balance (Anfangssaldo) for the Kassabuch
- [ ] Monthly closing (PROJ-8) includes Kassabuch as a required source
- [ ] RLS: Kassabuch transactions scoped to mandant_id

## Edge Cases
- User enters a positive cash amount (Einnahme) → allowed, shown separately but included in balance
- Running balance goes negative → warning shown (unusual for a Kassabuch)
- CSV import not supported for Kassabuch (manual entry only in MVP)
- Multiple months of Kassabuch entries → balance carries forward month to month
- Opening balance can only be set once; changes require admin confirmation (or simply allow editing with a warning)

## Technical Requirements
- Kassabuch shares the `transaktionen` table with a `quelle_id` pointing to the Kassa source
- No separate table needed – matching logic is source-agnostic
- Opening balance stored on the `zahlungsquellen` record

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/kassabuch/                    ← eigene Seite (nicht in /transaktionen)
├── KassabuchHeader
│   ├── SaldoAnzeige                    ← Anfangssaldo + Summe = Aktueller Saldo
│   │   └── NegativSaldoWarnung         ← Badge wenn Saldo < 0
│   ├── AnfangssaldoButton              ← Öffnet Anfangssaldo-Dialog
│   └── EintragHinzufügenButton
│
├── KassabuchTabelle                    ← Chronologisch, neueste oben
│   └── KassaEintragZeile (×n)
│       ├── Datum / Lieferant / Beschreibung
│       ├── Betrag                      ← Rot (Ausgabe) / Grün (Einnahme)
│       ├── AmpelBadge                  ← Identisch zu PROJ-5
│       ├── BelegReferenz
│       └── AktionenMenu                ← Bearbeiten / Löschen / Zuordnen
│
├── KassaEintragDialog                  ← Neu + Bearbeiten
│   ├── DatumPicker / BetragFeld (mit Vorzeichen-Toggle)
│   ├── LieferantFeld / BeschreibungFeld
│   └── ZuordnenOptional                ← Beleg direkt beim Erstellen zuordnen
│
└── AnfangssaldoDialog
    ├── SaldoFeld
    └── WarnungBeiÄnderung

API:
  POST   /api/kassabuch/eintraege
  PATCH  /api/kassabuch/eintraege/[id]
  DELETE /api/kassabuch/eintraege/[id]  ← Soft Delete
  PATCH  /api/kassabuch/anfangssaldo
```

### Datenmodell (keine neue Tabelle)

```
zahlungsquellen (bestehend)
  → typ = "kassa", automatisch beim Onboarding angelegt
  → anfangssaldo (Decimal)              ← neues Feld
  → anfangssaldo_gesetzt_am (Timestamp)

transaktionen (bestehend)
  → Kassaeinträge: quelle_id = Kassa-Zahlungsquelle
  → Positiv = Einnahme, Negativ = Ausgabe
  → Alle match_* Felder identisch zu Bankbuchungen
  → geloescht_am (Timestamp)            ← Soft Delete (neues Feld)

Saldo: anfangssaldo + SUM(betrag) wo nicht gelöscht = Aktueller Kassastand
```

### Unterschiede zu Kontoauszug

| Aspekt | Kontoauszug | Kassabuch |
|---|---|---|
| Erfassung | CSV-Import | Manuelle Eingabe |
| Bearbeiten/Löschen | Nein | Ja (Soft Delete) |
| Saldo | Nein | Laufender Saldo |
| Matching + Zuordnung | Identisch (PROJ-5/6) | Identisch (PROJ-5/6) |

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Eigene Seite /kassabuch | Ja | Andere UX (editierbar, Saldo) – eigene Seite sinnvoller |
| Geteiltes Datenmodell | Ja | Matching ohne Änderung, kein Code-Duplication |
| Saldo-Berechnung | On-the-fly Client-side | Keine extra DB-Spalte, bei < 1.000 Einträgen instant |

### Abhängigkeiten

Keine neuen Packages.

## Frontend Implementation Notes

**Implemented on:** 2026-03-17

### Components Created
- `src/components/kassabuch/saldo-anzeige.tsx` - Balance card showing Anfangssaldo, Bewegungen, and Aktueller Kassastand with negative balance warning badge
- `src/components/kassabuch/kassabuch-tabelle.tsx` - Table with edit/delete/matching actions menu per row, reuses AmpelBadge from PROJ-5
- `src/components/kassabuch/kassa-eintrag-dialog.tsx` - Add/Edit dialog with Vorzeichen-Toggle (Ausgabe/Einnahme), Datum, Betrag, Lieferant, Beschreibung
- `src/components/kassabuch/anfangssaldo-dialog.tsx` - Opening balance dialog with warning when entries exist
- `src/components/kassabuch/kassa-loeschen-dialog.tsx` - Soft-delete confirmation dialog

### Page
- `src/app/(app)/kassabuch/page.tsx` - Main page with header, saldo card, filter bar (search, dates, match-status), table, and all dialogs

### Reused Components
- `AmpelBadge` from `@/components/transaktionen/ampel-badge` (identical matching status display)
- `ZuordnungsDialog` from `@/components/transaktionen/zuordnungs-dialog` (manual assignment, PROJ-6)

### API Integration
- GET `/api/kassabuch/eintraege` - Fetch entries with date filters
- POST `/api/kassabuch/eintraege` - Create new entry
- PATCH `/api/kassabuch/eintraege/[id]` - Edit entry
- DELETE `/api/kassabuch/eintraege/[id]` - Soft delete
- GET `/api/kassabuch/saldo` - Fetch current balance
- PATCH `/api/kassabuch/anfangssaldo` - Set opening balance
- Matching actions use existing `/api/matching/*` and `/api/transaktionen/[id]/match` endpoints

### Design Decisions
- Client-side filtering for search and status (API already handles date filtering server-side)
- Saldo is fetched from dedicated endpoint (server-side calculation), not computed client-side, to ensure accuracy
- Sidebar already had Kassabuch nav item (BookOpen icon)

## QA Test Results (Round 2)

**Tested:** 2026-03-18
**App URL:** http://localhost:3000/kassabuch
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification + security audit
**Build Status:** PASS (Next.js 16.1.1 compiles successfully)

### Previous Round Resolution

BUG-PROJ7-1 from Round 1 (missing `ensure_kassa_quelle` RPC function) was a **false positive**. The function IS defined in `supabase/migrations/20260313000000_initial_schema.sql` at line 142. Resolved.

### Acceptance Criteria Status

#### AC-1: Kassabuch is a separate zahlungsquelle (type = KASSA)
- [x] `getOrCreateKasseQuelle()` in `src/lib/kassabuch.ts` creates/retrieves a kassa-type source
- [x] Uses `ensure_kassa_quelle` RPC function (defined in initial_schema.sql line 142)
- [x] Function is SECURITY DEFINER and idempotent
- **PASS**

#### AC-2: User can add cash transactions manually
- [x] POST /api/kassabuch/eintraege with Zod schema: datum, betrag (non-zero), beschreibung
- [x] `kassa-eintrag-dialog.tsx` with Vorzeichen-Toggle for Ausgabe/Einnahme
- [ ] BUG: `lieferant` field accepted by Zod schema but `transaktionen` table has no `lieferant` column -- insert will fail with DB error when lieferant is provided (see BUG-PROJ7-2)
- **FAIL** (see BUG-PROJ7-2)

#### AC-3: User can edit and delete cash transactions (soft delete)
- [x] PATCH /api/kassabuch/eintraege/[id] for editing
- [x] DELETE /api/kassabuch/eintraege/[id] sets `geloescht_am` (soft delete)
- [x] Both check month lock before modification
- [x] DELETE checks both original and target month when datum changes
- [ ] BUG: PATCH update schema also includes `lieferant` which will cause DB error (same root cause as BUG-PROJ7-2)
- [ ] BUG: PATCH/DELETE do not verify the transaction belongs to a kassa source -- bank transactions can be edited/deleted via kassa endpoint (see BUG-PROJ7-3)
- **FAIL** (see BUG-PROJ7-2, BUG-PROJ7-3)

#### AC-4: Cash transactions appear in same transaction list, filterable by source
- [x] Kassabuch entries stored in `transaktionen` table with kassa quelle_id
- [x] GET /api/transaktionen supports `quelle_id` filter param
- [ ] BUG: `/transaktionen` page UI has NO source filter dropdown (Kassa/Bank). The API supports it but the frontend does not expose it (see BUG-PROJ7-4)
- [ ] BUG: GET /api/transaktionen does NOT filter out soft-deleted entries (`geloescht_am IS NULL`). Deleted kassa entries still appear in the main transaction list (see BUG-PROJ7-5)
- **FAIL** (see BUG-PROJ7-4, BUG-PROJ7-5)

#### AC-5: Matching engine runs identically on cash transactions
- [x] Same `transaktionen` table, same matching logic applies
- [x] Matching endpoints `/api/matching/confirm`, `/api/matching/reject` work on any transaction
- **PASS**

#### AC-6: Manual assignment works identically for cash transactions
- [x] Same API endpoint `/api/transaktionen/[id]/match` used
- [x] ZuordnungsDialog reused from PROJ-6
- [x] Confirm, reject, kein_beleg, remove match all wired in KassaAktionenMenu
- **PASS**

#### AC-7: Running cash balance displayed
- [x] `saldo-anzeige.tsx` shows Anfangssaldo + Bewegungen = Aktueller Kassastand
- [x] GET /api/kassabuch/saldo endpoint calculates server-side
- [x] Correctly filters out soft-deleted entries in saldo calculation
- **PASS**

#### AC-8: User sets opening balance (Anfangssaldo)
- [x] PATCH /api/kassabuch/anfangssaldo sets value on zahlungsquellen record
- [x] `anfangssaldo-dialog.tsx` with warning when entries exist
- [x] Records `anfangssaldo_gesetzt_am` timestamp
- **PASS**

#### AC-9: Monthly closing includes Kassabuch as required source
- [x] Completeness check includes all active sources (kassa is an active zahlungsquelle)
- **PASS**

#### AC-10: RLS -- Kassabuch transactions scoped to mandant_id
- [x] `transaktionen` table has RLS enabled with `mandant_id = get_mandant_id()` policies
- [x] mandant_id set on insert from server-side lookup
- [ ] BUG: All Kassabuch API routes use `owner_id` lookup instead of `getMandantId()` RPC. Invited users (Buchhalter role from PROJ-12) cannot access Kassabuch at all (see BUG-PROJ7-6)
- **FAIL** (see BUG-PROJ7-6)

### Edge Cases Status

#### EC-1: Positive cash amount (Einnahme) allowed
- [x] Betrag validation only checks non-zero, allows positive and negative
- [x] Vorzeichen-Toggle in dialog correctly applies sign
- **PASS**

#### EC-2: Running balance goes negative -- warning shown
- [x] `saldo-anzeige.tsx` has negative balance warning badge (AlertTriangle icon)
- [x] Red styling applied to negative saldo value
- **PASS**

#### EC-3: CSV import not supported for Kassabuch
- [x] No import route for Kassabuch (manual entry only)
- **PASS**

#### EC-4: Multiple months -- balance carries forward
- [x] Saldo endpoint sums ALL non-deleted entries regardless of date range
- **PASS**

#### EC-5: Opening balance editing with warning
- [x] Alert shown when entries exist ("wirkt sich auf den aktuellen Kassastand aus")
- [x] No hard block on re-editing (allows editing with warning, as spec permits)
- **PASS**

#### EC-6 (New): Edit dialog lieferant field on edit mode
- [ ] BUG: When editing an entry, `lieferant` is always reset to empty string (line 61: `setLieferant('')`) regardless of what was originally entered. Even if the DB error from BUG-PROJ7-2 is fixed, the lieferant data would be lost on edit (see BUG-PROJ7-7)
- **FAIL**

### Security Audit Results

#### Authentication
- [x] All 5 API routes check `supabase.auth.getUser()` and return 401 if not authenticated
- [x] DELETE route additionally calls `requireAdmin()` (admin-only deletion)

#### Authorization / Multi-Tenant
- [x] RLS on `transaktionen` table enforces mandant isolation
- [ ] BUG: Mandant lookup uses `owner_id` instead of `getMandantId()` -- excludes invited users (BUG-PROJ7-6)
- [ ] BUG: PATCH/DELETE `/api/kassabuch/eintraege/[id]` do not verify the transaction is a kassa-type entry. An attacker (same mandant) could use the kassa edit/delete endpoints to modify bank import transactions that should be read-only (BUG-PROJ7-3)

#### Input Validation
- [x] Zod schemas on all mutation endpoints (POST, PATCH, PATCH anfangssaldo)
- [x] Date format validated via regex `^\d{4}-\d{2}-\d{2}$`
- [x] Betrag validated as non-zero number
- [x] UUID validation on `beleg_id` parameter
- [x] No raw SQL -- all queries use Supabase client (safe from SQL injection)

#### Month Lock Enforcement
- [x] POST checks month lock on the entry date
- [x] PATCH checks month lock on both original and new date (if changed)
- [x] DELETE checks month lock before soft-deleting

#### Rate Limiting
- [ ] No rate limiting on any Kassabuch endpoint. A malicious script could create unlimited entries via POST. (Low severity for MVP, but noted.)

#### Data Exposure
- [x] API responses do not leak sensitive fields
- [x] Error messages are generic, no stack traces exposed
- [x] `ensure_kassa_quelle` is SECURITY DEFINER which is appropriate for cross-table operations

#### XSS
- [x] React auto-escapes all rendered strings in the UI
- [x] No `dangerouslySetInnerHTML` usage

### Cross-Browser / Responsive Notes

#### Responsive Design (Code Review)
- [x] 375px (Mobile): Filter bar uses `flex-col` stacking, table has `overflow-x-auto`, description column hidden via `hidden md:table-cell`
- [x] 768px (Tablet): Filter bar transitions to row layout via `sm:flex-row`, description column visible
- [x] 1440px (Desktop): Full layout with all columns visible including `hidden lg:table-cell` Beleg column
- [x] Header buttons stack vertically on mobile (`flex-col gap-4 sm:flex-row`)

#### Accessibility
- [x] All form inputs have labels (htmlFor properly set)
- [x] Dropdown menus have aria-label
- [x] AlertDialog used for destructive actions (proper focus trap)

### Bugs Found

#### BUG-PROJ7-2: Lieferant field causes database error on insert/update (High)
- **Severity:** High
- **Steps to Reproduce:**
  1. Go to /kassabuch
  2. Click "Neuer Eintrag"
  3. Fill in Datum, Betrag, and type something in the "Lieferant / Empfaenger" field
  4. Click "Eintrag erstellen"
  5. Expected: Entry is created with lieferant data
  6. Actual: 500 error because `transaktionen` table has no `lieferant` column. The Zod schema accepts the field and spreads it into the INSERT object.
- **Root Cause:** `src/app/api/kassabuch/eintraege/route.ts` line 11 accepts `lieferant` in the Zod schema. Line 73 spreads all parsed fields (including `lieferant`) into the DB insert. The `transaktionen` table (initial_schema.sql line 200-220) has no `lieferant` column.
- **Affected Files:** `src/app/api/kassabuch/eintraege/route.ts`, `src/app/api/kassabuch/eintraege/[id]/route.ts`
- **Priority:** Fix before deployment

#### BUG-PROJ7-3: Kassa edit/delete endpoints allow modifying bank transactions (Medium)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have both bank-imported transactions and kassa entries in the system
  2. Call PATCH /api/kassabuch/eintraege/{bank_transaction_id} with modified data
  3. Expected: 403 or 400 error (bank transactions should be read-only)
  4. Actual: Bank transaction is updated (only RLS mandant check, no source-type check)
- **Root Cause:** `src/app/api/kassabuch/eintraege/[id]/route.ts` PATCH and DELETE handlers fetch the transaction by ID but never verify `quelle_id` belongs to a kassa-type source.
- **Impact:** Breaks the design contract that bank-imported transactions are read-only (per spec: "Bearbeiten/Loeschen: Nein" for Kontoauszug)
- **Priority:** Fix before deployment

#### BUG-PROJ7-4: Missing source filter on /transaktionen page (Medium)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to /transaktionen
  2. Look for a filter to show only Kassa or Bank entries
  3. Expected: A source filter dropdown (Kassa / Bank / Alle) per AC-4
  4. Actual: No source filter exists. Only search, date, and match-status filters available.
- **Root Cause:** `src/app/(app)/transaktionen/page.tsx` does not implement a source/quelle filter, even though the API supports `quelle_id` parameter.
- **Priority:** Fix before deployment

#### BUG-PROJ7-5: Soft-deleted entries visible in /transaktionen list (High)
- **Severity:** High
- **Steps to Reproduce:**
  1. Create a kassa entry
  2. Delete the kassa entry (soft delete sets `geloescht_am`)
  3. Go to /transaktionen
  4. Expected: Deleted entry is not visible
  5. Actual: Deleted entry still appears because GET /api/transaktionen does not filter `.is('geloescht_am', null)`
- **Root Cause:** `src/app/api/transaktionen/route.ts` query does not include `.is('geloescht_am', null)` filter. The Kassabuch-specific GET endpoint correctly filters soft-deleted entries, but the shared transaktionen endpoint does not.
- **Priority:** Fix before deployment

#### BUG-PROJ7-6: Invited users cannot access Kassabuch (High)
- **Severity:** High
- **Steps to Reproduce:**
  1. As mandant owner, invite a Buchhalter user (PROJ-12)
  2. Log in as the invited Buchhalter
  3. Navigate to /kassabuch
  4. Expected: Kassabuch loads with entries
  5. Actual: 404 "Kein Mandant" error. All Kassabuch API routes look up mandant via `.eq('owner_id', user.id)` which only finds the mandant for the owner, not invited users.
- **Root Cause:** All 4 Kassabuch route files use direct `mandanten.owner_id` lookup instead of the `getMandantId()` helper (which calls the `get_mandant_id` RPC that checks both `mandanten.owner_id` and `mandant_users` table). Compare with other API routes like `/api/belege/route.ts` which correctly uses `getMandantId()`.
- **Affected Files:** `src/app/api/kassabuch/eintraege/route.ts`, `src/app/api/kassabuch/saldo/route.ts`, `src/app/api/kassabuch/anfangssaldo/route.ts`
- **Priority:** Fix before deployment

#### BUG-PROJ7-7: Lieferant field empty when editing existing entry (Low)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Create a kassa entry with a lieferant value (if BUG-PROJ7-2 is fixed)
  2. Click "Bearbeiten" on the entry
  3. Expected: Lieferant field is pre-filled with original value
  4. Actual: Lieferant field is always empty (line 61 of kassa-eintrag-dialog.tsx: `setLieferant('')`)
- **Root Cause:** The comment in code says "lieferant is in beschreibung for kassa entries" but the form sends lieferant as a separate field.
- **Priority:** Fix alongside BUG-PROJ7-2

### Regression Impact

- **PROJ-4 (Transaktionen):** BUG-PROJ7-5 affects the shared transaktionen list (soft-deleted entries visible).
- **PROJ-12 (User-Rollen):** BUG-PROJ7-6 breaks invited user access to Kassabuch.
- **No regression on:** PROJ-1, PROJ-2, PROJ-3, PROJ-5, PROJ-6 (verified via code review).

### Summary
- **Acceptance Criteria:** 6/10 passed, 4 failed (AC-2, AC-3, AC-4, AC-10)
- **Edge Cases:** 5/6 passed, 1 failed (EC-6)
- **Bugs Found:** 6 total (0 critical, 3 high, 2 medium, 1 low)
- **Security:** 1 authorization issue (BUG-PROJ7-3), 1 access control issue (BUG-PROJ7-6), no rate limiting (noted but low priority for MVP)
- **Build:** PASS
- **Production Ready:** NO -- 3 high-severity and 2 medium-severity bugs must be fixed first

## Deployment
_To be added by /deploy_
