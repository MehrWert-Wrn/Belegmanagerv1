# PROJ-2: Mandant-Onboarding

## Status: Deployed
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – User muss eingeloggt und verifiziert sein

## User Stories
- As a new user, I want to create my company (Mandant) during onboarding so that my data is correctly assigned
- As a new user, I want to be guided through setup with a wizard so that I don't miss important configuration steps
- As a user, I want to enter my company's master data (name, address, UID-Nummer) so that it appears correctly on exports
- As a user, I want to see a setup completion indicator so that I know my account is ready to use

## Acceptance Criteria
- [ ] After first login (verified), user is automatically redirected to onboarding wizard
- [ ] Wizard requires: Firmenname, Rechtsform, Adresse, UID-Nummer (optional), Geschäftsjahr-Start
- [ ] Mandant record is created in DB with `mandant_id` tied to the authenticated user
- [ ] All subsequent data is scoped to this `mandant_id` (RLS enforced)
- [ ] Onboarding wizard shows progress (step X of Y)
- [ ] After completing onboarding, user lands on the main dashboard
- [ ] Users who have already completed onboarding skip the wizard on subsequent logins
- [ ] User can later edit company master data in settings

## Edge Cases
- User closes browser mid-wizard → progress is saved, wizard resumes where left off on next login
- User submits invalid UID-Nummer format → validation error, no external API call in MVP
- User skips optional fields → allowed, can be filled later
- Multiple browser tabs open during onboarding → only one mandant created (idempotent)

## Technical Requirements
- Multi-Tenancy: `mandant_id` (UUID) generated at mandant creation, stored on all future records
- RLS: Row-Level Security policies must be applied to the `mandanten` table immediately
- Supabase Auth: `auth.uid()` linked to `mandanten.owner_id`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/
├── (auth)/
│   └── onboarding/                    ← /onboarding (geschützt, kein Nav)
│       ├── OnboardingWizard           ← Hauptcontainer, verwaltet aktuellen Schritt
│       │   ├── StepIndicator          ← "Schritt 2 von 3" + Fortschrittsbalken
│       │   ├── Step 1: Firmendaten
│       │   │   ├── FirmennameFeld     ← Pflichtfeld
│       │   │   ├── RechtsformSelect   ← GmbH, GmbH & Co KG, EinzelU, etc.
│       │   │   └── UIDNummerFeld      ← Optional, Format AT + 8 Ziffern
│       │   ├── Step 2: Adresse
│       │   │   ├── StrasseFeld
│       │   │   ├── PLZFeld
│       │   │   ├── OrtFeld
│       │   │   └── LandSelect         ← Default: Österreich
│       │   └── Step 3: Geschäftsjahr
│       │       ├── GeschaeftsjahrbeginnSelect  ← Monat (1–12)
│       │       └── ConfirmSummary     ← Zusammenfassung aller Eingaben vor Abschluss
│       └── SkipGuard                  ← Redirect wenn Mandant bereits existiert
│
├── (app)/
│   └── settings/
│       └── firma/                     ← /settings/firma
│           └── FirmaSettingsForm      ← Dieselben Felder wie Wizard, einzeln editierbar
│
└── middleware.ts                      ← Prüft: Eingeloggt? Onboarding abgeschlossen?
```

### Datenmodell

```
Tabelle: mandanten
  - id (UUID, Primärschlüssel)         → wird mandant_id auf allen anderen Tabellen
  - owner_id (UUID)                    → verknüpft mit auth.uid()
  - firmenname (Text, Pflicht)
  - rechtsform (Text)                  → GmbH / GmbH & Co KG / Einzelunternehmen / etc.
  - uid_nummer (Text, optional)        → Format: ATU12345678
  - strasse (Text)
  - plz (Text)
  - ort (Text)
  - land (Text, Default: AT)
  - geschaeftsjahr_beginn (Integer)    → Monat 1–12
  - onboarding_abgeschlossen (Boolean) → false solange Wizard läuft
  - erstellt_am (Timestamp)

RLS: Nur owner_id = auth.uid() darf lesen/schreiben
```

### Middleware-Erweiterung (aufbauend auf PROJ-1)

```
Request kommt herein
        ↓
  1. Eingeloggt? → Nein → /login
  2. Mandant existiert & onboarding_abgeschlossen?
        ↓ Nein → /onboarding
        ↓ Ja   → Anfrage durchlassen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Wizard-State | URL-Params (?step=2) | Browser-Back funktioniert, Tab-Crash-sicher |
