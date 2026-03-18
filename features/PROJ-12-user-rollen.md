# PROJ-12: Multi-Tenant User-Rollen

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – Auth-System muss vorhanden sein
- Requires: PROJ-2 (Mandant-Onboarding) – Mandant muss existieren

## User Stories
- As a mandant admin, I want to invite a bookkeeper via email so that they can access my data
- As a mandant admin, I want to assign roles (Admin / Buchhalter) so that access is appropriately restricted
- As a mandant admin, I want to revoke a user's access so that former employees can no longer log in
- As a bookkeeper (Buchhalter), I want to access the mandant's data so that I can perform my tasks
- As a bookkeeper, I want to be limited to read + assign rights (no delete, no admin settings) so that data integrity is protected

## Acceptance Criteria
- [ ] Mandant has at least one user with role "Admin" (the creator/owner)
- [ ] Admin can invite users by email → invite email sent with signup link
- [ ] Invite link creates a new Supabase Auth user linked to the mandant
- [ ] Two roles available: Admin (full access) and Buchhalter (limited access)
- [ ] Buchhalter permissions: view all data, create/edit matches, add comments, export
- [ ] Buchhalter restrictions: cannot delete transactions or belege, cannot close/reopen months, cannot manage users, cannot access settings
- [ ] Admin can change a user's role
- [ ] Admin can deactivate a user (cannot log in, data preserved)
- [ ] User list shows: name, email, role, status (active/inactive), last login
- [ ] A mandant must always have at least one Admin (cannot remove last admin)
- [ ] RLS: enforced based on mandant membership, not just role

## Edge Cases
- Invite to already-registered email → link to existing account, assign to mandant
- Invited user never accepts → invite expires after 7 days, can be resent
- Admin tries to remove their own admin role → blocked if they are the last admin
- Admin deactivates themselves → blocked (must transfer admin role first)
- User belongs to multiple mandants (future case) → not supported in MVP

## Technical Requirements
- `mandant_users` table: mandant_id, user_id, role ENUM (admin, buchhalter), aktiv, invited_at, accepted_at
- RLS policies: all tables filter by mandant_id where user has an active mandant_users record
- Role-based UI hiding + API-level enforcement

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/settings/benutzer/        ← Nur für Admins sichtbar
├── BenutzerHeader + EinladenButton
├── BenutzerTabelle
│   └── BenutzerZeile (×n)
│       ├── Name + E-Mail + RolleBadge + StatusBadge + LetzterLogin
│       └── AktionenMenu
│           ├── RolleÄndernOption
│           ├── DeaktivierenOption
│           └── EinladungNeusendenOption (bei ausstehenden)
└── EinladungsDialog
    ├── EmailFeld
    ├── RolleSelect (Default: Buchhalter)
    └── EinladenButton

Sidebar: "Benutzer"-Link nur für Admins sichtbar

API:
  GET    /api/benutzer
  POST   /api/benutzer/einladen
  PATCH  /api/benutzer/[id]/rolle
  PATCH  /api/benutzer/[id]/status
  POST   /api/benutzer/[id]/einladung-erneut
```

### Datenmodell

```
Neue Tabelle: mandant_users
  - id (UUID)
  - mandant_id (UUID, FK → mandanten)
  - user_id (UUID, FK → auth.users, nullable bei ausstehender Einladung)
  - email (Text)
  - rolle (Enum)                        → admin / buchhalter
  - aktiv (Boolean)
  - eingeladen_am / einladung_angenommen_am (Timestamps)
  - einladung_token (UUID, nullable)    → für Einladungs-Link
  - einladung_gueltig_bis (Timestamp)   → 7 Tage
  UNIQUE(mandant_id, user_id)

RLS-Erweiterung (alle Tabellen):
  Bisherig: owner_id = auth.uid()
  Neu:      EXISTS (mandant_users WHERE mandant_id = table.mandant_id
                    AND user_id = auth.uid() AND aktiv = true)
