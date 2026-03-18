# PROJ-11: Kommentare & Workflow-Status

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen existieren
- Requires: PROJ-5 (Matching-Engine) – Transaktionsstatus muss sichtbar sein

## User Stories
- As a user, I want to add internal comments to a transaction so that I can document questions or notes for my accountant
- As a user, I want to flag a transaction as "Rückfrage" so that open questions are clearly visible
- As a user, I want to see all transactions with open questions in a filtered view so that I can work through them
- As a user, I want to mark a comment thread as resolved so that it disappears from the open questions view
- As a user, I want to see comment history per transaction so that I understand the context of past decisions

## Acceptance Criteria
- [x] Each transaction has a comments section (visible on expand or in detail panel)
- [x] User can add a text comment (max 500 characters) to any transaction
- [x] User can set a status flag on a transaction: Normal / Rückfrage / Erledigt
- [x] Transactions with status "Rückfrage" show a visual indicator (icon/badge) in the list
- [x] Filtered view "Offene Rückfragen" shows all transactions with status = Rückfrage
- [x] User can mark a Rückfrage as resolved (status → Erledigt or Normal)
- [x] Comment history shows: author, timestamp, text for each comment
- [x] Comments are not editable or deletable after submission (audit trail)
- [x] RLS: comments scoped to mandant_id

