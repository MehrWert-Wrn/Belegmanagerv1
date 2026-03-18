# PROJ-10: Zahlungsquellen-Verwaltung (v2)

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-18
**Bug Fixes:** 2026-03-18 – All 9 bugs (BUG-PROJ10-001 through -010) fixed

## Dependencies
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren
- Requires: PROJ-4 (Kontoauszug-Import) – Import-Logik wird wiederverwendet
- Requires: PROJ-5 (Matching-Engine) – Matching muss quellen-agnostisch sein
- Enhances: PROJ-8 (Monatsabschluss) – neue Quellen werden in Vollständigkeitsprüfung aufgenommen

## User Stories
- As a user, I want to add custom payment sources (e.g. company credit card, PayPal Business, fuel card DKV) so that all payment channels are tracked in one place
- As a user, I want to configure each payment source with its name, type, and import format so that CSV imports work correctly
- As a user, I want to activate or deactivate payment sources so that inactive sources don't affect monthly closing
- As a user, I want each payment source to have its own transaction list and matching workflow so that data is clearly separated

## Acceptance Criteria
- [ ] User can create a new Zahlungsquelle: Name (Freitext), Typ (Bank, Kreditkarte, PayPal, Kassa, Sonstige), IBAN/Konto (optional)
- [ ] User can configure CSV import column mapping per source (reuses PROJ-4 mapping logic)
- [ ] User can activate/deactivate a Zahlungsquelle
- [ ] Active sources appear in the main transaction view (filterable by source)
- [ ] Inactive sources are hidden from monthly closing completeness check
- [ ] Matching engine runs identically for all sources
- [ ] User can edit source name/settings after creation
- [ ] User can delete a source (only if it has no transactions; otherwise deactivate)
- [ ] Maximum 10 active payment sources per mandant (MVP limit)
- [ ] RLS: sources scoped to mandant_id

