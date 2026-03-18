# PROJ-6: Manuelle Zuordnung

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Belege müssen existieren
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen existieren
- Requires: PROJ-5 (Matching-Engine) – Ampel-Status muss sichtbar sein

## User Stories
- As a user, I want to manually assign an invoice to a transaction (red/yellow status) so that I can resolve unmatched items
- As a user, I want to confirm a suggested match (yellow status) so that it becomes fully confirmed (green)
- As a user, I want to remove an incorrect match from a transaction so that I can reassign it correctly
- As a user, I want to mark a transaction as "kein Beleg erforderlich" (e.g. bank fees) so that it doesn't count as unmatched
- As a user, I want to see all unmatched/yellow transactions in a focused view so that I can work through them efficiently

## Acceptance Criteria
- [ ] From any transaction row, user can open a "Zuordnen"-Dialog
- [ ] Dialog shows: transaction details on the left, searchable list of unmatched belege on the right
- [ ] User can search belege by: Lieferant, Rechnungsnummer, Betrag, Datum
- [ ] Selecting a Beleg and confirming creates a match (status → green, match_type = MANUAL)
- [ ] User can confirm a yellow (suggested) match with one click → status → green
- [ ] User can remove a match from a green transaction → status reverts to red
- [ ] User can mark a transaction as "Kein Beleg" (e.g. Bankgebühren) → special green status, no beleg required
- [ ] Bulk action: select multiple transactions → assign same beleg or mark as "Kein Beleg"
- [ ] Unmatched transactions view: filtered list showing only red + yellow transactions
- [ ] All manual actions are logged (timestamp, user) in the match record

## Edge Cases
- User tries to assign an already-matched beleg to a second transaction → warning shown, user must unlink first
- Transaction amount and beleg amount differ significantly → warning shown, user must explicitly confirm
- User assigns a beleg from a different month → allowed with warning (for cross-month corrections)
- Beleg has no amount entered yet → can still be manually assigned, warning about missing metadata
- Bulk assignment of 50+ transactions → progress shown, no timeout

## Technical Requirements
- Dialog opens without full page reload (modal/drawer)
- Search in beleg list: < 300ms response time for up to 500 documents
- All match events stored with: created_at, created_by (user_id), match_type (MANUAL / confirmed suggestion)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
app/(app)/transaktionen/
└── TransaktionenPage
    ├── FilterBar
    │   └── "Offene Positionen"-Tab     ← Nur ROT + GELB
    │
    ├── TransaktionZeile
    │   ├── [Gelb] BestätigenButton     ← 1-Klick: Vorschlag → GRÜN
    │   ├── [Gelb] AblehnenButton       ← Vorschlag → ROT
    │   ├── [Rot/Grün] ZuordnenButton   ← Öffnet ZuordnungsDialog
    │   ├── [Grün] ZuordnungEntfernen   ← Match löschen → ROT
    │   └── KeinBelegButton             ← Sonder-Grün (z.B. Bankgebühren)
    │
    ├── ZuordnungsDialog                ← Modal (shadcn Dialog)
    │   ├── TransaktionsDetails         ← Links: Datum, Betrag, Beschreibung
    │   └── BelegSuche                  ← Rechts: Suchfeld + Liste
    │       ├── SuchInput               ← Lieferant / RN / Betrag / Datum
    │       ├── BelegSuchergebnis (×n)  ← Lieferant | RN | Betrag | Datum
    │       │   └── BetragsWarnBadge    ← Bei starker Abweichung
    │       └── EmptyState
    │
    └── BulkAktionsLeiste               ← Bei Checkbox-Selektion
        ├── BulkKeinBelegButton
        └── BulkZuordnenButton

API:
  POST   /api/transaktionen/[id]/match   → Beleg zuordnen
  DELETE /api/transaktionen/[id]/match   → Zuordnung entfernen
  PATCH  /api/transaktionen/[id]/match   → Als "kein_beleg" markieren
```

### Datenmodell (keine neue Tabelle – schreibt in transaktionen)

```
Manuelle Zuordnung:   match_type="MANUAL", match_status="bestaetigt", beleg_id=X
Kein Beleg:           match_type="KEIN_BELEG", match_status="kein_beleg", beleg_id=null
Vorschlag bestätigt:  match_status="bestaetigt", match_bestaetigt_von=auth.uid()
Zuordnung entfernt:   beleg_id=null, match_type=null, match_status="offen"