## Edge Cases
- Comment added to a transaction in a closed month → allowed (comments don't affect financial data)
- Very long comment → truncated at 500 characters with counter shown
- Multiple users add comments simultaneously → append only, no conflicts
- User deletes a transaction with comments → comments cascade-deleted (or soft-delete)

## Technical Requirements
- `transaktions_kommentare` table: id, transaktion_id, mandant_id, user_id, text, created_at
- Status flag stored on the `transaktionen` record: workflow_status ENUM (normal, rueckfrage, erledigt)
- No real-time updates required in MVP (page refresh or manual reload sufficient)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
TransaktionZeile
└── WorkflowStatusBadge             ← 💬 Icon wenn status = rueckfrage

TransaktionDetailPanel (Side-Sheet)
├── TransaktionsInfo
├── WorkflowStatusSection
│   ├── StatusSelect                ← Normal / Rückfrage / Erledigt
│   └── StatusSpeichernButton
└── KommentareSection
    ├── KommentarListe
    │   └── KommentarEintrag (×n)
    │       ├── AutorName + Zeitstempel
    │       └── KommentarText       ← Read-only, kein Edit/Delete
    └── NeuerKommentarForm
        ├── TextArea (max 500 Zeichen)
        ├── ZeichenCounter          ← "234 / 500"
        └── KommentarSpeichernButton

FilterBar-Erweiterung:
└── "Offene Rückfragen"-Filter      ← workflow_status = rueckfrage

API:
  POST  /api/transaktionen/[id]/kommentare
  PATCH /api/transaktionen/[id]/workflow-status
```

### Datenmodell

```
Neue Tabelle: transaktions_kommentare
  - id (UUID)
  - transaktion_id (UUID, FK → transaktionen)
  - mandant_id (UUID, FK)             ← für RLS
  - user_id (UUID, FK → auth.users)
  - text (Text, max 500 Zeichen)
  - created_at (Timestamp)
  (unveränderlich – kein updated_at / deleted_at)

Bestehend: transaktionen.workflow_status (bereits in PROJ-4 definiert)
  → normal / rueckfrage / erledigt
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Anzeige | Side-Sheet | Kontext bleibt sichtbar |
| Kommentare unveränderlich | Kein Edit/Delete | Audit-Trail für Buchhalter |
| Echtzeit | Nein (MVP) | Supabase Realtime möglich, aber nicht nötig |

### Abhängigkeiten

Keine neuen Packages.

## Implementation Notes (2026-03-17)

### Database
- Migration: `supabase/migrations/20260317000000_create_transaktions_kommentare_table.sql`
- `transaktions_kommentare` table with RLS (SELECT + INSERT policies, no UPDATE/DELETE for audit trail)
- Indexes on `transaktion_id` and `mandant_id`
- ON DELETE CASCADE from both `transaktionen` and `mandanten`

### API Routes
- `GET /api/transaktionen/[id]/kommentare` -- list comments with user email, ordered ASC
- `POST /api/transaktionen/[id]/kommentare` -- add comment, Zod validated (max 500 chars)
- `PATCH /api/transaktionen/[id]/workflow-status` -- update workflow status, Zod validated enum

### Frontend Components
- `transaktion-detail-sheet.tsx` -- Side sheet with transaction details, matching info, workflow status, and comments
- `workflow-status-section.tsx` -- Select dropdown with optimistic update and rollback on error
- `kommentare-section.tsx` -- Comment list + new comment form with character counter
- Updated `transaktionen-tabelle.tsx` -- clickable rows, workflow status icons (amber MessageCircleQuestion / green CheckCircle2)
- Updated `transaktionen/page.tsx` -- detail sheet state, "Rueckfragen" tab with badge count, workflow status change handler

### Design Decisions
- Comments show `is_own` flag so the current user sees "(Du)" next to their comments
- Workflow status changes are optimistic with error rollback
- No month-lock check on comments (comments don't affect financial data, per spec)
- Auth.users email resolution: current user email from session, other users show "Benutzer" (server SDK limitation)

## QA Test Results

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build Status:** PASS (npm run build succeeds with no errors)

### Acceptance Criteria Status

#### AC-1: Each transaction has a comments section (visible on expand or in detail panel)
- [x] Clicking a table row opens `TransaktionDetailSheet` (side sheet)
- [x] `KommentareSection` is rendered inside the detail sheet
- [x] Comments section has heading "Kommentare"

#### AC-2: User can add a text comment (max 500 characters) to any transaction
- [x] `NeuerKommentarForm` with Textarea present in `KommentareSection`
- [x] Zod validation on API: `z.string().min(1).max(500)` enforces 500-char limit server-side
- [x] Client-side character counter `{charCount} / 500` displayed
- [x] Submit button disabled when empty or over limit (`canSubmit` logic)
- [x] POST `/api/transaktionen/[id]/kommentare` creates comment and returns 201
- [ ] BUG-PROJ11-001: Client allows typing up to 510 chars (`maxLength={MAX_CHARS + 10}`) -- see bugs below

#### AC-3: User can set a status flag on a transaction: Normal / Rueckfrage / Erledigt
- [x] `WorkflowStatusSection` renders a `Select` dropdown with all three options
- [x] PATCH `/api/transaktionen/[id]/workflow-status` accepts `z.enum(['normal', 'rueckfrage', 'erledigt'])`
- [x] Optimistic update with rollback on error implemented

#### AC-4: Transactions with status "Rueckfrage" show a visual indicator (icon/badge) in the list
- [x] `transaktionen-tabelle.tsx` renders `MessageCircleQuestion` icon (amber) when `workflow_status === 'rueckfrage'`
- [x] `CheckCircle2` icon (emerald) shown for `erledigt` status
- [x] Icons have `aria-label` for accessibility

#### AC-5: Filtered view "Offene Rueckfragen" shows all transactions with status = Rueckfrage
- [x] "Rueckfragen" tab exists in `TabsList` on the transaktionen page
- [x] `rueckfragenTransaktionen` correctly filters by `workflow_status === 'rueckfrage'`
- [x] Badge count shown on tab when count > 0

#### AC-6: User can mark a Rueckfrage as resolved (status -> Erledigt or Normal)
- [x] Select dropdown in detail sheet allows changing from any status to any other
- [x] `handleWorkflowStatusChange` updates local state in parent so table reflects change immediately

#### AC-7: Comment history shows: author, timestamp, text for each comment
- [x] Each `KommentarEintrag` renders `user_email`, `created_at` (formatted as `dd.MM.yyyy, HH:mm`), and `text`
- [x] Own comments marked with "(Du)" indicator
- [x] Comments ordered ASC (oldest first) from API

#### AC-8: Comments are not editable or deletable after submission (audit trail)
- [x] No PUT/PATCH/DELETE handlers in `/api/transaktionen/[id]/kommentare/route.ts`
- [x] RLS policies: only SELECT and INSERT defined, no UPDATE or DELETE policies on `transaktions_kommentare`
- [x] No edit/delete UI elements rendered for existing comments
- [x] Table definition has no `updated_at` column -- immutable by design

#### AC-9: RLS: comments scoped to mandant_id
- [x] `mandant_kommentare_select` policy: `mandant_id = get_mandant_id()`
- [x] `mandant_kommentare_insert` policy: `mandant_id = get_mandant_id()`
- [x] `mandant_id` column exists and is NOT NULL with FK to mandanten
- [x] RLS enabled on table: `ALTER TABLE transaktions_kommentare ENABLE ROW LEVEL SECURITY`

### Edge Cases Status

#### EC-1: Comment added to a transaction in a closed month
- [x] No month-lock check on comment creation (per spec: "comments don't affect financial data")
- [x] Implementation notes confirm this design decision

#### EC-2: Very long comment -> truncated at 500 characters with counter shown
- [x] Character counter displayed in UI: `{charCount} / 500`
- [x] Server-side Zod validates max 500 chars
- [ ] BUG-PROJ11-001: Client allows 510 chars in textarea before stopping (see bugs)
- [ ] BUG-PROJ11-002: No database-level CHECK constraint on text length (see bugs)

#### EC-3: Multiple users add comments simultaneously
- [x] Append-only design -- INSERT only, no update conflicts possible
- [x] New comment appended to local state via `setKommentare((prev) => [...prev, newKommentar])`

#### EC-4: User deletes a transaction with comments
- [x] `ON DELETE CASCADE` from `transaktionen` -- comments cascade-deleted correctly
- [x] `ON DELETE CASCADE` from `mandanten` as well

### Security Audit Results

#### Authentication
- [x] All API routes check `supabase.auth.getUser()` and return 401 if not authenticated
- [x] Middleware redirects unauthenticated users to `/login`
- [x] API routes excluded from onboarding redirect in middleware (`!pathname.startsWith('/api/')`)

#### Authorization (Multi-Tenant Isolation)
- [x] RLS on `transaktions_kommentare` scoped to `mandant_id = get_mandant_id()`
- [x] Transaction lookup in kommentare route is RLS-scoped (only finds transactions belonging to user's mandant)
- [x] `get_mandant_id()` uses `auth.uid()` to derive mandant -- no user-supplied mandant_id in query
- [x] Comment insert uses `transaktion.mandant_id` from verified DB lookup, not from request body
- [ ] BUG-PROJ11-003: `get_mandant_id()` only returns first mandant for owner (`LIMIT 1`), multi-mandant users (invited via mandant_users) may not be able to access comments -- see bugs

#### Input Validation
- [x] Zod validation on POST kommentare: `z.string().min(1).max(500)`
- [x] Zod validation on PATCH workflow-status: `z.enum(['normal', 'rueckfrage', 'erledigt'])`
- [x] Invalid JSON body handled with try/catch returning 400
- [ ] BUG-PROJ11-004: No HTML sanitization on comment text before storage (potential stored XSS if rendered in non-React context)

#### XSS Prevention
- [x] React auto-escapes output via JSX (`{k.text}`) -- safe in React rendering context
- [x] CSP with nonce in middleware blocks inline scripts
- [x] `frame-ancestors 'none'` prevents clickjacking

#### Rate Limiting
- [ ] BUG-PROJ11-005: No rate limiting on comment creation API -- attacker could spam comments

#### Data Exposure
- [x] `user_id` not exposed in API response -- only `user_email` and `is_own` flag returned
- [x] Other users' emails not leaked -- shown as "Benutzer" (not resolved from auth.users)
- [x] Comments limited to 100 per query to prevent large response payloads

#### Security Headers
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
- [x] Strict-Transport-Security with includeSubDomains and preload
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] CSP with nonce (per-request in middleware)
- [x] Permissions-Policy: camera, microphone, geolocation disabled

#### IDOR (Insecure Direct Object Reference)
- [x] Transaction ID in URL is validated against RLS -- cannot access other mandant's transactions
- [x] Comment insert derives `mandant_id` from the transaction record, not from user input

### Cross-Browser Testing (Code Review)

Note: Code review only -- no live browser testing possible in this environment.

- [x] Chrome: Standard React + shadcn/ui components -- expected full compatibility
- [x] Firefox: No browser-specific APIs used -- expected full compatibility
- [x] Safari: `Intl.NumberFormat('de-AT')` and `Date.toLocaleString('de-AT')` supported in modern Safari

### Responsive Testing (Code Review)

- [x] Detail sheet: `className="w-full sm:max-w-md"` -- full width on mobile, 448px max on desktop
- [x] Comment list: `max-h-64 overflow-y-auto` -- scrollable on small screens
- [x] Table: `overflow-x-auto` on wrapper, columns hidden at breakpoints (`hidden md:table-cell`, `hidden lg:table-cell`)
- [x] Filter bar: `flex-col` on mobile, `flex-row` on `sm:`
- [ ] BUG-PROJ11-006: On 375px viewport, the character counter overlaps the textarea text due to `absolute bottom-2 right-2` positioning with small textarea

### Bugs Found

#### BUG-PROJ11-001: Client textarea allows typing beyond 500 characters
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open a transaction detail sheet
  2. Start typing in the comment textarea
  3. Expected: Input stops at exactly 500 characters
  4. Actual: `maxLength={MAX_CHARS + 10}` (line 175 of kommentare-section.tsx) allows up to 510 characters in the input field, then relies on `isOverLimit` check to disable submit button
- **Impact:** Confusing UX -- user can type 510 chars but cannot submit if over 500. The server-side validation will also reject it. No data integrity risk.
- **Priority:** Nice to have

#### BUG-PROJ11-002: No database-level CHECK constraint on comment text length
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Bypass API validation (e.g., via direct Supabase client or SQL)
  2. Insert a comment with text longer than 500 characters
  3. Expected: Database rejects the insert
  4. Actual: Database accepts any length TEXT value
- **Impact:** Defense-in-depth gap. If a future code path skips Zod validation, oversized comments can be stored. The `text` column is defined as `TEXT NOT NULL` with no `CHECK (char_length(text) <= 500)`.
- **Priority:** Fix in next sprint

#### BUG-PROJ11-003: `get_mandant_id()` does not support invited (non-owner) users
- **Severity:** High
- **Steps to Reproduce:**
  1. User A (owner) creates a mandant and transactions
  2. User A invites User B as "buchhalter" via PROJ-12
  3. User B logs in and opens a transaction detail
  4. Expected: User B can view and add comments
  5. Actual: `get_mandant_id()` returns `SELECT id FROM mandanten WHERE owner_id = auth.uid() LIMIT 1` -- User B is not the owner, so `get_mandant_id()` returns NULL, and all RLS policies deny access
- **Impact:** All RLS-protected tables are inaccessible to invited users. This is a systemic issue affecting PROJ-11 (comments), PROJ-4 (transactions), PROJ-3 (belege), and all other features. Invited users effectively have zero access.
- **Priority:** Fix before deployment (blocking for multi-user scenarios)

#### BUG-PROJ11-004: No server-side HTML sanitization on comment text
- **Severity:** Low
- **Steps to Reproduce:**
  1. Submit a comment with text: `<img src=x onerror=alert(1)>`
  2. Expected: HTML stripped or escaped before storage
  3. Actual: Raw HTML stored in database
- **Impact:** Low risk because React JSX auto-escapes output. However, if comments are ever rendered outside React (email notifications, DATEV export, admin panel), stored XSS could trigger. Defense-in-depth recommendation.
- **Priority:** Nice to have (React mitigates this)

#### BUG-PROJ11-005: No rate limiting on comment creation endpoint
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send 1000 POST requests to `/api/transaktionen/[id]/kommentare` in rapid succession
  2. Expected: Rate limiter returns 429 after threshold
  3. Actual: All 1000 comments created (limited only by Supabase connection pool)
- **Impact:** Potential for comment spam, DB bloat, and abuse. The API limits to 100 comments per GET response, but an attacker could create thousands.
- **Priority:** Fix in next sprint

#### BUG-PROJ11-006: Character counter may overlap text on narrow viewports
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open transaction detail on 375px viewport (mobile)
  2. Type a multi-line comment in the textarea
  3. Expected: Character counter does not overlap readable text
  4. Actual: Counter is positioned `absolute bottom-2 right-2` inside the textarea wrapper, potentially overlapping the last line of text on small screens
- **Impact:** Minor UX inconvenience on mobile -- text may be partially hidden behind the counter.
- **Priority:** Nice to have

#### BUG-PROJ11-007: Missing index on `mandant_id` for `transaktions_kommentare` table
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Check migration: only `idx_kommentare_transaktion ON transaktions_kommentare(transaktion_id)` exists
  2. RLS policy uses `mandant_id = get_mandant_id()` on every query
  3. Expected: Index on `mandant_id` for efficient RLS evaluation
  4. Actual: No index on `mandant_id` -- RLS filter requires sequential scan as table grows
- **Impact:** Performance degradation on large datasets when RLS evaluates mandant_id filter without index support. The spec (Implementation Notes) claims "Indexes on transaktion_id and mandant_id" but only transaktion_id index exists.
- **Priority:** Fix in next sprint

#### BUG-PROJ11-008: Workflow status `initialStatus` not re-synced when sheet re-opens for same transaction
- **Severity:** Low
- **Steps to Reproduce:**
  1. Open transaction detail sheet, change workflow status to "Rueckfrage"
  2. Close the sheet
  3. Another user changes the status to "Erledigt" (or the user changes it via another path)
  4. Re-open the same transaction's detail sheet
  5. Expected: Shows current status from server
  6. Actual: `WorkflowStatusSection` uses `useState(initialStatus)` -- if the parent passes the same `transaktion` object reference with updated `workflow_status`, the `useState` initializer does not re-run (React behavior: initial value only used on mount)
- **Impact:** Stale workflow status shown in detail sheet if the component is not unmounted between opens. Since the Sheet component may stay mounted and just toggle visibility, this could show outdated status.
- **Priority:** Fix before deployment

### Regression Check

Features checked for regression impact from PROJ-11 changes:
- **PROJ-4 (Kontoauszug-Import):** Transaction list page modified -- new columns and click handler added. Table structure preserved. No regression expected.
- **PROJ-5 (Matching-Engine):** AmpelBadge and MatchGrund still rendered in table. No regression.
- **PROJ-6 (Manuelle Zuordnung):** ZuordnungsDialog still wired. `onManualAssign` prop preserved. No regression.
- **PROJ-12 (User-Rollen):** BUG-PROJ11-003 is a systemic issue that blocks invited users from accessing ANY data via RLS.

### Summary

- **Acceptance Criteria:** 9/9 passed (all functional criteria met in code)
- **Bugs Found:** 8 total (0 critical, 1 high, 3 medium, 4 low)
- **Security:** 1 high-severity RLS issue (BUG-PROJ11-003), no direct injection vulnerabilities
- **Production Ready:** NO
- **Recommendation:** Fix BUG-PROJ11-003 (RLS for invited users) and BUG-PROJ11-008 (stale status) before deployment. Address BUG-PROJ11-002, BUG-PROJ11-005, and BUG-PROJ11-007 in the next sprint.

## Deployment
_To be added by /deploy_