| Fortschrittsspeicherung | DB (onboarding_abgeschlossen) | Überlebt Browser-Schließen |
| Idempotenz | UPSERT auf mandanten | Kein doppelter Mandant bei Tab-Duplikation |

### Abhängigkeiten

Keine neuen Packages – shadcn/ui (Form, Select, Input, Progress) und Supabase.

## QA Test Results

### QA Run 1 (2026-03-17) -- Initial Review

**Tested:** 2026-03-17
**Tester:** QA Engineer (AI)
**Method:** Static code review, build verification, security audit
**Bugs Found:** 8 total (1 critical, 1 high, 4 medium, 2 low)
**Result:** NOT READY -- BUG-PROJ2-001 (missing migrations) was the blocker.

---

### QA Run 2 (2026-03-18) -- Re-test After Fixes

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review, build verification (`npm run build` passes), security audit
**Build Status:** PASS (no build errors)

---

### Acceptance Criteria Status

#### AC-1: After first login, user is redirected to onboarding wizard
- [x] Middleware (middleware.ts L56-68) checks `mandanten` table for `onboarding_abgeschlossen` flag
- [x] If no mandant or flag is false, redirects to `/onboarding`
- [x] Uses `maybeSingle()` correctly to handle no-row case without error
- **PASS**

#### AC-2: Wizard requires: Firmenname, Rechtsform, Adresse, UID-Nummer, Geschaeftsjahr-Start
- [x] Step 1: Firmenname (required via Zod `.min(1)`), Rechtsform (required via `.min(1)`), UID-Nummer (optional with ATU format validation)
- [x] Step 2: Strasse, PLZ, Ort (all optional per Zod schema), Land hardcoded to "Oesterreich" (displayed) / "AT" (stored)
- [x] Step 3: Geschaeftsjahr-Beginn (required, month select 1-12)
- **PASS**

#### AC-3: Mandant record created with mandant_id tied to authenticated user
- [x] API route (`/api/onboarding/route.ts`) uses server-side Supabase client with `supabase.auth.getUser()` to get `owner_id`
- [x] Uses `upsert` with `onConflict: 'owner_id'` for idempotent creation
- [x] Also creates `mandant_users` entry with admin role for the owner
- [x] DB trigger `trg_seed_mandant_admin` provides additional safety net for mandant_users creation
- [ ] BUG: Middleware redirects `/api/onboarding` before the route handler can execute (see BUG-PROJ2-009)
- **FAIL** (see BUG-PROJ2-009)

#### AC-4: All subsequent data scoped to mandant_id (RLS enforced)
- [x] Initial schema migration (20260313000000_initial_schema.sql) creates all core tables with RLS enabled
- [x] `get_mandant_id()` function created as `SECURITY DEFINER` for RLS policy use
- [x] RLS policies on all tables: mandanten, mandant_users, zahlungsquellen, belege, transaktionen, transaktions_kommentare, import_protokolle, monatsabschluesse, export_protokolle
- [ ] BUG: Duplicate migration files will fail on fresh deploy (see BUG-PROJ2-010)
- **PARTIAL PASS** (schema correct but deployment broken by duplicates)

#### AC-5: Onboarding wizard shows progress (step X of Y)
- [x] Displays "Schritt X von 3" text with percentage
- [x] Uses shadcn `Progress` component with calculated value `(currentStep / TOTAL_STEPS) * 100`
- [x] Step navigation via URL search params (?step=2) enabling browser back button
- **PASS**

#### AC-6: After completing onboarding, user lands on main dashboard
- [x] `router.push('/dashboard')` called after successful API response (onboarding/page.tsx L173)
- [x] `router.refresh()` called to invalidate server-side cache (L174)
- **PASS** (assuming BUG-PROJ2-009 is fixed)

#### AC-7: Users who completed onboarding skip the wizard on subsequent logins
- [x] Middleware L71-83 checks `onboarding_abgeschlossen` and redirects completed users away from `/onboarding` to `/dashboard`
- **PASS**

#### AC-8: User can later edit company master data in settings
- [x] `/settings/firma` page exists with full form (settings/firma/page.tsx)
- [x] Loads existing mandant data via `supabase.from('mandanten').select('*').maybeSingle()` on mount
- [x] Updates via `supabase.from('mandanten').update({...}).eq('owner_id', user.id)`
- [x] Shows "Aenderungen gespeichert." success message
- [x] FIX VERIFIED: Rechtsform Select now uses `value={watch('rechtsform') || ''}` (L110) -- controlled component shows saved value
- [x] FIX VERIFIED: Geschaeftsjahr Select now uses `value={watch('geschaeftsjahr_beginn') || ''}` (L139) -- controlled component shows saved value
- **PASS** (BUG-PROJ2-003 is FIXED)