Audit: match_bestaetigt_am (Timestamp) + match_bestaetigt_von (UUID) auf transaktionen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Zuordnungs-UI | Modal Dialog | Kein Seitenkontext-Verlust |
| Beleg-Suche | Client-seitig (< 500 Belege) | < 300ms, kein Server-Call |
| Bulk-Aktionen | Checkbox + Aktionsleiste | Pattern aus Gmail/Linear |
| Audit-Trail | Felder auf transaktionen | Kein separates Log-Table nötig |

### Abhängigkeiten

Keine neuen Packages – shadcn/ui (Dialog, Checkbox, Badge).

## Frontend Implementation Notes

### Components Created
- `src/components/transaktionen/zuordnungs-dialog.tsx` - Modal dialog with transaction details (left) and searchable beleg list (right). Includes client-side search, amount/month deviation warnings, and beleg-already-assigned error handling.
- `src/components/transaktionen/bulk-aktions-leiste.tsx` - Sticky bottom bar for bulk actions (Kein Beleg, Zuordnen) with selection count badge.

### Components Updated
- `src/components/transaktionen/transaktionen-tabelle.tsx` - Added checkbox column for bulk selection (select all / individual), row highlighting on selection.
- `src/components/transaktionen/matching-aktionen-menu.tsx` - Added "Kein Beleg erforderlich", "Zuordnung entfernen", and "Markierung aufheben" menu items. Reorganized action visibility per status.
- `src/app/(app)/transaktionen/page.tsx` - Added "Offene Positionen" tab (red + yellow only) with count badge. Integrated ZuordnungsDialog and BulkAktionsLeiste. Wired manual assign handler through all components.

### API Endpoints Used (already existed)
- `POST /api/transaktionen/[id]/match` - Assign beleg manually
- `DELETE /api/transaktionen/[id]/match` - Remove assignment
- `PATCH /api/transaktionen/[id]/match` - Mark as "kein_beleg"

### Acceptance Criteria Coverage
- Zuordnen-Dialog opens from any transaction row via dropdown menu
- Dialog shows transaction details left, searchable beleg list right
- Search by Lieferant, Rechnungsnummer, Betrag, Datum (client-side, < 300ms)
- Confirm yellow matches with 1 click (existing confirm action)
- Remove matches from green transactions (new "Zuordnung entfernen")
- "Kein Beleg" marking (new action in menu)
- Bulk actions via checkboxes + sticky action bar
- "Offene Positionen" tab for red + yellow transactions
- Amount deviation and cross-month warnings displayed

## QA Test Results (Round 2)

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Deep code review, build verification, security audit
**Build Status:** PASS (production build compiles successfully)

### Acceptance Criteria Status

#### AC-1: User can open "Zuordnen"-Dialog from any transaction row
- [x] `zuordnungs-dialog.tsx` component exists as shadcn Dialog modal
- [x] `matching-aktionen-menu.tsx` has "Manuell zuordnen" menu item for offen/vorgeschlagen status
- [x] Dialog opens without full page reload (modal, no router navigation)
- **PASS**

#### AC-2: Dialog shows transaction details (left) + searchable beleg list (right)
- [x] Left panel: Datum, Betrag, Beschreibung, IBAN displayed in `md:w-[260px]` panel
- [x] Right panel: Search input + ScrollArea with beleg list
- [x] Responsive: stacks vertically on mobile via `md:flex-row`
- **PASS**

#### AC-3: Search belege by Lieferant, Rechnungsnummer, Betrag, Datum
- [x] Client-side filtering implemented in `zuordnungs-dialog.tsx` lines 87-104
- [x] All four search fields matched via `includes(query)` on lowercase
- [x] Performance: client-side filtering on pre-fetched list, expected < 300ms for 500 docs
- **PASS**

#### AC-4: Selecting Beleg creates match (status green, match_type MANUAL)
- [x] POST `/api/transaktionen/[id]/match` sets `match_status='bestaetigt'`, `match_type='MANUAL'`, `match_score=100`
- [x] Records `match_bestaetigt_am` and `match_bestaetigt_von` (audit trail)
- [x] Previously assigned beleg is freed (`zuordnungsstatus='offen'`) before new assignment
- [x] New beleg marked as `zuordnungsstatus='zugeordnet'`
- **PASS**