```

### Rollen-Matrix

```
Aktion                          Admin   Buchhalter
─────────────────────────────────────────────────
Belege / Transaktionen ansehen    ✓         ✓
Matches + Kommentare              ✓         ✓
DATEV-Export                      ✓         ✓
Löschen (Belege / TX)             ✓         ✗
Monatsabschluss öffnen/schließen  ✓         ✗
Einstellungen + Benutzerverwaltung ✓        ✗
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Rollen-Enforcement | API (403) + RLS | Nie nur UI-seitig |
| Einladungs-Flow | Token-Link (7 Tage) | Sicherer als offener Signup-Link |
| Letzter Admin | API blockiert Selbst-Degradierung | Kein Mandant ohne Admin |
| RLS-Erweiterung | mandant_users statt owner_id | Skaliert auf Multi-User |

### Abhängigkeiten

Keine neuen Packages.

## Implementation Notes (2026-03-17)

### Database
- Migration `20260317144508_create_mandant_users_table.sql`: Creates `mandant_users` table with RLS, seeds existing owners as admins, adds auto-seed trigger for new mandants, indexes on mandant_id/user_id/einladung_token
- Migration `20260317144509_add_get_user_rolle_function.sql`: `get_user_rolle()` SQL function returns current user's role in their mandant
- **Note:** Migrations need to be applied manually via `supabase db push` (CLI not authenticated during build)

### Backend (API Routes)
- `GET /api/benutzer` - Lists all mandant_users with last_sign_in_at from auth.users (admin-only)
- `POST /api/benutzer/einladen` - Invite user by email with role, MVP limit of 10 active users, sends Supabase invite email
- `PATCH /api/benutzer/[id]/rolle` - Change role with last-admin protection
- `PATCH /api/benutzer/[id]/status` - Activate/deactivate with last-admin protection
- `POST /api/benutzer/[id]/einladung-erneut` - Resend invite with token reset and 7-day extension
- All routes use shared `requireAuth()`, `requireAdmin()`, `getMandantId()` helpers from `src/lib/auth-helpers.ts`
- Admin client (`src/lib/supabase/admin.ts`) uses `SUPABASE_SERVICE_ROLE_KEY` for auth.admin operations

### Frontend
- Settings layout updated with "Benutzer" tab
- `src/app/(app)/settings/benutzer/page.tsx` - Admin-only page with auto-redirect for non-admins
- `src/components/benutzer/benutzer-tabelle.tsx` - Table with role/status badges, action dropdown (role change, deactivate, resend invite)
- `src/components/benutzer/einladungs-dialog.tsx` - Email + role form with success state
- `src/components/benutzer/rolle-aendern-dialog.tsx` - Role change with select

### Types
- Added `mandant_users` table definition to `Database` type
- Added `get_user_rolle` to Functions
- Added `MandantUser`, `MandantUserInsert`, `UserRolle`, `BenutzerListItem` convenience types

## QA Test Results

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code analysis + build verification (no running Supabase instance)

### Acceptance Criteria Status

#### AC-1: Mandant has at least one user with role "Admin" (the creator/owner)
- [x] PASS: `seed_mandant_admin()` trigger in initial migration auto-inserts owner as admin on mandant creation (line 87-96 of initial_schema.sql)

#### AC-2: Admin can invite users by email -- invite email sent with signup link
- [x] PASS: `POST /api/benutzer/einladen` validates email + role with Zod, inserts `mandant_users` record, sends Supabase `inviteUserByEmail`
- [x] PASS: Admin-only check via `requireAdmin()` is present
- [x] PASS: MVP limit of 10 active users enforced

#### AC-3: Invite link creates a new Supabase Auth user linked to the mandant
- [ ] BUG-PROJ12-001: No mechanism to link the invited auth user back to `mandant_users.user_id`. The invite creates a `mandant_users` row with `user_id = NULL` and sends a Supabase auth invite, but there is no callback/trigger/webhook that updates `mandant_users.user_id` when the invited user accepts and signs up. The `einladung_angenommen_am` field is also never set.

#### AC-4: Two roles available: Admin and Buchhalter
- [x] PASS: Schema uses CHECK constraint `rolle IN ('admin', 'buchhalter')`. Zod schemas on API routes enforce the same.

#### AC-5: Buchhalter permissions -- view all, create/edit matches, add comments, export
- [x] PASS: RLS policies on all tables use `mandant_id = get_mandant_id()`, and `get_mandant_id()` (with the fix migration) returns mandant for any active `mandant_users` member, so Buchhalter can read/write data via RLS.

