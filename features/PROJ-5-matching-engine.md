# PROJ-5: Matching-Engine

## Status: Deployed
**Created:** 2026-03-13
**Last Updated:** 2026-03-19

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Belege mit Metadaten müssen vorhanden sein
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen importiert sein

## User Stories
- As a user, I want imported transactions to be automatically matched to invoice documents so that I save hours of manual work
- As a user, I want to see a traffic-light status (green/yellow/red) for each transaction so that I know which ones need attention
- As a user, I want to understand why a match was made (match reason shown) so that I can trust the automation
- As a user, I want to see suggested matches for unmatched transactions (yellow) so that I can quickly confirm them

## Acceptance Criteria
- [ ] After import (or on-demand), matching engine runs automatically for all unmatched transactions of the mandant
- [ ] **Stufe 1 – Hard Match** (Score 100, deterministisch): matched instantly, no user confirmation needed
  - RN_MATCH: Rechnungsnummer found in transaction description
  - SEPA_MATCH: SEPA Verwendungszweck matches invoice reference
  - IBAN_GUARDED: IBAN in transaction matches supplier's known IBAN + amount matches
  - PAYPAL_ID_MATCH: PayPal transaction ID matches invoice reference
- [ ] **Stufe 2 – Score-Matching** (0–100 Punkte):
  - Betrag: exakte Übereinstimmung = 40 Punkte, ±1% = 20 Punkte
  - Datum: ±3 Tage = 15 Punkte, ±7 Tage = 10 Punkte, ±30 Tage = 5 Punkte
  - Lieferant: Name-Match im Verwendungszweck = 25 Punkte
  - Beschreibung: Keyword-Match = 10 Punkte
- [ ] Score ≥ 80 → Grün (auto-matched, shown as confirmed)
- [ ] Score 50–79 → Gelb (suggested match, requires user confirmation)
- [ ] Score < 50 or no match → Rot (unmatched, requires manual assignment)
- [ ] Each transaction shows: Ampelfarbe, matched Beleg (if any), Match-Grund, Score
- [ ] Matching re-runs automatically when new belege are uploaded or transactions imported
- [ ] Match-Quote metric: percentage of transactions with green status (target: ≥ 80%)

## Edge Cases
- One transaction matches multiple invoices → take highest score; if tied, flag as yellow for manual review
- One invoice matched to multiple transactions → warn user, flag as conflict (orange)
- Transaction amount differs slightly from invoice (e.g., Skonto, bank fees) → score-based, surfaces as yellow
- Matching runs on large dataset (500+ transactions, 500+ belege) → must complete in < 10s
- Beleg deleted after being matched → transaction reverts to rot status
- User manually confirms a yellow match → status set to green, locked
- User rejects a suggested match → transaction stays red, suggestion suppressed

## Technical Requirements
- Matching logic implemented as pure TypeScript function (source-agnostic, works on normalized transaction objects)
- Deterministic: same input always produces same output
- No external API calls during matching
- Runs server-side (Next.js API route or Supabase Edge Function)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
app/(app)/transaktionen/
└── TransaktionenPage
    ├── MatchingStatusBar               ← "87% gematcht – 12 offen"
    │   └── MatchingNeustartenButton    ← On-Demand Matching (manueller Button-Klick)
    │
    ├── TransaktionenTabelle
    │   └── TransaktionZeile (×n)
    │       ├── AmpelBadge              ← ● Grün / ● Gelb / ● Rot
    │       ├── BelegReferenz           ← Lieferant + RN wenn gematcht
    │       ├── MatchGrund              ← "RN_MATCH", "Score 85", etc.
    │       └── AktionenMenu            ← Bestätigen / Ablehnen / Manuell zuordnen
    │
    └── FilterBar (Erweiterung)
        └── StatusFilter                ← Alle / Grün / Gelb / Rot

API Routes:
  POST /api/matching/run               ← Matching auslösen (nach Import + on-demand)
  POST /api/matching/confirm           ← Match bestätigen
  POST /api/matching/reject            ← Match ablehnen
```

### Matching-Logik (Ablauf)

```
Trigger: automatisch nach CSV-Import ODER manuell per Button-Klick
        ↓
Lade alle ungematchten Transaktionen + offene Belege des Mandanten
        ↓
Für jede Transaktion:
  Stufe 1 – Hard Match (deterministisch, Score 100):
    RN_MATCH: Rechnungsnummer im Verwendungszweck?
    SEPA_MATCH: SEPA-Referenz stimmt überein?
    IBAN_GUARDED: IBAN + exakter Betrag?
    PAYPAL_ID_MATCH: PayPal-ID stimmt?
    → Treffer: Status = GRÜN, match_type gesetzt

  Stufe 2 – Score-Matching (wenn kein Hard Match):
    Betrag (0–40) + Datum (0–15) + Lieferant (0–25) + Beschreibung (0–10)
    ≥ 80 → GRÜN | 50–79 → GELB | < 50 → ROT
        ↓