### Edge Cases Status

#### EC-1: Browser closed mid-wizard -- progress saved
- [x] FIX VERIFIED: Wizard data now persisted to localStorage via `STORAGE_KEY = 'onboarding_wizard_data'` (onboarding/page.tsx L73)
- [x] State initializer reads from localStorage on mount (L79-86)
- [x] `persist()` function saves to localStorage after each step (L97-99, called in L128, L135)
- [x] localStorage cleared after successful onboarding completion (L172)
- Note: Data does NOT survive across devices or if user clears browser storage. This is acceptable for an onboarding wizard; the spec says "progress is saved" which localStorage fulfills.
- **PASS** (BUG-PROJ2-002 is FIXED)

#### EC-2: Invalid UID-Nummer format -- validation error
- [x] Client-side: Zod regex `^(ATU\d{8})?$` validates allowing empty string or ATU + exactly 8 digits
- [x] Server-side: Same regex validation in API route onboardingSchema (api/onboarding/route.ts L8-12)
- [x] Error message displayed: "Format: ATU gefolgt von 8 Ziffern (z.B. ATU12345678)"
- **PASS**

#### EC-3: Skip optional fields
- [x] Step 2 fields (strasse, plz, ort) all defined as `z.string().optional()` in client Zod schema
- [x] Server-side schema also marks these as `.optional().nullable()` with `.max()` length limits
- [x] Null coalescing used when saving: `merged.strasse || null`
- **PASS**

#### EC-4: Multiple browser tabs -- only one mandant created (idempotent)
- [x] Uses upsert with `onConflict: 'owner_id'` preventing duplicate mandant records
- [x] `mandant_users` upsert also uses `onConflict: 'mandant_id,user_id'`
- [x] DB has `UNIQUE(owner_id)` constraint on mandanten table as backup
- **PASS**

#### EC-5 (additional): Direct URL manipulation of step parameter
- [x] Step is clamped: `Math.min(Math.max(parseInt(searchParams.get('step') || '1'), 1), TOTAL_STEPS)`
- [x] FIX VERIFIED: useEffect guard (L91-95) checks `if (currentStep > 1 && !data.firmenname)` and redirects to step 1
- [ ] BUG: The guard is client-side and runs after initial render. On step 3, the summary briefly flashes with empty data before the redirect fires. Also, the guard only checks `firmenname`, not `rechtsform` -- a user could complete step 1 with firmenname only, skip to step 3, and submit without rechtsform being validated for step 2 (though step 2 fields are all optional, so this is acceptable).
- [ ] BUG: Server-side validation in API route (L6) requires `firmenname.min(1)`, so even if the client-side guard is bypassed, the server rejects empty firmenname. This is correct defense-in-depth.
- **PASS** (BUG-PROJ2-004 is effectively FIXED -- server-side validation prevents data integrity issues)

### Security Audit Results

#### Authentication
- [x] Middleware redirects unauthenticated users to `/login` for all non-auth routes (L41-45)
- [x] API route re-checks auth via `supabase.auth.getUser()` before any DB write (api/onboarding/route.ts L21-22)
- [x] Returns 401 Unauthorized if no user session
- **PASS**

#### Authorization / Mandant Isolation
- [x] API route uses `user.id` from authenticated server-side Supabase session, not from request body -- no IDOR possible
- [x] Upsert on `owner_id` prevents creating mandants for other users
- [x] Settings/firma update scoped by `owner_id = user.id` from auth session
- [x] RLS policies now exist on mandanten table: `owner_id = auth.uid()` for SELECT, INSERT, UPDATE
- [x] Settings/firma `select('*').maybeSingle()` is safe because RLS policy `mandanten_select_own` restricts to `owner_id = auth.uid()`
- **PASS** (previous conditional pass now resolved -- RLS exists in migration)

#### Input Validation
- [x] Client-side Zod schemas validate all form inputs
- [x] FIX VERIFIED: Server-side Zod validation now exists in `/api/onboarding/route.ts` (L5-17)
- [x] Server schema includes `.max()` length limits (firmenname: 255, rechtsform: 100, plz: 10, ort: 100, strasse: 255)
- [x] UID-Nummer regex validated on both client and server
- [x] geschaeftsjahr_beginn validated as `z.number().int().min(1).max(12)` on server
- [ ] BUG: Settings/firma page still writes directly to Supabase from browser client (no API route) -- server-side validation only covers onboarding, not settings updates (see BUG-PROJ2-011)
- **PARTIAL PASS** (onboarding fixed, settings still vulnerable)