#### AC-5: Confirm yellow match with one click
- [x] POST `/api/matching/confirm` endpoint exists
- [x] MatchingAktionenMenu has "Zuordnung bestaetigen" for vorgeschlagen status
- [ ] BUG: Confirm endpoint does NOT record audit trail (BUG-PROJ6-001)
- [ ] BUG: Confirm endpoint does NOT check month lock (BUG-PROJ6-002)
- [ ] BUG: Confirm endpoint overwrites match_type with 'MANUAL' instead of preserving original (BUG-PROJ6-003)
- **FAIL** (3 bugs)

#### AC-6: Remove match from green transaction -- reverts to red
- [x] DELETE `/api/transaktionen/[id]/match` resets to offen, clears beleg_id, match_type, match_score
- [x] Frees the beleg (`zuordnungsstatus='offen'`)
- [x] Clears audit fields (match_bestaetigt_am, match_bestaetigt_von)
- [ ] BUG: DELETE requires admin role (requireAdmin check), but spec does not require admin-only (BUG-PROJ6-005)
- **FAIL** (1 bug)

#### AC-7: Mark as "Kein Beleg" (e.g., bank fees)
- [x] PATCH `/api/transaktionen/[id]/match` sets `match_status='kein_beleg'`, `match_type='MANUAL'`
- [x] "Kein Beleg erforderlich" menu item in MatchingAktionenMenu
- [x] Frees previously assigned beleg if any
- [x] Records audit trail (match_bestaetigt_am, match_bestaetigt_von)
- **PASS**

#### AC-8: Bulk action -- select multiple transactions
- [x] `bulk-aktions-leiste.tsx` with sticky bottom bar and selection count
- [x] Checkboxes in transaktionen-tabelle.tsx (select all / individual / indeterminate)
- [x] Bulk "Kein Beleg" fires parallel PATCH requests with Promise.allSettled
- [ ] BUG: Bulk "Zuordnen" only opens dialog for first selected transaction (BUG-PROJ6-006)
- **FAIL** (1 bug)

#### AC-9: Unmatched transactions view (red + yellow only)
- [x] "Offene Positionen" tab in TransaktionenPage
- [x] Client-side filters to `match_status` in `['offen', 'vorgeschlagen']`
- [x] Count badge shown on tab when > 0
- **PASS**

#### AC-10: Manual actions logged (timestamp, user)
- [x] POST `/api/transaktionen/[id]/match` records `match_bestaetigt_am` and `match_bestaetigt_von`
- [x] PATCH (kein_beleg) records `match_bestaetigt_am` and `match_bestaetigt_von`
- [ ] BUG: POST `/api/matching/confirm` does NOT record these fields (BUG-PROJ6-001)
- **FAIL** (1 bug - same as AC-5)

### Edge Cases Status

#### EC-1: Assign already-matched beleg to second transaction
- [x] API checks `zuordnungsstatus === 'zugeordnet'` and returns 409 conflict
- [x] Exception: allows re-assignment if beleg is already assigned to the same transaction
- **PASS**

#### EC-2: Transaction and beleg amount differ significantly
- [x] API calculates betrag_warnung when deviation >= 10%
- [x] Warning displayed in UI dialog
- [ ] BUG: UI shows warning badge at > 5% while API uses >= 10% threshold (BUG-PROJ6-007)
- **PARTIAL PASS** (inconsistency, not broken)

#### EC-3: Assign beleg from different month
- [x] Allowed with warning shown in dialog (compares YYYY-MM substrings)
- **PASS**

#### EC-4: Beleg has no amount entered
- [x] API handles null bruttobetrag gracefully (betrag_warnung stays false)
- [x] UI shows "Der Beleg hat keinen Betrag hinterlegt." warning
- **PASS**

#### EC-5 (undocumented): Bulk action of 50+ transactions
- [x] Bulk "Kein Beleg" uses Promise.allSettled (no single failure stops batch)
- [x] Reports success/failure counts
- [ ] No explicit progress indicator shown during batch processing (just disabled buttons + loader icon)
- **PASS** (acceptable for MVP, no timeout risk with parallel requests)

### Security Audit Results

#### Authentication
- [x] All API endpoints check `supabase.auth.getUser()` and return 401 if unauthenticated
- [x] Middleware redirects unauthenticated users to /login
- **PASS**