#### AC-6: Buchhalter restrictions -- cannot delete, close/reopen months, manage users, access settings
- [ ] BUG-PROJ12-002: **Buchhalter role restrictions are NOT enforced at the API level.** The following destructive endpoints have NO role check:
  - `DELETE /api/belege/[id]` -- no `requireAdmin()` check
  - `DELETE /api/kassabuch/eintraege/[id]` -- no `requireAdmin()` check
  - `DELETE /api/transaktionen/[id]/match` -- no `requireAdmin()` check (match removal)
  - `DELETE /api/zahlungsquellen/[id]` -- no `requireAdmin()` check
  - `POST /api/monatsabschluss/[jahr]/[monat]/schliessen` -- no `requireAdmin()` check
  - `POST /api/monatsabschluss/[jahr]/[monat]/oeffnen` -- no `requireAdmin()` check (if exists)
  - `PATCH /api/firma` -- no `requireAdmin()` check
  A Buchhalter can perform all admin-level operations by calling these endpoints directly.

#### AC-7: Admin can change a user's role
- [x] PASS: `PATCH /api/benutzer/[id]/rolle` validates new role, checks mandant scope, updates role

#### AC-8: Admin can deactivate a user (cannot log in, data preserved)
- [x] PASS: `PATCH /api/benutzer/[id]/status` toggles `aktiv` field
- [ ] BUG-PROJ12-003: Deactivating a user sets `aktiv = false` in `mandant_users`, but this does NOT actually prevent the user from logging into Supabase Auth. The auth session remains valid. There is no call to `adminClient.auth.admin.updateUserById()` to ban or disable the auth user. A deactivated user's RLS access is blocked (because `get_mandant_id()` checks `aktiv = true`), but they can still authenticate and potentially access API routes that only check `requireAuth()` without `getMandantId()`.

#### AC-9: User list shows name, email, role, status, last login
- [x] PASS (partial): Email, role, status (active/pending/inactive badges), invited date, accepted date are shown
- [ ] BUG-PROJ12-004: **User name is not displayed.** The table shows email but never displays the user's name. The `mandant_users` table has no `name` column, and names are not fetched from `auth.users`. The acceptance criterion explicitly requires "name" in the user list.
- [x] PASS: `last_sign_in_at` is fetched from auth admin API and available in the response

#### AC-10: A mandant must always have at least one Admin (cannot remove last admin)
- [x] PASS: Both `PATCH /api/benutzer/[id]/rolle` (demoting last admin) and `PATCH /api/benutzer/[id]/status` (deactivating last admin) check admin count and return 400

#### AC-11: RLS enforced based on mandant membership, not just role
- [x] PASS: All RLS policies use `mandant_id = get_mandant_id()`. The fixed `get_mandant_id()` function (migration 20260318000000) checks both `mandanten.owner_id` and `mandant_users` for active members.

### Edge Cases Status

#### EC-1: Invite to already-registered email
- [x] PASS (partial): The invite API gracefully handles `inviteUserByEmail` failing with "already been registered" -- it does not fail the request.
- [ ] BUG-PROJ12-005: However, the mandant_users record is created with `user_id = NULL` even for an existing auth user. There is no lookup to find the existing auth user by email and populate `user_id` and `einladung_angenommen_am`.

#### EC-2: Invited user never accepts -- invite expires after 7 days, can be resent
- [x] PASS: `einladung_gueltig_bis` defaults to `now() + 7 days` in the DB schema
- [x] PASS: `POST /api/benutzer/[id]/einladung-erneut` resets token and extends validity by 7 days, then resends invite email
- [ ] BUG-PROJ12-006: Invite expiration is never actually checked/enforced. The `einladung_gueltig_bis` field exists but no code validates whether an invitation has expired. An expired invite token can still be used indefinitely.

#### EC-3: Admin tries to remove their own admin role -- blocked if last admin
- [x] PASS: The role change API checks if demoting an admin would leave 0 active admins and blocks it with a 400 error. However, it does not specifically check "self-demotion" -- it blocks demotion of ANY last admin, which is correct behavior.

#### EC-4: Admin deactivates themselves -- blocked (must transfer admin role first)
- [x] PASS: The status API has explicit self-deactivation check (lines 79-93 of status/route.ts)

#### EC-5: User belongs to multiple mandants -- not supported in MVP
- [x] PASS: Not implemented, no multi-mandant support. UNIQUE(mandant_id, user_id) constraint is present.