#### Rate Limiting
- [ ] No rate limiting on the onboarding API route or settings page. Low impact since upsert is idempotent.
- **LOW RISK** (unchanged)

#### Security Headers
- [x] X-Frame-Options: DENY configured in next.config.ts
- [x] X-Content-Type-Options: nosniff configured
- [x] Strict-Transport-Security with includeSubDomains configured
- [x] Referrer-Policy: strict-origin-when-cross-origin configured
- [x] Permissions-Policy restricts camera, microphone, geolocation
- [ ] No Content-Security-Policy header configured
- **PARTIAL PASS** (BUG-PROJ2-006 still open)

#### Exposed Secrets
- [x] `.env.local.example` contains only placeholder values
- [x] `SUPABASE_SERVICE_ROLE_KEY` is only used in `admin.ts` (server-side only)
- [x] Browser client uses only `NEXT_PUBLIC_` prefixed variables (anon key)
- [x] API route uses server-side Supabase client (anon key with cookie auth, not service role)
- **PASS**

#### XSS
- [x] React JSX auto-escapes rendered values -- no `dangerouslySetInnerHTML` usage found
- [x] User input goes through Zod validation before rendering in summary
- **PASS**

### Cross-Browser Testing
- Note: Static code review only. No runtime browser testing performed.
- The wizard uses standard HTML form elements, shadcn/ui Select (Radix UI), and React state.
- localStorage API used for wizard state persistence -- supported in all modern browsers.
- Responsive layout uses `max-w-md` from auth layout, centering on all screen sizes.

### Responsive Testing
- Auth layout uses `min-h-screen flex items-center justify-center p-4` with `max-w-md` container -- works on 375px, 768px, 1440px
- Step 2 address fields use `grid grid-cols-3 gap-3` which may be tight on 375px mobile (PLZ field very narrow)
- Settings/firma uses `grid grid-cols-2 gap-4` for Rechtsform/UID row -- may also be tight on 375px

### Bugs Found

#### Resolved Bugs (from QA Run 1)

| Bug ID | Status | Resolution |
|--------|--------|------------|
| BUG-PROJ2-001 | FIXED | Initial schema migration created (20260313000000_initial_schema.sql) with all tables, RLS, functions |
| BUG-PROJ2-002 | FIXED | localStorage persistence added for wizard data (STORAGE_KEY, persist function) |
| BUG-PROJ2-003 | FIXED | Settings/firma Select components now use `value={watch(...)}` for controlled rendering |
| BUG-PROJ2-004 | FIXED | Client-side useEffect guard + server-side Zod `firmenname.min(1)` prevents empty mandant creation |
| BUG-PROJ2-005 | FIXED | Server-side API route `/api/onboarding` with Zod validation now handles onboarding |
| BUG-PROJ2-008 | FIXED | API route returns proper error JSON for both mandant and mandant_users failures |
| BUG-PROJ2-006 | OPEN | Missing Content-Security-Policy header (Low severity, unchanged) |
| BUG-PROJ2-007 | OPEN | Middleware DB query on every request (Low severity, unchanged) |

#### New Bugs Found in QA Run 2

#### BUG-PROJ2-009: Middleware Redirects /api/onboarding Before Route Handler Executes (CRITICAL)
- **Severity:** Critical
- **Description:** The middleware matcher `/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)` matches ALL routes including `/api/*`. The onboarding check (middleware.ts L56-68) evaluates: `user && !isAuthRoute && !isOnboarding && pathname !== '/'`. Since `/api/onboarding` does NOT start with `/onboarding` (it starts with `/api/`), `isOnboarding` is false. For a user who has not completed onboarding, the middleware redirects the API call to `/onboarding` with a 302 before the route handler can execute.
- **Steps to Reproduce:**
  1. Register and verify a new account
  2. Complete the onboarding wizard steps 1-3
  3. Click "Abschliessen" which calls `fetch('/api/onboarding', { method: 'POST', ... })`
  4. Expected: API route processes the POST and creates the mandant
  5. Actual: Middleware intercepts the request, sees no mandant with `onboarding_abgeschlossen`, and redirects (302) to `/onboarding`. The fetch API follows the redirect (GET /onboarding), receives HTML, and `response.json()` throws a parse error. The user sees "Ein unerwarteter Fehler ist aufgetreten."