Ergebnisse in transaktionen schreiben (match_status, match_score, beleg_id)
```

### Datenmodell-Erweiterung

```
Tabelle: transaktionen (zusätzlich zu PROJ-4)
  - beleg_id (UUID, FK → belege, nullable)
  - match_type (Text)         → RN_MATCH / SEPA_MATCH / IBAN_GUARDED / PAYPAL_ID_MATCH / SCORE / MANUAL
  - match_abgelehnte_beleg_ids (UUID[])  → abgelehnte Vorschläge nicht nochmal vorschlagen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Matching-Logik | Pure TypeScript-Funktion | Testbar, source-agnostisch, portierbar |
| Trigger | Nach Import + manueller Button-Klick | Flexibel für beide Workflows |
| Ausführungsort | Next.js API Route (MVP) | Ausreichend für 500×500 Vergleiche (< 5s); bei Bedarf → Edge Function |
| Ergebnis | In transaktionen Tabelle | Kein separates Match-Log nötig im MVP |

### Abhängigkeiten

Keine neuen Packages – reine TypeScript-Logik.

## Frontend Implementation Notes
- **MatchingStatusBar**: Shows match quote percentage, counts per status (green/yellow/red), progress bar, and "Matching neu starten" button
- **AmpelBadge**: Traffic-light badge component with tooltip showing score
- **MatchGrund**: Displays match type (RN_MATCH, SEPA_MATCH, Score X, Manual, etc.) with tooltip explanation
- **MatchingAktionenMenu**: Dropdown with confirm/reject/manual assign actions per transaction
- **TransaktionenTabelle**: Updated to show Beleg reference (supplier + invoice number), match reason, and action menu
- **TransaktionenPage**: Integrated MatchingStatusBar, updated filter to use traffic-light colored status options
- **TransaktionWithRelations** type added for joined API response data (belege + zahlungsquellen)
- All components use shadcn/ui primitives (Badge, Tooltip, DropdownMenu, Card, Progress, Table)
- Responsive: Beleg and Match-Grund columns hidden below lg breakpoint

## QA Test Results

### Round 1 (2026-03-17)

**Tested:** 2026-03-17
**Tester:** QA Engineer (AI)
**Method:** Static code review of matching logic + API routes
**Bugs found:** BUG-PROJ5-1 (Medium), BUG-PROJ5-2 (High)
**Result:** NOT production-ready

### Round 2 (2026-03-18)

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Full static code review of matching logic, all API routes, frontend components, DB schema, RLS policies, and middleware

---

### Regression Check from Round 1

- **BUG-PROJ5-2 (Beleg Deletion Does Not Revert Transaction Match Status): FIXED.** DELETE /api/belege/[id] now properly resets the transaction (beleg_id=null, match_status=offen, match_type=null, match_score=0) when the deleted beleg was zugeordnet (lines 74-87 of belege/[id]/route.ts).
- **BUG-PROJ5-1 (Matching Not Triggered on Beleg Upload): STILL OPEN.** POST /api/belege still only saves metadata without triggering matching. See BUG-PROJ5-001 below.

---

### Acceptance Criteria Status

#### AC-1: Matching runs automatically after import or on-demand
- [x] POST /api/transaktionen/import runs matching inline after successful insert (Step 5, lines 158-196)
- [x] POST /api/matching/run provides on-demand matching trigger
- **PASS**

#### AC-2: Stufe 1 -- Hard Match (Score 100, deterministic)
- [x] RN_MATCH: Checks if `rechnungsnummer` (>3 chars) appears in `beschreibung` or `buchungsreferenz` (matching.ts lines 87-92)
- [x] SEPA_MATCH: Checks if `buchungsreferenz` equals `rechnungsnummer` normalized (matching.ts lines 95-99)
- [x] PAYPAL_ID_MATCH: Checks if description contains "paypal" AND rechnungsnummer appears in description (matching.ts lines 102-106)
- [ ] IBAN_GUARDED: Not implemented. Code comment says "Zukunftig: lieferant_iban fur IBAN_GUARDED". The beleg type does not include lieferant_iban field.
- **PARTIAL PASS** (IBAN_GUARDED missing -- see BUG-PROJ5-002)

#### AC-3: Stufe 2 -- Score-Matching (0-100)
- [x] Betrag: exact = 40pts, +/-1% = 20pts (matching.ts lines 46-53)
- [x] Datum: +/-3 days = 15pts, +/-7 = 10pts, +/-30 = 5pts (matching.ts lines 55-62)
- [x] Lieferant: Name words (>3 chars) in description, >=50% match = 25pts (matching.ts lines 64-72)
- [x] Beschreibung: Rechnungsnummer in description = 10pts (matching.ts lines 74-77)
- **PASS**

#### AC-4: Score >= 80 = Gruen (auto-matched, confirmed)
- [x] `if (effectiveScore >= 80) match_status = 'bestaetigt'` (matching.ts line 175)
- **PASS**

#### AC-5: Score 50-79 = Gelb (suggested, requires user confirmation)
- [x] `else if (effectiveScore >= 50) match_status = 'vorgeschlagen'` (matching.ts line 176)
- **PASS**