### Security Audit Results

#### Authentication
- [x] All benutzer API routes check `requireAuth()` before processing
- [x] Admin operations check `requireAdmin()` via `get_user_rolle()` RPC

#### Authorization (CRITICAL FINDINGS)
- [ ] BUG-PROJ12-SEC-001 (Critical): **Buchhalter can perform admin-only actions.** No role-based enforcement on delete endpoints, monatsabschluss close/open, or firma settings. See BUG-PROJ12-002. A Buchhalter user can call these APIs directly and bypass UI-only restrictions.
- [ ] BUG-PROJ12-SEC-002 (High): **Settings layout "Benutzer" tab visible to all roles.** The settings layout (`src/app/(app)/settings/layout.tsx`) always renders the "Benutzer" navigation tab, regardless of user role. While the page redirects on 403, the tab is visible and clickable for Buchhalter users.
- [ ] BUG-PROJ12-SEC-003 (Medium): **Sidebar shows "Einstellungen" to all users.** The `app-sidebar.tsx` does not filter navigation items by role. Buchhalter users see the same sidebar as Admins.

#### Middleware / Invited User Flow
- [ ] BUG-PROJ12-SEC-004 (High): **Middleware blocks invited users with onboarding redirect loop.** The middleware (line 79-83) queries `mandanten` by `owner_id = user.id`. An invited user who is NOT the mandant owner will get `mandant = null`, causing an infinite redirect to `/onboarding`. Invited Buchhalter users cannot access the application at all.

#### Input Validation
- [x] Zod validation on all POST/PATCH bodies (email, rolle, status)
- [ ] BUG-PROJ12-SEC-005 (Low): **No UUID format validation on `[id]` path parameter.** The benutzer API routes accept any string as `[id]` without validating UUID format. Invalid values will simply return no results from Supabase, but this is defense-in-depth best practice.

#### Data Exposure
- [ ] BUG-PROJ12-SEC-006 (Medium): **`einladung_token` is selected from DB during invite creation** (line 88 of einladen/route.ts). While it is not included in the API response, it is unnecessarily fetched. If error handling changes or logging is added, this secret token could be leaked.
- [ ] BUG-PROJ12-SEC-007 (Medium): **`GET /api/benutzer` uses `listUsers()` with `perPage: 100`** which fetches ALL auth users across ALL mandants from Supabase Auth, then filters client-side. This leaks no data to the API consumer (only matching IDs are used), but is inefficient and retrieves data from other tenants into server memory.

#### Rate Limiting
- [ ] BUG-PROJ12-SEC-008 (Medium): **No rate limiting on invite endpoint.** An admin could spam invites, causing excessive Supabase invite emails. No in-memory or Redis-based rate limiter is present on any benutzer API route.

#### Cross-Browser / Responsive
- Cannot test visually (static analysis only). Code uses shadcn/ui components (Table, Dialog, Button, Badge, Select, DropdownMenu) which are responsive by default. The Dialog uses `sm:max-w-[425px]` breakpoint. No obvious responsive issues in component code.

### Bugs Found

#### BUG-PROJ12-001: Invited user never linked back to mandant_users record
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Admin invites user@example.com via POST /api/benutzer/einladen
  2. User receives invite email and registers
  3. Expected: `mandant_users.user_id` is populated, `einladung_angenommen_am` is set
  4. Actual: `user_id` remains NULL, `einladung_angenommen_am` remains NULL. No trigger, webhook, or auth callback exists to complete the link.
- **Priority:** Fix before deployment

#### BUG-PROJ12-002: Buchhalter role restrictions NOT enforced at API level
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Log in as a Buchhalter user
  2. Call `DELETE /api/belege/{id}` directly (e.g., via browser console fetch)
  3. Expected: 403 Forbidden
  4. Actual: Operation succeeds -- Beleg is deleted
  5. Same applies to: kassabuch delete, zahlungsquellen delete, monatsabschluss close/open, firma settings update
- **Priority:** Fix before deployment

#### BUG-PROJ12-003: Deactivated user can still authenticate
- **Severity:** High
- **Steps to Reproduce:**
  1. Admin deactivates a user via PATCH /api/benutzer/{id}/status
  2. Deactivated user navigates to /login and signs in with their credentials
  3. Expected: Login fails or session is invalidated
  4. Actual: Login succeeds. RLS blocks data access but user is not truly logged out.