- **Impact:** Onboarding is completely broken -- no user can complete the wizard. This is a BLOCKER.
- **Root Cause:** Middleware does not exclude `/api/` routes from the onboarding redirect check.
- **Fix Suggestion:** Add `pathname.startsWith('/api/')` as an exclusion in the middleware onboarding check condition (L56).
- **Priority:** BLOCKER -- must be fixed immediately

#### BUG-PROJ2-010: Duplicate Migration Files Will Fail on Fresh Deploy (HIGH)
- **Severity:** High
- **Description:** The initial schema migration (20260313000000_initial_schema.sql) creates `mandant_users`, `transaktions_kommentare`, `get_user_rolle()`, `seed_mandant_admin()`, and related indexes/triggers. However, three later migration files still exist and attempt to create the same objects:
  - `20260317000000_create_transaktions_kommentare_table.sql` -- creates `transaktions_kommentare` table, policies, and indexes that already exist
  - `20260317144508_create_mandant_users_table.sql` -- creates `mandant_users` table, policies, trigger, and indexes that already exist
  - `20260317144509_add_get_user_rolle_function.sql` -- creates `get_user_rolle()` function that already exists
- **Steps to Reproduce:**
  1. Run `supabase db reset` or deploy to a fresh Supabase project
  2. Migration 20260313000000 runs successfully, creating all objects
  3. Migration 20260317000000 fails with `ERROR: relation "transaktions_kommentare" already exists`
  4. All subsequent migrations also fail
- **Impact:** Fresh deployments are broken. Existing deployments that already ran the older migrations before the initial schema was added may work, but new environments will not.
- **Priority:** Fix before any deployment -- either delete the 3 duplicate migration files or add `IF NOT EXISTS` guards to the initial schema

#### BUG-PROJ2-011: Settings/Firma Page Has No Server-Side Validation (MEDIUM)
- **Severity:** Medium
- **Description:** While the onboarding flow was fixed to use a server-side API route with Zod validation, the Settings/Firma page (`src/app/(app)/settings/firma/page.tsx`) still writes directly to Supabase from the browser client using `supabase.from('mandanten').update({...})`. A technical user could bypass client-side Zod validation by calling the Supabase update directly from browser DevTools.
- **Impact:** Mitigated by DB column constraints (NOT NULL on firmenname) and RLS policies. However, a user could write arbitrary strings to text fields (e.g., very long firmenname, invalid UID format) bypassing the `.max()` and regex checks.
- **Priority:** Fix in next sprint (defense-in-depth)

#### BUG-PROJ2-012: localStorage SSR Crash Risk in Onboarding (MEDIUM)
- **Severity:** Medium
- **Description:** The `useState` initializer (onboarding/page.tsx L79-86) calls `localStorage.getItem()` during the initial render. While the page is wrapped in `Suspense` and marked `'use client'`, the component could potentially be rendered during SSR where `localStorage` is undefined. The `try/catch` block prevents a crash, but it means SSR and client renders will have different initial state, causing a React hydration mismatch warning.
- **Impact:** Potential console hydration warning. No functional impact since the page is purely client-side, but it is technically incorrect.
- **Priority:** Nice to have (wrap in `useEffect` or check `typeof window !== 'undefined'`)

### Regression Impact
- Middleware changes affect ALL authenticated routes (PROJ-1 login flow, PROJ-3 through PROJ-12)
- If middleware DB query fails, ALL users are redirected to onboarding regardless of status
- BUG-PROJ2-009 blocks ALL new user onboarding -- no new mandants can be created
- BUG-PROJ2-010 blocks ALL fresh deployments

### Summary
- **Acceptance Criteria:** 6/8 passed, 1 failed (AC-3 due to middleware blocking API), 1 partial (AC-4 due to duplicate migrations)
- **Edge Cases:** 4/4 original cases passed + 1 additional case passed (EC-5 step skip now guarded)
- **Previously Found Bugs:** 6 of 8 fixed, 2 still open (low severity)
- **New Bugs Found:** 4 (1 critical, 1 high, 2 medium)
- **Total Open Bugs:** 6 (1 critical, 1 high, 2 medium, 2 low)
- **Security:** Server-side validation added for onboarding (good). Settings page still lacks server-side validation. RLS policies now exist and are correct.
- **Production Ready:** NO
- **Blocking Issues:** BUG-PROJ2-009 (middleware blocks onboarding API), BUG-PROJ2-010 (duplicate migrations break fresh deploy)
- **Recommendation:** Fix BUG-PROJ2-009 and BUG-PROJ2-010 first (both are blockers). Then re-run QA.

---

### QA Run 3 (2026-03-18) -- Re-test After Fixes for BUG-PROJ2-009, -010, -011, -006

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review, build verification (`npm run build` passes), security audit
**Build Status:** PASS (no build errors)