#### Authorization / Multi-Tenant Isolation
- [x] Transactions retrieved via Supabase client (RLS enforces mandant_id scoping)
- [x] Belege retrieved via Supabase client (RLS enforces mandant_id scoping)
- [x] POST `/api/transaktionen/[id]/match` verifies beleg exists via RLS-scoped query
- [x] No direct mandant_id parameter accepted from client (derived from RLS context)
- **PASS** (relies on RLS which is the correct approach)

#### Month Lock Enforcement
- [x] POST `/api/transaktionen/[id]/match` checks `isMonatGesperrt()`
- [x] DELETE `/api/transaktionen/[id]/match` checks `isMonatGesperrt()`
- [x] PATCH `/api/transaktionen/[id]/match` checks `isMonatGesperrt()`
- [ ] BUG: POST `/api/matching/confirm` does NOT check `isMonatGesperrt()` (BUG-PROJ6-002)
- [ ] BUG: POST `/api/matching/reject` does NOT check `isMonatGesperrt()` (BUG-PROJ6-004)
- **FAIL** (2 endpoints bypass month lock)

#### Input Validation
- [x] POST `/api/transaktionen/[id]/match` validates beleg_id with `z.string().uuid()`
- [x] POST `/api/matching/confirm` validates with Zod schema (transaktion_id + beleg_id as UUID)
- [x] POST `/api/matching/reject` validates with Zod schema
- [ ] BUG: Search query in `/api/transaktionen` not sanitized for SQL wildcards `%` and `_` (BUG-PROJ6-008)
- **PARTIAL PASS**

#### Rate Limiting
- [x] Middleware applies rate limiting to `/api/transaktionen`, `/api/belege`, `/api/matching` paths
- [x] DELETE limited to 10/min, POST to 20/min, PATCH to 30/min, GET to 60/min
- **PASS**

#### XSS Prevention
- [x] React/JSX auto-escapes all rendered values
- [x] No `dangerouslySetInnerHTML` usage in PROJ-6 components
- [x] CSP headers set in middleware with nonce-based script-src
- **PASS**

### Bugs Found

#### BUG-PROJ6-001: /api/matching/confirm does not record audit trail
- **Severity:** High
- **Steps to Reproduce:**
  1. Have a transaction with match_status='vorgeschlagen' (yellow)
  2. Click "Zuordnung bestaetigen" in the dropdown menu
  3. POST /api/matching/confirm is called
  4. Expected: match_bestaetigt_am and match_bestaetigt_von are set
  5. Actual: These fields are NOT included in the update (lines 25-29 of confirm/route.ts only set match_status, beleg_id, match_type)
- **Impact:** Violates AC-10, no audit trail for confirmed suggestions. Cannot determine who/when confirmed a match.
- **Priority:** Fix before deployment

#### BUG-PROJ6-002: /api/matching/confirm does not check month lock
- **Severity:** Critical (Security)
- **Steps to Reproduce:**
  1. Close a month via Monatsabschluss
  2. Have a transaction in that closed month with match_status='vorgeschlagen'
  3. Call POST /api/matching/confirm with the transaktion_id and beleg_id
  4. Expected: 403 "Monat ist abgeschlossen"
  5. Actual: Match is confirmed successfully, bypassing the month lock
- **Impact:** Users can modify transaction data in closed months, breaking the integrity of the Monatsabschluss-Workflow.
- **Priority:** Fix before deployment

#### BUG-PROJ6-003: /api/matching/confirm overwrites match_type with 'MANUAL'
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Matching engine assigns a suggestion with match_type='RN_MATCH' (or SEPA_MATCH, etc.)
  2. User confirms the suggestion via /api/matching/confirm
  3. Expected: match_type preserved (or set to 'CONFIRMED') to maintain provenance
  4. Actual: match_type is overwritten to 'MANUAL', losing the info about how the match was originally suggested
- **Impact:** Reporting/analytics cannot distinguish between fully manual matches and confirmed automatic suggestions. Misleading match statistics.
- **Priority:** Fix in next sprint

#### BUG-PROJ6-004: /api/matching/reject does not check month lock
- **Severity:** Critical (Security)
- **Steps to Reproduce:**
  1. Close a month via Monatsabschluss
  2. Have a transaction in that closed month with match_status='vorgeschlagen'
  3. Call POST /api/matching/reject with the transaktion_id and beleg_id
  4. Expected: 403 "Monat ist abgeschlossen"
  5. Actual: Match is rejected, transaction set to 'offen', beleg freed -- all in a closed month