## Edge Cases
- User tries to delete a source with existing transactions → blocked, only deactivation allowed
- Two sources with the same name → allowed (user's responsibility)
- User imports a CSV to the wrong source → transactions appear under wrong source; user must delete and re-import
- Source deactivated mid-month → existing transactions remain, just excluded from future completeness checks
- PayPal source: special PAYPAL_ID_MATCH logic in matching engine triggered by source type

## Technical Requirements
- `zahlungsquellen` table: id, mandant_id, name, typ, iban, csv_mapping (JSONB), aktiv, created_at
- Default sources (Kontoauszug, Kassabuch) created automatically during onboarding
- RLS enforced on zahlungsquellen table

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/settings/zahlungsquellen/
├── ZahlungsquellenHeader
│   ├── AktivLimit                  ← "7 / 10 aktive Quellen"
│   └── NeueQuelleButton
│
├── ZahlungsquellenListe
│   └── QuelleKarte (×n)
│       ├── QuelleIcon + Name + Typ
│       ├── IBAN (optional)
│       ├── StatusToggle            ← Aktiv / Inaktiv (Switch)
│       ├── ImportButton            ← Direkt zur Import-Seite dieser Quelle
│       └── AktionenMenu            ← Bearbeiten / Löschen (nur ohne TX)
│
└── QuelleErstellenDialog / BearbeitenDialog
    ├── NameFeld / TypSelect / IBANFeld
    └── CSVMappingSection           ← Wiederverwendet aus PROJ-4 Import-Wizard

API:
  GET    /api/zahlungsquellen
  POST   /api/zahlungsquellen
  PATCH  /api/zahlungsquellen/[id]
  DELETE /api/zahlungsquellen/[id]  ← Nur wenn keine TX vorhanden
```

### Datenmodell

```
Tabelle: zahlungsquellen (bereits in PROJ-4 definiert – keine Änderung nötig)
  PROJ-10 fügt nur die Verwaltungs-UI hinzu, keine neuen Felder
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Ort | /settings/zahlungsquellen | Administrations-Bereich, nicht im Tagesgeschäft |
| CSV-Mapping UI | Wiederverwendet aus PROJ-4 | Kein Duplicate Code |
| Löschen blockieren | Wenn TX vorhanden → nur Deaktivierung | Datenverlust verhindern |
| Limit 10 aktiv | API-seitig geprüft | Performance-Schutz im MVP |

### Abhängigkeiten

Keine neuen Packages.

## QA Test Results -- Round 2 (Re-test after bug fixes)

**Tested:** 2026-03-18 (Round 2)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code analysis + build verification (npm run build passes)
**Build Status:** PASS -- no compile errors

### Previous Bug Fix Verification

All 10 bugs from Round 1 have been verified as fixed:
- BUG-PROJ10-001: FIXED -- POST now uses `getMandantId()` RPC (line 66 of route.ts)
- BUG-PROJ10-002: FIXED -- Collapsible CSV-Spaltenzuordnung section present in QuelleDialog (5 fields)
- BUG-PROJ10-003: FIXED -- Select uses controlled `value={typ}` with `watch('typ')` (line 223 of quelle-dialog.tsx)
- BUG-PROJ10-004: FIXED -- Server-side check at lines 84-96 of route.ts, returns 400 if >= 10
- BUG-PROJ10-005: FIXED -- Import page fetches all active sources via `/api/zahlungsquellen`, supports `quelle_id` URL param
- BUG-PROJ10-006: FIXED -- PATCH endpoint calls `requireAdmin()` at line 30 of [id]/route.ts
- BUG-PROJ10-007: FIXED -- Same as 001, uses `getMandantId()` RPC
- BUG-PROJ10-008: FIXED -- IBAN regex validation `/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/` in both POST and PATCH routes
- BUG-PROJ10-009: FIXED -- Rate limit check at lines 69-82 of route.ts (5 creates per mandant per minute)
- BUG-PROJ10-010: FIXED -- "CSV importieren" button present on active QuelleKarte (line 163-171 of quelle-karte.tsx)

### Acceptance Criteria Status

#### AC-1: User can create a new Zahlungsquelle (Name, Typ, IBAN) -- PASS
- [x] QuelleDialog provides Name (free text input with Zod min(1) validation)
- [x] Typ dropdown with 5 correct options: Bank, Kreditkarte, PayPal, Kassa, Sonstige
- [x] IBAN field optional, with server-side format validation and space-stripping
- [x] POST /api/zahlungsquellen uses `getMandantId()` RPC -- works for both owners and invited users
- [x] Server-side Zod validation enforces name.min(1), valid typ enum

#### AC-2: User can configure CSV import column mapping per source -- PASS
- [x] Collapsible "CSV-Spaltenzuordnung (optional)" section in QuelleDialog
- [x] 5 mapping fields: datum, betrag, beschreibung, iban, referenz
- [x] Mapping saved as JSONB in `csv_mapping` column via API
- [x] Only non-empty fields included in payload (line 150-153 of quelle-dialog.tsx)
- [x] ~~BUG-PROJ10-011: CSV mapping stored but not consumed~~ **FIXED:** Import page uses `resolveMapping()` helper – applies stored column names via case-insensitive match, falls back to autoDetect for missing fields

#### AC-3: User can activate/deactivate a Zahlungsquelle -- PASS
- [x] Switch toggle on QuelleKarte sends PATCH {aktiv: boolean} to API
- [x] Inactive sources shown with `opacity-60` class
- [x] Switch disabled during toggle (toggling state)
- [x] Switch disabled when trying to activate and 10-source limit reached
- [x] PATCH requires admin role

#### AC-4: Active sources appear in transaction view (filterable by source) -- PASS
- [x] TransaktionenPage fetches `/api/zahlungsquellen` on mount (line 48)
- [x] Quelle filter dropdown populated and passes `quelle_id` param to API
- [x] Filter dropdown only shown when `zahlungsquellen.length > 1`

#### AC-5: Inactive sources hidden from monthly closing completeness check -- PASS
- [x] Monatsabschluss route queries zahlungsquellen with `.eq('aktiv', true)` (line 50)
- [x] VollstaendigkeitsPruefung component renders only active sources

#### AC-6: Matching engine runs identically for all sources -- PASS
- [x] matching.ts is pure TypeScript -- zero references to source type or quelle_id
- [x] matchTransaktion() and runMatchingBatch() are fully source-agnostic
- [x] PAYPAL_ID_MATCH triggered by "paypal" in transaction description (not source type)
- [x] Import route at /api/transaktionen/import runs matching for any quelle_id

#### AC-7: User can edit source name/settings after creation -- PASS
- [x] Edit dialog pre-fills current values via `reset()` in useEffect (lines 107-136)
- [x] Typ field correctly disabled in edit mode (`disabled={isEdit}`)
- [x] Typ uses controlled `value={typ}` -- no stale state issues
- [x] PATCH accepts name, iban, csv_mapping, aktiv updates
- [x] CSV mapping pre-populated from existing values on edit

#### AC-8: User can delete a source (only if no transactions) -- PASS
- [x] DELETE endpoint checks transaction count before deleting (lines 62-72)
- [x] Returns 409 with descriptive error message if source has transactions
- [x] UI shows disabled delete button with tooltip for sources with transactions
- [x] QuelleLoeschenDialog shows "Loschen nicht moglich" with deactivation suggestion
- [x] DELETE requires admin role (`requireAdmin` check at line 56)

#### AC-9: Maximum 10 active payment sources per mandant -- PASS
- [x] Server-side check in POST route: counts active sources, returns 400 if >= 10
- [x] Client-side: "Neue Quelle" button disabled when `aktiveQuellen >= MAX_AKTIVE`
- [x] Client-side: Active counter displayed as "X / 10 aktive Quellen" with red styling at limit
- [x] ~~BUG-PROJ10-012: Activation via PATCH bypasses limit~~ **FIXED:** PATCH checks active count (excluding current source) before activating, returns 400 if >= 10

#### AC-10: RLS: sources scoped to mandant_id -- PASS
- [x] zahlungsquellen table has RLS enabled
- [x] CRUD policies scoped to `mandant_id = get_mandant_id()`
- [x] All API routes verify authentication before database access
- [x] POST explicitly sets mandant_id from `getMandantId()` RPC

### Edge Cases Status

#### EC-1: Delete source with existing transactions -- PASS
- [x] API returns 409 with "Quelle hat Transaktionen und kann nicht geloscht werden"
- [x] UI blocks delete button with tooltip
- [x] QuelleLoeschenDialog shows informative message with deactivation suggestion

#### EC-2: Two sources with the same name -- PASS
- [x] No unique constraint on (mandant_id, name) in schema
- [x] API and UI both allow duplicate names

#### EC-3: Import CSV to wrong source -- PASS
- [x] All active sources shown in import page dropdown
- [x] `quelle_id` URL param pre-selects the correct source
- [x] Fallback to first source if quelle_id param does not match any source

#### EC-4: Source deactivated mid-month -- PASS
- [x] Existing transactions remain in database (no cascade delete)
- [x] Monatsabschluss only checks active sources
- [x] Transactions still visible and filterable in transaction view

#### EC-5: PayPal source PAYPAL_ID_MATCH logic -- PASS
- [x] Logic triggered by "paypal" substring in transaction description
- [x] Source-agnostic -- works regardless of zahlungsquelle typ

### Security Audit Results (Round 2)

- [x] **Authentication:** All 4 endpoints (GET, POST, PATCH, DELETE) check `supabase.auth.getUser()` and return 401
- [x] **Authorization (Admin):** PATCH and DELETE both call `requireAdmin()` and return 403 for non-admins
- [x] **Authorization (RLS):** zahlungsquellen table has full CRUD RLS policies scoped to mandant_id via `get_mandant_id()` RPC
- [x] **Input validation:** Zod schemas validate name, typ enum, IBAN format, csv_mapping structure on both POST and PATCH
- [x] **IBAN validation:** Server-side regex with auto-stripping of spaces and uppercasing
- [x] **XSS protection:** React default escaping handles user-provided names/IBANs; no dangerouslySetInnerHTML usage
- [x] **Rate limiting:** POST endpoint checks for max 5 creations per mandant per minute via DB query
- [x] **No sensitive data leaks:** API responses contain only zahlungsquelle fields + has_transactions boolean
- [x] **IBAN truncation:** truncateIban function shows only first 4 and last 4 characters in card view
- [x] **Security headers:** X-Frame-Options: DENY, X-Content-Type-Options: nosniff, HSTS, Referrer-Policy, Permissions-Policy all configured
- [x] ~~BUG-PROJ10-013: POST missing admin check~~ **FIXED:** POST calls `requireAdmin()`, consistent with PATCH/DELETE
- [ ] BUG: GET endpoint returns all sources including csv_mapping to any authenticated user regardless of role (see BUG-PROJ10-014)
- [ ] BUG: PATCH endpoint does not validate that the source belongs to the user's mandant at the API level -- relies solely on RLS (see BUG-PROJ10-015)

### Cross-Browser & Responsive Notes
- [x] Grid layout: responsive breakpoints `sm:grid-cols-2 lg:grid-cols-3` -- correct for 375px (1 col), 768px (2 col), 1440px (3 col)
- [x] Settings navigation: horizontal tabs with `border-b` -- works across viewports
- [x] Dialog: `sm:max-w-md max-h-[90vh] overflow-y-auto` -- correctly handles small screens and long forms
- [x] QuelleKarte: appropriate spacing with icons and badges
- [x] Import button hidden for inactive sources (only shown when `quelle.aktiv`)
- [x] Empty state with dashed border and "Erste Quelle anlegen" CTA
- Note: Full manual cross-browser testing requires a running application instance

### New Bugs Found (Round 2)

#### BUG-PROJ10-011: CSV mapping stored but not consumed during import
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Create a Kreditkarte source at /settings/zahlungsquellen
  2. Configure CSV mapping fields (e.g., datum = "Buchungsdatum", betrag = "Betrag")
  3. Click "CSV importieren" on the source card
  4. Upload a CSV file on the import page
  5. Expected: The stored CSV mapping is used to auto-detect column mapping, pre-populating the SpaltenMapping step
  6. Actual: Import page always runs `autoDetectMapping(result.headers)` from scratch (line 172 of import page); the stored `csv_mapping` from the zahlungsquelle record is never fetched or applied
- **Impact:** Users configure CSV mappings per source but the config has no effect on the actual import process. The feature is cosmetic-only.
- **Priority:** Fix before deployment (this is a core PROJ-10 feature)

#### BUG-PROJ10-012: PATCH endpoint does not enforce 10-source limit on activation
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have 10 active sources
  2. Have 1 additional inactive source
  3. Send PATCH request to /api/zahlungsquellen/[inactive-id] with `{aktiv: true}`
  4. Expected: API returns error (limit already reached)
  5. Actual: Source activated successfully, exceeding the 10-source limit
- **Impact:** The 10-source limit can be bypassed by creating inactive sources then activating them. The client-side check (`canActivate` prop) prevents this in the UI, but a direct API call bypasses it.
- **Priority:** Fix before deployment

#### BUG-PROJ10-013: POST endpoint missing admin role check
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Log in as a Buchhalter user (non-admin)
  2. Send POST request to /api/zahlungsquellen with valid payload
  3. Expected: 403 Forbidden (consistent with PATCH/DELETE which require admin)
  4. Actual: Source created successfully
- **Impact:** Authorization inconsistency -- PATCH and DELETE require admin, but POST does not. A Buchhalter can create new sources but cannot edit or delete them.
- **Priority:** Fix before deployment (authorization inconsistency)

#### BUG-PROJ10-014: Full IBAN exposed in API response despite UI truncation
- **Severity:** Low
- **Steps to Reproduce:**
  1. Create a source with a valid IBAN
  2. Open browser DevTools Network tab
  3. Navigate to /settings/zahlungsquellen
  4. Inspect the GET /api/zahlungsquellen response
  5. Expected: IBAN is truncated or masked in the API response
  6. Actual: Full IBAN visible in the JSON response; only the UI card view truncates it
- **Impact:** While IBANs are not secrets per se, the inconsistency between UI truncation and API exposure suggests the intent was to limit IBAN visibility. Any JavaScript on the page or browser extension can read full IBANs from the response.
- **Priority:** Nice to have

#### BUG-PROJ10-015: No error handling on toggle failure in QuelleKarte
- **Severity:** Low
- **Steps to Reproduce:**
  1. Navigate to /settings/zahlungsquellen
  2. Toggle a source's active status
  3. If the PATCH request fails (e.g., network error or 403 because user is not admin)
  4. Expected: Error message shown to user; switch reverts to original position
  5. Actual: Switch stays in the toggled position with no error feedback; `onToggled()` is not called so the list is not refreshed, but the local toggle state appears changed
- **Code location:** quelle-karte.tsx lines 78-90 -- the `handleToggle` function catches the finally block but does not handle errors or revert the switch state
- **Priority:** Fix in next sprint

### Summary
- **Acceptance Criteria:** 9/10 PASS, 1 PASS with caveat (AC-2 passes structurally but stored mapping is unused -- BUG-PROJ10-011)
- **Previous Bugs Fixed:** 10/10 verified fixed
- **New Bugs Found:** 5 total (0 critical, 0 high, 3 medium, 2 low)
- **Security:** Minor issues found (inconsistent admin check on POST, limit bypass on PATCH activation)
- **Production Ready:** NO -- 3 medium-severity bugs should be fixed first
- **Recommendation:** Fix the 3 medium bugs before deployment. Most impactful is BUG-PROJ10-011 (CSV mapping stored but unused -- this is the core differentiating feature of PROJ-10). BUG-PROJ10-012 (activation bypass) and BUG-PROJ10-013 (POST missing admin check) are authorization inconsistencies that should also be addressed. The 2 low-severity bugs can be deferred.

## Deployment
_To be added by /deploy_