- **Priority:** Fix before deployment

#### BUG-PROJ12-004: User name not displayed in user list
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Navigate to /settings/benutzer as Admin
  2. View the user table
  3. Expected: Name column visible per acceptance criteria
  4. Actual: Only email is shown. No name column exists in mandant_users or is fetched from auth.
- **Priority:** Fix in next sprint

#### BUG-PROJ12-005: Existing auth user not linked on invite
- **Severity:** High
- **Steps to Reproduce:**
  1. User A already has a Supabase Auth account
  2. Admin invites User A's email
  3. Expected: mandant_users.user_id is populated with User A's auth ID
  4. Actual: user_id is NULL. The invite code does not look up existing auth users.
- **Priority:** Fix before deployment

#### BUG-PROJ12-006: Invite expiration not enforced
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Admin invites a user
  2. Wait 8 days (beyond 7-day expiry)
  3. Invited user clicks the invite link
  4. Expected: Link rejected as expired
  5. Actual: No code checks `einladung_gueltig_bis` anywhere
- **Priority:** Fix in next sprint

#### BUG-PROJ12-SEC-001: Buchhalter can perform admin-only operations via direct API calls
- **Severity:** Critical
- **Steps to Reproduce:** See BUG-PROJ12-002
- **Priority:** Fix before deployment

#### BUG-PROJ12-SEC-004: Middleware blocks invited (non-owner) users with onboarding loop
- **Severity:** Critical
- **Steps to Reproduce:**
  1. An invited Buchhalter user logs into the app
  2. Middleware queries `mandanten WHERE owner_id = user.id`
  3. Since this user is NOT the owner, `mandant` is null
  4. Middleware redirects to /onboarding
  5. /onboarding also fails because user is not an owner
  6. Result: infinite redirect loop, invited user can never use the app
- **Priority:** Fix before deployment

#### BUG-PROJ12-SEC-002: Settings "Benutzer" tab visible to Buchhalter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Log in as Buchhalter
  2. Navigate to /settings/firma
  3. "Benutzer" tab is visible in the settings navigation
  4. Clicking it triggers a redirect to /dashboard (403 from API), but the tab should not be visible at all
- **Priority:** Fix in next sprint

#### BUG-PROJ12-SEC-003: Sidebar shows all nav items to all roles
- **Severity:** Low
- **Steps to Reproduce:**
  1. Log in as Buchhalter
  2. Sidebar shows "Einstellungen" link identical to Admin view
- **Priority:** Fix in next sprint

#### BUG-PROJ12-SEC-006: einladung_token unnecessarily fetched from DB
- **Severity:** Low
- **Steps to Reproduce:** Code review: line 88 of einladen/route.ts selects `einladung_token` from DB
- **Priority:** Nice to have

#### BUG-PROJ12-SEC-007: listUsers fetches all auth users cross-tenant
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Call GET /api/benutzer as admin
  2. Server-side: `adminClient.auth.admin.listUsers({ perPage: 100 })` fetches ALL auth users
  3. Only matching user IDs are used in response, but all user data crosses server memory
- **Priority:** Fix in next sprint

#### BUG-PROJ12-SEC-008: No rate limiting on benutzer API routes
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send 100 rapid POST requests to /api/benutzer/einladen with different emails
  2. Expected: Rate limited after N requests
  3. Actual: All requests processed, 100 invite emails sent
- **Priority:** Fix in next sprint

### Summary
- **Acceptance Criteria:** 7/11 passed (4 failed: AC-3, AC-6, AC-8 partial, AC-9 partial)
- **Edge Cases:** 4/5 passed (1 partial fail: EC-1, EC-2 partial)
- **Bugs Found:** 14 total (4 Critical, 3 High, 4 Medium, 3 Low)
- **Security:** Critical issues found -- Buchhalter authorization bypass, middleware blocks invited users
- **Production Ready:** NO
- **Recommendation:** Fix the 4 Critical and 3 High bugs before deployment. The Critical bugs (BUG-PROJ12-001, BUG-PROJ12-002/SEC-001, BUG-PROJ12-SEC-004) represent fundamental feature gaps that make the multi-tenant user roles feature non-functional and insecure.

## Deployment
_To be added by /deploy_