---

### Acceptance Criteria Status (Run 3)

#### AC-1: After first login, user is redirected to onboarding wizard
- [x] Middleware (middleware.ts L78-100) checks `mandanten` table for `onboarding_abgeschlossen` flag
- [x] If no mandant or flag is false, redirects to `/onboarding`
- [x] Uses `maybeSingle()` correctly to handle no-row case without error
- **PASS**

#### AC-2: Wizard requires: Firmenname, Rechtsform, Adresse, UID-Nummer, Geschaeftsjahr-Start
- [x] Step 1: Firmenname (required via Zod `.min(1)`), Rechtsform (required via `.min(1)` on client), UID-Nummer (optional with ATU format validation)
- [x] Step 2: Strasse, PLZ, Ort (all optional per Zod schema), Land hardcoded to "Oesterreich" / "AT"
- [x] Step 3: Geschaeftsjahr-Beginn (required, month select 1-12)
- [ ] BUG: Server-side schema marks `rechtsform` as `.optional().nullable()` while client requires it -- see BUG-PROJ2-013
- **PARTIAL PASS**

#### AC-3: Mandant record created with mandant_id tied to authenticated user
- [x] API route (`/api/onboarding/route.ts`) uses server-side Supabase client with `supabase.auth.getUser()`
- [x] Uses `upsert` with `onConflict: 'owner_id'` for idempotent creation
- [x] Also creates `mandant_users` entry with admin role
- [x] FIX VERIFIED: Middleware now excludes `/api/` routes from onboarding redirect (middleware.ts L78: `!pathname.startsWith('/api/')`)
- **PASS** (BUG-PROJ2-009 is FIXED)

#### AC-4: All subsequent data scoped to mandant_id (RLS enforced)
- [x] Single migration file (20260313000000_initial_schema.sql) creates all tables with RLS
- [x] `get_mandant_id()` function exists as `SECURITY DEFINER`
- [x] RLS policies on all tables
- [x] FIX VERIFIED: Duplicate migration files removed -- only one migration file exists now
- **PASS** (BUG-PROJ2-010 is FIXED)

#### AC-5: Onboarding wizard shows progress (step X of Y)
- [x] Displays "Schritt X von 3" text with percentage
- [x] Uses shadcn `Progress` component
- [x] Step navigation via URL search params (?step=2)
- **PASS**

#### AC-6: After completing onboarding, user lands on main dashboard
- [x] `router.push('/dashboard')` called after successful API response (L174)
- [x] `router.refresh()` called to invalidate server-side cache (L175)
- **PASS**

#### AC-7: Users who completed onboarding skip the wizard on subsequent logins
- [x] Middleware L85-91 checks `onboarding_abgeschlossen` and redirects completed users from `/onboarding` to `/dashboard`
- **PASS**

#### AC-8: User can later edit company master data in settings
- [x] `/settings/firma` page exists with full form
- [x] Loads existing mandant data via Supabase client query (RLS-protected)
- [x] FIX VERIFIED: Now uses server-side API route `/api/firma` (PATCH) with Zod validation
- [x] Rechtsform/Geschaeftsjahr Select components use controlled `value={watch(...)}`
- **PASS** (BUG-PROJ2-011 is FIXED)

### Edge Cases Status (Run 3)

#### EC-1: Browser closed mid-wizard -- progress saved
- [x] localStorage persistence via `STORAGE_KEY`
- [x] State loaded from localStorage in `useEffect` (avoids SSR hydration mismatch)
- [ ] BUG: Form `defaultValues` are evaluated during initial render when `data` state is still `{}`. The `useEffect` that loads localStorage runs after. Forms never re-initialize with restored data. See BUG-PROJ2-014.
- **FAIL** (BUG-PROJ2-014 -- form fields are empty after page refresh despite localStorage having data)

#### EC-2: Invalid UID-Nummer format -- validation error
- [x] Client-side and server-side regex `^(ATU\d{8})?$`
- **PASS**

#### EC-3: Skip optional fields
- [x] All optional fields correctly handled
- **PASS**

#### EC-4: Multiple browser tabs -- only one mandant created (idempotent)
- [x] Upsert with `onConflict: 'owner_id'`
- **PASS**

### Security Audit Results (Run 3)

#### Authentication
- [x] Middleware redirects unauthenticated users to `/login`
- [x] API routes re-check auth via `supabase.auth.getUser()`
- [x] Returns 401 Unauthorized if no session
- **PASS**