#### AC-6: Score < 50 or no match = Rot (unmatched)
- [x] `else match_status = 'offen'` (matching.ts line 177)
- **PASS**

#### AC-7: Each transaction shows Ampelfarbe, matched Beleg, Match-Grund, Score
- [x] `ampel-badge.tsx` renders traffic-light badge with color-coded dot + label + score tooltip
- [x] `match-grund.tsx` shows match type badge with description tooltip
- [x] `transaktionen-tabelle.tsx` displays Beleg reference (lieferant + RN), Match-Grund, and actions menu
- [x] Beleg and Match-Grund columns hidden below lg breakpoint (responsive)
- **PASS**

#### AC-8: Matching re-runs when new belege uploaded or transactions imported
- [x] Runs after CSV import (inline in import route, Step 5)
- [ ] BUG: Matching does NOT automatically re-run when new belege are uploaded. POST /api/belege (line 56-81) just saves metadata without triggering matching.
- **PARTIAL PASS** (see BUG-PROJ5-001)

#### AC-9: Match-Quote metric
- [x] POST /api/matching/run returns `match_quote` percentage (line 90)
- [x] MatchingStatusBar component computes and shows match_quote from local data
- **PASS**

---

### Edge Cases Status

#### EC-1: One transaction matches multiple invoices -- take highest score
- [x] Algorithm iterates all belege, tracks `bestBeleg` with highest score (matching.ts lines 134-163)
- **PASS**

#### EC-2: Tied scores at 100 (Hard Match) -- flag as yellow for manual review
- [x] `tieScore = true` when two hard matches found, effectiveScore drops to 79 (yellow) (matching.ts line 172)
- [ ] BUG: Tie detection only works for Hard Match (score 100). For score-based ties (e.g., two belege both score 75), the tieScore flag is set but the effectiveScore is NOT reduced to < 50 or flagged differently -- so the first beleg found at that score wins arbitrarily, and `tieScore` has no effect on the final status for non-100 scores. See BUG-PROJ5-003.
- **PARTIAL PASS**

#### EC-3: Transaction amount differs slightly (Skonto, bank fees)
- [x] Score-based: exact match = 40pts, +/-1% = 20pts, else 0
- **PASS**

#### EC-4: Large dataset (500+ TX, 500+ belege) < 10s
- [x] Pure TypeScript, O(n*m) complexity. For 500x500 = 250,000 comparisons with simple string operations, should complete well under 1 second.
- **PASS**

#### EC-5: Beleg deleted after being matched -- transaction reverts to rot status
- [x] FIXED in current code: DELETE /api/belege/[id] now resets the linked transaction to offen status (belege/[id]/route.ts lines 74-87)
- **PASS** (previously FAIL in Round 1)

#### EC-6: User rejects suggested match -- suggestion suppressed
- [x] POST /api/matching/reject adds beleg_id to `match_abgelehnte_beleg_ids` array (reject/route.ts lines 29-42)
- [x] Matching algorithm skips rejected beleg IDs (matching.ts line 136)
- **PASS**

#### EC-7: One invoice matched to multiple transactions -- warn user (spec says orange/conflict)
- [ ] BUG: No conflict detection implemented. When batch matching runs, the same beleg can be assigned to multiple transactions in a single batch because the matching function processes each transaction independently against the same belege list. The beleg's `zuordnungsstatus` is only updated to 'zugeordnet' AFTER ALL matching results are written. See BUG-PROJ5-004.
- **FAIL**

---

### Security Audit

#### Authentication
- [x] All matching API routes (run, confirm, reject) check `supabase.auth.getUser()` and return 401 if not authenticated
- [x] GET /api/transaktionen checks authentication
- [x] Middleware rate-limits /api/transaktionen endpoints (20 POST/min, 60 GET/min per IP)

#### Authorization / Mandant Isolation
- [x] POST /api/matching/run scopes transactions and belege to `mandant_id` via `owner_id = user.id` query on mandanten table
- [x] POST /api/matching/confirm uses Supabase client with RLS -- update only succeeds for own mandant's data
- [x] POST /api/matching/reject uses Supabase client with RLS
- [x] RLS policies on transaktionen table enforce `mandant_id = get_mandant_id()` for SELECT, INSERT, UPDATE
- [x] RLS policies on belege table enforce `mandant_id = get_mandant_id()` for SELECT, INSERT, UPDATE
- [ ] BUG (Medium): POST /api/matching/confirm does NOT verify that the transaktion_id and beleg_id belong to the current user's mandant before updating. It relies solely on RLS to prevent cross-tenant writes. While RLS should block it, the API does not return an explicit error -- the update silently returns success with 0 rows affected. See BUG-PROJ5-005.
- [ ] BUG (Medium): POST /api/matching/reject similarly does NOT verify ownership of the transaktion_id. The `select` on line 23 will return null for another mandant's transaction due to RLS, but the code does not explicitly handle this -- it proceeds to the update with potentially stale/null data.