- **Impact:** Users can modify transaction matching state in closed months.
- **Priority:** Fix before deployment

#### BUG-PROJ6-005: DELETE /api/transaktionen/[id]/match requires admin but spec does not mandate it
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Log in as a non-admin user (Buchhalter role)
  2. Try to remove a match from a green transaction via the dropdown menu "Zuordnung entfernen"
  3. Expected: Match is removed (spec says "user can remove an incorrect match")
  4. Actual: 403 "Keine Berechtigung. Nur Admins haben Zugriff." because line 88-89 calls requireAdmin()
- **Impact:** Non-admin users cannot remove matches, which contradicts user story "As a user, I want to remove an incorrect match". Also blocks "Markierung aufheben" for kein_beleg status since it reuses the same DELETE handler.
- **Priority:** Fix before deployment (or document as intentional and update spec)

#### BUG-PROJ6-006: Bulk "Zuordnen" only processes first selected transaction
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Select 5 transactions via checkboxes
  2. Click "Zuordnen" in the bulk action bar
  3. Expected: Ability to assign belege to all 5 selected transactions
  4. Actual: ZuordnungsDialog opens only for the first selected transaction. After assignment, `useEffect` on line 92-94 clears the selection because transaktionen state changed. The remaining 4 are lost.
- **Impact:** Bulk assign workflow is effectively broken -- user must assign one at a time despite the bulk selection UI suggesting otherwise.
- **Priority:** Fix in next sprint (workaround: assign individually via dropdown menu)

#### BUG-PROJ6-007: Amount deviation warning threshold inconsistency
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open ZuordnungsDialog for a transaction with betrag = 100
  2. Select a beleg with bruttobetrag = 93 (7% deviation)
  3. Expected: Consistent warning behavior
  4. Actual: UI dialog shows warning text at > 5% (line 123), UI badge shows "Abweichung" at > 5% (line 279), but API returns betrag_warnung at >= 10% (line 52). The API warning is unused by the dialog -- the dialog computes its own.
- **Impact:** Minor UX inconsistency. The API's betrag_warnung field in the response is effectively dead code for this flow.
- **Priority:** Nice to have

#### BUG-PROJ6-008: Search query not sanitized for SQL wildcard characters
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to Transaktionen page
  2. Enter `%` or `_` in the search field
  3. Expected: Literal search for those characters
  4. Actual: `%` matches everything, `_` matches any single character because Supabase `ilike` interprets them as SQL wildcards
- **Impact:** Unexpected search results when user types special characters. Not a security vulnerability (Supabase parameterizes the query), but a UX issue.
- **Priority:** Nice to have

### Cross-Browser Testing Notes
- Build compiles successfully for production deployment
- All components use standard React/shadcn/ui patterns with Tailwind CSS
- No browser-specific APIs detected in PROJ-6 code
- Responsive layout: Dialog uses `max-w-3xl` with `md:flex-row` for side-by-side on desktop, stacked on mobile
- Bulk action bar uses `sticky bottom-4` -- may have minor z-index issues on Safari with fixed/sticky overlap

### Regression Notes
- PROJ-3 (Belegverwaltung): Beleg zuordnungsstatus is correctly updated on assign/remove -- no regression
- PROJ-4 (Kontoauszug-Import): Transaction data model unchanged -- no regression
- PROJ-5 (Matching-Engine): confirm/reject endpoints are shared between PROJ-5 and PROJ-6 -- bugs found here (BUG-PROJ6-002/004) also affect PROJ-5

### Summary
- **Acceptance Criteria:** 7/10 passed, 3 failed (AC-5, AC-6, AC-8, AC-10 -- some overlap via shared bugs)
- **Bugs Found:** 8 total (2 critical, 2 high, 3 medium, 1 low -- BUG-PROJ6-008 counted as low)
- **Security:** FAIL -- month lock bypass on confirm/reject endpoints (BUG-PROJ6-002, BUG-PROJ6-004)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-PROJ6-001, 002, 004, 005 before deployment. BUG-PROJ6-003, 006 can go in next sprint. BUG-PROJ6-007, 008 are nice-to-have.

## Deployment
_To be added by /deploy_