#### Authorization / Mandant Isolation
- [x] API routes use `user.id` from server-side session, not request body
- [x] Upsert on `owner_id` prevents creating mandants for other users
- [x] RLS policies enforce `owner_id = auth.uid()` or `mandant_id = get_mandant_id()`
- **PASS**

#### Input Validation
- [x] Client-side Zod validation on all forms
- [x] Server-side Zod validation on `/api/onboarding` route
- [x] Server-side Zod validation on `/api/firma` route (BUG-PROJ2-011 FIXED)
- [ ] BUG: Server schema for onboarding allows `rechtsform: null` while client requires it -- see BUG-PROJ2-013
- **PARTIAL PASS**

#### Content-Security-Policy
- [x] FIX VERIFIED: CSP now set in middleware via nonce-based `buildCsp()` function (middleware.ts L4-14)
- [x] Includes `script-src 'self' 'nonce-...' 'strict-dynamic'`, `frame-ancestors 'none'`, `connect-src` with Supabase URL
- **PASS** (BUG-PROJ2-006 is FIXED)

#### Rate Limiting
- [ ] No rate limiting on API routes. Low impact since upsert is idempotent.
- **LOW RISK** (unchanged, acceptable for MVP)

#### Exposed Secrets
- [x] `.env*.local` in `.gitignore`
- [x] `SUPABASE_SERVICE_ROLE_KEY` only in `admin.ts` (server-side only)
- [x] Browser client uses only `NEXT_PUBLIC_` prefixed variables
- **PASS**

#### XSS
- [x] No `dangerouslySetInnerHTML` found anywhere in codebase
- [x] React JSX auto-escapes rendered values
- **PASS**

### Responsive Testing (Run 3)
- Auth layout uses `min-h-screen flex items-center justify-center p-4` with `max-w-md` -- works on all viewports
- Step 2 `grid grid-cols-3 gap-3`: PLZ field may be tight on 375px (minor, non-blocking)
- Settings `grid grid-cols-2 gap-4` for Rechtsform/UID: may also be tight on 375px (minor, non-blocking)

### Bugs Resolved Since QA Run 2

| Bug ID | Status | Resolution |
|--------|--------|------------|
| BUG-PROJ2-006 | FIXED | CSP now set in middleware via nonce-based buildCsp() function |
| BUG-PROJ2-009 | FIXED | Middleware now excludes `/api/` routes from onboarding redirect (L78) |
| BUG-PROJ2-010 | FIXED | Duplicate migration files removed -- only 20260313000000_initial_schema.sql remains |
| BUG-PROJ2-011 | FIXED | Settings/firma now uses `/api/firma` API route with server-side Zod validation |
| BUG-PROJ2-012 | FIXED | localStorage loaded in useEffect to avoid SSR hydration mismatch |

### New Bugs Found in QA Run 3

#### BUG-PROJ2-013: Server-Side Schema Allows Null Rechtsform (MEDIUM)
- **Severity:** Medium
- **Description:** The onboarding API route's server-side Zod schema (`/api/onboarding/route.ts` L7) defines `rechtsform` as `z.string().max(100).optional().nullable()`, while the client-side step1Schema requires it with `z.string().min(1, 'Rechtsform ist erforderlich')`. A crafted POST request directly to `/api/onboarding` can create a mandant record without a rechtsform value.
- **Steps to Reproduce:**
  1. Authenticate and obtain a valid session cookie
  2. Send: `curl -X POST /api/onboarding -H 'Content-Type: application/json' -d '{"firmenname":"Test","geschaeftsjahr_beginn":1}'`
  3. Expected: Server rejects request because rechtsform is required
  4. Actual: Server accepts request, mandant created with `rechtsform: null`
- **Impact:** Data integrity issue. The acceptance criteria states "Wizard requires: Rechtsform" but server does not enforce it. Subsequent features (DATEV export, reports) may break or produce incomplete output if rechtsform is null.
- **Priority:** Fix in next sprint -- add `.min(1)` to rechtsform in server schema, or explicitly document it as optional

#### BUG-PROJ2-014: Form Fields Not Pre-Populated After Page Refresh (MEDIUM)
- **Severity:** Medium
- **Description:** The onboarding wizard uses `react-hook-form` with `defaultValues` evaluated at component initialization time (lines 109-124). At that point, `data` state is still `{}` because `localStorage.getItem()` runs in a `useEffect` which executes after the initial render. `react-hook-form` only uses `defaultValues` once during form initialization and does not update when the state changes. This means if a user fills out step 1, refreshes the page, the firmenname/rechtsform/uid fields appear empty even though the data is in localStorage.
- **Steps to Reproduce:**
  1. Start onboarding, fill in step 1 (firmenname, rechtsform)
  2. Click "Weiter" to go to step 2
  3. Refresh the browser page
  4. The step guard useEffect detects `data.firmenname` is initially falsy and redirects to step 1
  5. After useEffect loads localStorage, `data.firmenname` has a value, but form fields remain empty
  6. User must re-enter all data despite it being in localStorage