#### Input Validation
- [x] POST /api/matching/run validates input with Zod schema (quelle_id optional UUID)
- [x] POST /api/matching/confirm validates transaktion_id and beleg_id as UUIDs with Zod
- [x] POST /api/matching/reject validates transaktion_id and beleg_id as UUIDs with Zod
- [x] POST /api/transaktionen/[id]/match validates beleg_id as UUID with Zod

#### Data Integrity
- [ ] BUG (Medium): Race condition in batch matching -- same beleg can be assigned to multiple transactions in one batch run. No locking or beleg-already-used tracking within `runMatchingBatch`. See BUG-PROJ5-004.
- [x] DB schema has `ON DELETE SET NULL` on transaktionen.beleg_id FK, preventing orphaned references
- [x] DB schema has `ON DELETE CASCADE` for mandant_id, preventing orphaned transactions

#### Rate Limiting
- [x] Middleware applies rate limiting to /api/transaktionen (60 GET/min, 20 POST/min)
- [x] Rate limiting also covers /api/belege endpoints
- [ ] Note: /api/matching/* endpoints are NOT rate-limited by middleware (only /api/belege and /api/transaktionen paths are checked). This allows unlimited POST calls to /api/matching/run. See BUG-PROJ5-006.

#### Sensitive Data Exposure
- [x] API responses do not leak other mandant's data
- [x] No secrets or tokens exposed in matching API responses
- [x] match_abgelehnte_beleg_ids (UUID array) is not sensitive

---

### Additional Findings

#### Frontend: Search Filter Not Working (BUG-PROJ5-007)
The TransaktionenPage sends `search` parameter to `/api/transaktionen?search=...` (page.tsx line 67), but the GET /api/transaktionen API route does NOT handle a `search` parameter at all (transaktionen/route.ts). It only handles `quelle_id`, `match_status`, `datum_von`, `datum_bis`, `nur_offen`, `page`, and `page_size`. The search text box on the transactions page therefore has no effect.

#### Frontend: MatchingStats counts kein_beleg as offen (BUG-PROJ5-008)
In TransaktionenPage (lines 97-110), the `matchingStats` computation counts everything that is not 'bestaetigt' or 'vorgeschlagen' as 'offen'. This means transactions with `kein_beleg` status are counted in the "offen" bucket, inflating the "offen" count and deflating the match quote percentage.

#### Frontend: PAYPAL_ID_MATCH may produce false positive with RN_MATCH (BUG-PROJ5-009)
In matching.ts, RN_MATCH checks if rechnungsnummer (>3 chars) appears in beschreibung. PAYPAL_ID_MATCH also checks if rechnungsnummer appears in beschreibung (with additional "paypal" keyword check). However, RN_MATCH runs first and will match before PAYPAL_ID_MATCH gets a chance to run. If a PayPal transaction has the rechnungsnummer in its description AND the rechnungsnummer is >3 chars, it will be classified as RN_MATCH rather than PAYPAL_ID_MATCH. This is functionally correct (both score 100) but may confuse users about the match reason.

---

### Bugs Found

#### BUG-PROJ5-001: Matching Not Triggered on Beleg Upload (Medium) -- CARRIED FROM ROUND 1
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Upload a new beleg via POST /api/belege
  2. Expected: Matching engine runs automatically to match the new beleg against unmatched transactions
  3. Actual: Beleg is saved but no matching is triggered. User must manually click "Matching neu starten".
- **Impact:** Spec says matching should re-run when new belege are uploaded. Users may not realize they need to trigger manually.
- **Priority:** Should fix before deployment

#### BUG-PROJ5-002: IBAN_GUARDED Hard Match Type Not Implemented (Medium)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Import a transaction with a specific IBAN
  2. Upload a beleg from a supplier whose IBAN matches the transaction's IBAN and the amount matches exactly
  3. Expected: Hard match with IBAN_GUARDED type (Score 100)
  4. Actual: No IBAN matching occurs. The beleg type does not include a `lieferant_iban` field. Code has a comment "Zukunftig: lieferant_iban fur IBAN_GUARDED" (matching.ts line 23).
- **Impact:** Missing one of four specified hard match types. Reduces overall match rate for IBAN-based payments.
- **Priority:** Should fix before deployment (spec lists it as an AC)

#### BUG-PROJ5-003: Score Tie Detection Ineffective for Non-100 Scores (Low)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Create two belege that would score identically (e.g., both score 75) against a transaction
  2. Run matching
  3. Expected: Flag as yellow for manual review (per spec "if tied, flag as yellow for manual review")
  4. Actual: The `tieScore` flag is set to true on matching.ts line 162, but for non-100 scores, it is NOT used to reduce effectiveScore. The condition on line 172 only applies `tieScore` when `bestScore === 100`. For score ties at any other value, the first beleg found at that score is kept without additional flagging.
- **Impact:** When two non-hard-match belege tie, the engine picks one silently rather than flagging for user review as specified.
- **Priority:** Nice to have for MVP

#### BUG-PROJ5-004: Same Beleg Can Be Matched to Multiple Transactions in Batch (Medium)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have 2+ unmatched transactions that would both match the same beleg with score >= 80
  2. Run POST /api/matching/run
  3. Expected: Only one transaction gets the beleg, the other stays offen or gets next-best match
  4. Actual: `runMatchingBatch` in matching.ts processes each transaction independently against the full belege list. Both transactions can receive the same beleg_id. Then in the API route (run/route.ts lines 62-83), both updates go through and both `beleg.zuordnungsstatus` updates execute -- the second one is a no-op since it's already 'zugeordnet', but both transactions point to the same beleg.
- **Impact:** One beleg linked to two transactions violates the one-to-one matching invariant. Creates data inconsistency.
- **Priority:** Should fix before deployment

#### BUG-PROJ5-005: Confirm/Reject Endpoints Lack Explicit Mandant Ownership Check (Low)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Authenticated user A sends POST /api/matching/confirm with transaktion_id belonging to user B's mandant
  2. Expected: Explicit 404 or 403 error
  3. Actual: RLS prevents the actual update, but the API returns 200 with `{ success: true }` even though 0 rows were updated. No error feedback.
- **Impact:** Misleading success response. Not a data leak (RLS blocks it), but poor UX and makes debugging harder.
- **Priority:** Nice to have

#### BUG-PROJ5-006: Matching API Endpoints Not Rate-Limited (Low)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send rapid POST requests to /api/matching/run in a loop
  2. Expected: Rate limiting kicks in after ~20 requests per minute
  3. Actual: Middleware only rate-limits paths starting with /api/belege or /api/transaktionen. The /api/matching/* paths are not covered (middleware.ts line 51).
- **Impact:** An attacker could trigger expensive matching operations repeatedly, causing high DB load. Low severity because auth is still required.
- **Priority:** Should fix before deployment

#### BUG-PROJ5-007: Search Filter on Transactions Page Has No Effect (High)
- **Severity:** High
- **Steps to Reproduce:**
  1. Navigate to /transaktionen
  2. Type a search term in the "Suche" input field
  3. Expected: Transactions filtered by description, IBAN, etc.
  4. Actual: The search query is sent as `?search=xxx` parameter but the GET /api/transaktionen endpoint ignores it entirely. The query is not applied to any database filter.
- **Impact:** Core UI feature (search bar) is non-functional. Users cannot find specific transactions.
- **Priority:** Must fix before deployment

#### BUG-PROJ5-008: kein_beleg Transactions Counted as "Offen" in Stats (Low)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Mark several transactions as "Kein Beleg"
  2. View the MatchingStatusBar
  3. Expected: kein_beleg transactions are excluded from "offen" count (or shown separately)
  4. Actual: They are counted as "offen" because the stats computation only checks for 'bestaetigt' and 'vorgeschlagen', lumping everything else into offen. The match_quote percentage is also deflated.
- **Impact:** Misleading statistics. Users see artificially low match rate.
- **Priority:** Should fix before deployment

#### BUG-PROJ5-009: RN_MATCH Shadows PAYPAL_ID_MATCH (Low)
- **Severity:** Low
- **Description:** For PayPal transactions where the rechnungsnummer appears in the description AND is >3 chars, RN_MATCH fires first (matching.ts line 87) before PAYPAL_ID_MATCH is checked (line 102). Both produce score 100, so functionally identical, but the match_type label shown to users is misleading.
- **Priority:** Nice to have

---

### Cross-Browser Assessment
- Components use standard shadcn/ui primitives (Badge, Tooltip, DropdownMenu, Table, Dialog, Progress, Tabs) which are built on Radix UI -- cross-browser compatible (Chrome, Firefox, Safari).
- Intl.NumberFormat('de-AT') for currency formatting is supported in all modern browsers.
- Date.toLocaleDateString('de-AT') is supported in all modern browsers.
- No browser-specific APIs or CSS features used.

### Responsive Assessment
- Beleg and Match-Grund columns hidden below lg breakpoint via `hidden lg:table-cell` (375px, 768px: hidden; 1440px: visible)
- MatchingStatusBar uses `flex-col gap-4 sm:flex-row` for stacking on mobile
- Progress bar hidden below md breakpoint (`hidden md:block`)
- Filter bar uses `flex-col gap-3 sm:flex-row` for mobile stacking
- ZuordnungsDialog uses `max-w-3xl` with `md:flex-row` for side-by-side layout on desktop, stacked on mobile
- BulkAktionsLeiste is sticky at bottom with proper z-index

---

### Summary
- **Acceptance Criteria:** 7/9 passed, 2 partial (AC-2 IBAN_GUARDED missing, AC-8 beleg upload trigger missing)
- **Bugs Found:** 9 total (1 High, 4 Medium, 4 Low)
  - BUG-PROJ5-002 from Round 1 (Beleg delete) is FIXED
  - 1 High: Search filter non-functional
  - 4 Medium: No beleg-upload matching trigger, IBAN_GUARDED missing, same beleg multi-assign, no rate-limit on matching API
  - 4 Low: Score tie detection, confirm/reject silent success, kein_beleg stats, RN_MATCH shadows PayPal
- **Security:** RLS properly enforced. Rate limiting gap on /api/matching/*. No data leaks found.
- **Production Ready:** NO -- 1 High bug (search non-functional) and 4 Medium bugs must be addressed first.

## Deployment

**Deployed:** 2026-03-19
**Production URL:** https://belegmanagerv1.vercel.app
**Git Tag:** v1.5.0-PROJ-5 (initial) · v1.5.1-PROJ-5 (QA Round 4 fixes)

### QA Summary (Round 3 – Final)
- **Acceptance Criteria:** 9/9 PASSED
- **All 12 bugs resolved** (9 Round 2 + 3 Round 3)
- **Migration applied:** `20260318000006_add_lieferant_iban_to_belege` (Supabase EU Central)
- **New files:** `src/lib/execute-matching.ts` (shared matching helper with deduplication)

### Key Changes Deployed
- `GET /api/transaktionen`: search filter (`?search=`) functional with wildcard escaping
- `GET /api/belege`: wildcard escaping on lieferant/rechnungsname ilike filters
- `POST /api/belege`: auto-triggers matching after beleg upload
- `POST /api/matching/run`: uses shared `executeMatching()` helper
- `POST /api/transaktionen/import`: uses `executeMatching()` (no more inline loop, dedup included)
- `src/lib/matching.ts`: IBAN_GUARDED implemented, PAYPAL_ID_MATCH priority fixed, tie detection fixed
- `src/lib/execute-matching.ts`: deduplication via `assignedBelegIds`, conflicts flagged as `vorgeschlagen`
- `middleware.ts`: `/api/matching` rate-limited
- `MatchingStatusBar`: `kein_beleg` excluded from offen count and total

---

### Round 4 -- Post-Deployment Verification (2026-03-19)

**Tested:** 2026-03-19
**Tester:** QA Engineer (AI)
**Method:** Full static code review of all matching-related files after Round 3 fixes were deployed. Verified all 12 previously reported bugs are resolved. Identified new findings.

---

#### Regression Check (All 12 Previously Reported Bugs)

| Bug | Status | Verification |
|-----|--------|-------------|
| BUG-PROJ5-001 (Matching not triggered on beleg upload) | FIXED | `POST /api/belege` line 103: `executeMatching(supabase, mandantId).catch(...)` |
| BUG-PROJ5-002 (IBAN_GUARDED not implemented) | FIXED | `matching.ts` lines 110-117: IBAN + amount comparison implemented |
| BUG-PROJ5-003 (Score tie detection ineffective) | FIXED | `matching.ts` line 183: `tieScore && bestScore >= 80 ? 79 : bestScore` handles both hard-match and score-based ties |
| BUG-PROJ5-004 (Same beleg multi-assign in batch) | FIXED | `execute-matching.ts` lines 60-72: `assignedBelegIds` Set prevents duplicate assignment |
| BUG-PROJ5-005 (Confirm/Reject silent success) | FIXED | `confirm/route.ts` line 52, `reject/route.ts` line 56: both check `!updated?.length` and return 404 |
| BUG-PROJ5-006 (Matching API not rate-limited) | FIXED | `middleware.ts` line 54: `/api/matching` path included in rate-limit check |
| BUG-PROJ5-007 (Search filter no effect) | FIXED | `transaktionen/route.ts` lines 41-45: search parameter applied as ilike on beschreibung with wildcard escaping |
| BUG-PROJ5-008 (kein_beleg counted as offen) | FIXED | `page.tsx` lines 118-119: `if (t.match_status === 'kein_beleg') continue` |
| BUG-PROJ5-009 (RN_MATCH shadows PAYPAL_ID_MATCH) | FIXED | `matching.ts` lines 88-101: PAYPAL_ID_MATCH checked first, RN_MATCH only for non-PayPal transactions |
| BUG-PROJ5-010 (Round 3 -- dedup) | FIXED | Covered by BUG-PROJ5-004 fix |
| BUG-PROJ5-011 (Round 3 -- tie at >=80) | FIXED | Covered by BUG-PROJ5-003 fix |
| BUG-PROJ5-012 (Round 3 -- confirm/reject 404) | FIXED | Covered by BUG-PROJ5-005 fix |

**All 12 bugs confirmed fixed.**

---

#### Acceptance Criteria Re-Verification (Post-Fix)

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | Matching runs after import + on-demand | PASS |
| AC-2 | Stufe 1 Hard Match (RN, SEPA, IBAN_GUARDED, PAYPAL) | PASS |
| AC-3 | Stufe 2 Score-Matching (Betrag/Datum/Lieferant/Beschreibung) | PASS |
| AC-4 | Score >= 80 = Gruen | PASS |
| AC-5 | Score 50-79 = Gelb | PASS |
| AC-6 | Score < 50 = Rot | PASS |
| AC-7 | Each TX shows Ampel, Beleg, Match-Grund, Score | PASS |
| AC-8 | Re-runs on beleg upload + import | PASS |
| AC-9 | Match-Quote metric shown | PASS |

**9/9 PASS**

---

#### Edge Cases Re-Verification

| EC | Description | Status |
|----|-------------|--------|
| EC-1 | Multi-match takes highest score | PASS |
| EC-2 | Tied scores flagged as yellow | PASS |
| EC-3 | Skonto/fee amount differences scored | PASS |
| EC-4 | 500x500 performance < 10s | PASS |
| EC-5 | Beleg deletion reverts TX | PASS |
| EC-6 | Rejected match suppressed | PASS |
| EC-7 | Same beleg multi-TX deduplication | PASS |

**7/7 PASS**

---

#### Security Audit (Round 4)

**Authentication:**
- [x] All matching API routes (run/confirm/reject) check `supabase.auth.getUser()` and return 401
- [x] GET /api/transaktionen checks authentication
- [x] POST /api/transaktionen/import checks authentication

**Authorization / Mandant Isolation:**
- [x] POST /api/matching/run scopes to mandant via `owner_id = user.id` on mandanten table
- [x] POST /api/matching/confirm uses RLS + checks `.select('id')` result length for explicit 404
- [x] POST /api/matching/reject uses RLS + checks `.select('id')` result length for explicit 404
- [x] POST /api/transaktionen/import validates quelle_id belongs to user's mandant
- [x] POST /api/transaktionen/[id]/match relies on RLS for mandant isolation
- [x] executeMatching() explicitly filters by mandant_id (line 29, 42)
- [x] RLS on transaktionen and belege tables enforce `mandant_id = get_mandant_id()`

**Input Validation:**
- [x] POST /api/matching/run: Zod schema validates quelle_id as optional UUID
- [x] POST /api/matching/confirm: Zod validates transaktion_id and beleg_id as UUIDs
- [x] POST /api/matching/reject: Zod validates transaktion_id and beleg_id as UUIDs
- [x] POST /api/transaktionen/[id]/match: Zod validates beleg_id as UUID
- [x] GET /api/transaktionen: search parameter wildcards escaped (%, _)
- [x] POST /api/transaktionen/import: Zod validates datum format, betrag as number, max 5000 rows

**Rate Limiting:**
- [x] /api/transaktionen: 60 GET/min, 20 POST/min per IP
- [x] /api/belege: 60 GET/min, 20 POST/min per IP
- [x] /api/matching: 20 POST/min per IP (middleware.ts line 54)

**Data Integrity:**
- [x] Beleg deduplication in batch matching via assignedBelegIds
- [x] Monats-Lock checks on confirm, reject, manual match, and kein_beleg
- [x] Beleg deletion unlinks transaction and resets match_status
- [x] Reject adds beleg_id to match_abgelehnte_beleg_ids array

---

#### New Findings (Round 4)

##### BUG-PROJ5-R4-001: Search Only Covers beschreibung Field (Low)
- **Severity:** Low
- **Description:** The search input placeholder says "Beschreibung, IBAN..." (page.tsx line 274) implying it searches both description AND IBAN fields. However, the API only searches `beschreibung` via ilike (transaktionen/route.ts line 44). Searching by IBAN, buchungsreferenz, or other fields does not work.
- **Steps to Reproduce:**
  1. Navigate to /transaktionen
  2. Enter an IBAN in the search field (e.g., "AT61...")
  3. Expected: Transactions with that IBAN appear
  4. Actual: No results (unless the IBAN happens to appear in the beschreibung text)
- **Impact:** Misleading placeholder text. Users may think IBAN search works when it does not.
- **Priority:** Should fix (either extend search to multiple columns via `or()` filter, or update placeholder text)

##### BUG-PROJ5-R4-002: Matching Stats Computed from Paginated Data Only (Medium)
- **Severity:** Medium
- **Description:** The `matchingStats` in TransaktionenPage (lines 116-126) is computed from the `transaktionen` array, which is paginated (default 50 per page). If a mandant has 200 transactions, the stats bar shows percentages based on only the first 50 transactions visible, not the full dataset. The match quote shown to the user could be wildly inaccurate.
- **Steps to Reproduce:**
  1. Import 100+ transactions
  2. Navigate to /transaktionen
  3. View the MatchingStatusBar showing "X% zugeordnet"
  4. Expected: Percentage reflects ALL transactions
  5. Actual: Percentage only reflects the first 50 (page_size default)
- **Impact:** Misleading match quote. The status bar's purpose (AC-9) is undermined for mandants with more than 50 transactions.
- **Priority:** Should fix before deployment of large-scale use

##### BUG-PROJ5-R4-003: amountMatches Division by Zero When belegBetrag is 0 (Low)
- **Severity:** Low
- **Description:** In matching.ts line 51, `diff / belegBetrag` will produce `Infinity` if `belegBetrag` is 0 (e.g., a zero-value invoice/credit note). The function returns 0 in this case (since Infinity <= 0.01 is false), which is actually the correct behavior, but the division by zero is technically undefined behavior in strict mathematical terms. In JavaScript, `0/0 = NaN` and `NaN <= 0.01 = false`, so if both betrag and belegBetrag are 0, `diff = 0` and `diff / belegBetrag = 0/0 = NaN`, missing the exact match at line 50 only when both are exactly 0 (which line 50 catches as diff === 0). So this is actually fine -- no real bug. **FALSE POSITIVE -- retracted.**

##### BUG-PROJ5-R4-004: Concurrent Matching Runs Not Serialized (Low)
- **Severity:** Low
- **Description:** Two concurrent POST requests to /api/matching/run (or one from import + one manual) can execute simultaneously. The `assignedBelegIds` deduplication only works within a single `executeMatching()` call. Two overlapping calls could still assign the same beleg to different transactions because they each read the beleg list independently and have separate `assignedBelegIds` sets.
- **Steps to Reproduce:**
  1. User A clicks "Matching neu starten" while an import is still running matching
  2. Both matching runs process the same unmatched transactions and open belege
  3. Expected: Only one matching run assigns each beleg
  4. Actual: Both runs may assign the same beleg to different transactions
- **Impact:** Edge case that requires exact timing. RLS and Supabase updates are not transactional across the two API calls. The probability is low in single-user MVP context.
- **Priority:** Nice to have (unlikely in MVP single-user scenario)

##### BUG-PROJ5-R4-005: Fire-and-Forget Matching After Beleg Upload Silently Fails (Low)
- **Severity:** Low
- **Description:** In POST /api/belege (line 103), matching is triggered as fire-and-forget with `.catch(() => {})`. If matching fails (e.g., DB error), the error is silently swallowed with no logging. The user receives a 201 for the beleg upload and has no indication that matching did not run.
- **Steps to Reproduce:**
  1. Upload a beleg when the DB is under load or has a transient error
  2. Beleg is saved successfully (201)
  3. Expected: User is notified that matching could not run, or at least an error is logged
  4. Actual: Error is silently caught and discarded
- **Impact:** Low -- user can always manually trigger matching via the button. But there is no server-side logging of the failure.
- **Priority:** Nice to have (add `console.error` in the catch block)

---

#### Cross-Browser Assessment
- All UI components use shadcn/ui (Radix UI primitives) -- cross-browser compatible (Chrome, Firefox, Safari)
- `Intl.NumberFormat('de-AT')` and `Date.toLocaleDateString('de-AT')` supported in all modern browsers
- No browser-specific CSS or APIs used
- **PASS**

#### Responsive Assessment
- Beleg and Match-Grund columns hidden below lg breakpoint (`hidden lg:table-cell`)
- MatchingStatusBar stacks on mobile (`flex-col gap-4 sm:flex-row`)
- Progress bar hidden below md (`hidden md:block`)
- Filter bar stacks on mobile (`flex-col gap-3 sm:flex-row`)
- Table has `overflow-x-auto` for horizontal scrolling on small screens
- **PASS**

---

#### Summary (Round 4)

- **All 12 previously reported bugs: FIXED and verified**
- **Acceptance Criteria: 9/9 PASS**
- **Edge Cases: 7/7 PASS**
- **New bugs found: 3** (0 Critical, 0 High, 1 Medium, 2 Low)
  - BUG-PROJ5-R4-001 (Low): Search placeholder implies IBAN search but only searches beschreibung
  - BUG-PROJ5-R4-002 (Medium): Matching stats computed from paginated data only (first 50)
  - BUG-PROJ5-R4-004 (Low): Concurrent matching runs not serialized
  - BUG-PROJ5-R4-005 (Low): Fire-and-forget matching silently swallows errors
- **Security: PASS** -- no critical or high security issues found
- **Production Ready: YES** -- no Critical or High bugs. The 1 Medium bug (stats from paginated data) should be prioritized for the next sprint but does not block current deployment.

---

### Round 4 Bug Fixes (2026-03-19)

| Bug | Fix |
|-----|-----|
| BUG-PROJ5-R4-002 (Medium) | Created `GET /api/transaktionen/stats` (3 parallel `count: exact, head: true` queries). `MatchingStatusBar` stats now fetched from this endpoint, not computed from paginated local data. `page.tsx`: replaced `useMemo` with `useState` + `fetchStats` callback, called on mount and after every `fetchTransaktionen`. |
| BUG-PROJ5-R4-001 (Low) | Extended search in `GET /api/transaktionen` from single `ilike('beschreibung', ...)` to `.or('beschreibung.ilike.X,buchungsreferenz.ilike.X,iban_gegenseite.ilike.X')`. Placeholder text "Beschreibung, IBAN..." now accurate. |
| BUG-PROJ5-R4-004 (Low) | Added post-processing dedup in `execute-matching.ts` after the batch loop: queries all `bestaetigt` transactions that share an `assignedBelegIds` beleg, keeps the highest-scoring one, demotes losers to `vorgeschlagen`. Catches conflicts from concurrent runs. |
| BUG-PROJ5-R4-005 (Low) | Changed `.catch(() => {})` to `.catch((err) => console.error('[belege] Post-upload matching failed:', err))` in `POST /api/belege`. |

**New files:** `src/app/api/transaktionen/stats/route.ts`