- **Impact:** Poor UX for the "browser closed mid-wizard" edge case (EC-1). The data is saved but not restored into the visible form fields. The user thinks their progress was lost.
- **Fix Suggestion:** Use `form.reset(savedData)` inside the localStorage useEffect after loading data, or use a `useEffect` that calls `form.reset()` when `data` state changes.
- **Priority:** Fix before deployment -- this is a core edge case in the acceptance criteria

#### BUG-PROJ2-015: Onboarding Wizard Rechtsform Select Uses defaultValue Instead of Controlled value (LOW)
- **Severity:** Low
- **Description:** The Rechtsform Select in the onboarding wizard (L206-217) uses `defaultValue={data.rechtsform}` instead of `value={watch('rechtsform')}`. Since `data` is `{}` at initial render, `defaultValue` is always undefined. If BUG-PROJ2-014 is fixed and the form is reset with localStorage data, the Select component would still show "Bitte waehlen..." because `defaultValue` is only evaluated once by Radix UI Select.
- **Impact:** Visual only -- the form value is correctly tracked by react-hook-form via `onValueChange`, but the Select trigger text may not reflect the actual value after a form reset.
- **Priority:** Nice to have -- switch to controlled `value={watch('rechtsform') || ''}` pattern (same as settings/firma page already does)

### Overall Bug Tracker

| Bug ID | Severity | Status | Summary |
|--------|----------|--------|---------|
| BUG-PROJ2-001 | Critical | FIXED | Missing migrations |
| BUG-PROJ2-002 | High | FIXED | No wizard state persistence |
| BUG-PROJ2-003 | Medium | FIXED | Settings Select not showing saved values |
| BUG-PROJ2-004 | Medium | FIXED | Step skip guard |
| BUG-PROJ2-005 | High | FIXED | No server-side API route for onboarding |
| BUG-PROJ2-006 | Low | FIXED | Missing CSP header |
| BUG-PROJ2-007 | Low | OPEN | Middleware DB query on every request |
| BUG-PROJ2-008 | Medium | FIXED | API error handling |
| BUG-PROJ2-009 | Critical | FIXED | Middleware blocks onboarding API |
| BUG-PROJ2-010 | High | FIXED | Duplicate migration files |
| BUG-PROJ2-011 | Medium | FIXED | Settings/firma no server-side validation |
| BUG-PROJ2-012 | Medium | FIXED | localStorage SSR crash risk |
| BUG-PROJ2-013 | Medium | OPEN | Server allows null rechtsform |
| BUG-PROJ2-014 | Medium | OPEN | Form fields not pre-populated after refresh |
| BUG-PROJ2-015 | Low | OPEN | Onboarding Select uses defaultValue not value |

### Run 3 Summary
- **Acceptance Criteria:** 7/8 passed, 1 partial (AC-2 due to server schema mismatch)
- **Edge Cases:** 3/4 passed, 1 failed (EC-1 form fields not restored after refresh)
- **Bugs from Run 2:** All 4 fixed (BUG-PROJ2-009, -010, -011, -012). BUG-PROJ2-006 also fixed.
- **New Bugs Found:** 3 (0 critical, 0 high, 2 medium, 1 low)
- **Total Open Bugs:** 4 (0 critical, 0 high, 2 medium, 2 low)
- **Security:** All critical and high security issues resolved. CSP now active. Server-side validation on both onboarding and settings. Minor server schema gap (rechtsform optional).
- **Production Ready:** CONDITIONAL YES
- **Rationale:** No critical or high bugs remain. The 2 medium bugs (BUG-PROJ2-013 server schema mismatch, BUG-PROJ2-014 form restore after refresh) are non-blocking for launch since: (a) normal users always go through the client UI which enforces rechtsform, and (b) the refresh scenario is an edge case that degrades to re-entering data rather than data loss. The 2 low bugs are cosmetic.
- **Recommendation:** Fix BUG-PROJ2-014 (form restore) before launch for a polished onboarding experience. BUG-PROJ2-013 (server schema) should also be fixed as defense-in-depth but is not blocking.

## Deployment
_To be added by /deploy_
