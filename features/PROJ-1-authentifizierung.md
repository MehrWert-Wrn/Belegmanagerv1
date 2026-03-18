# PROJ-1: Authentifizierung

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-18

## Dependencies
- None (Basisfunktion -- alle anderen Features setzen PROJ-1 voraus)

## User Stories
- As a new user, I want to register with my email and password so that I can access my account
- As a new user, I want to receive a verification email so that my account is confirmed before I can log in
- As a returning user, I want to log in with my email and password so that I can access my data
- As a logged-in user, I want to log out so that my session is ended securely
- As a user who forgot their password, I want to request a password reset via email so that I can regain access

## Acceptance Criteria
- [ ] User can register with email + password (min. 8 characters)
- [ ] After registration, a verification email is sent automatically
- [ ] User cannot log in before email is verified
- [ ] User can log in with verified credentials
- [ ] Invalid credentials show a clear error message (no user enumeration)
- [ ] User can request a password reset link via email
- [ ] Password reset link expires after 1 hour
- [ ] Logged-in user can log out (session token invalidated)
- [ ] Authenticated routes redirect unauthenticated users to login
- [ ] Login page redirects already authenticated users to dashboard

## Edge Cases
- Email already registered -> show "if this email exists, a link has been sent" (no enumeration)
- Expired verification link -> user can request a new one
- Expired password reset link -> user sees clear error and can request a new link
- Multiple failed login attempts -> no lockout in MVP but rate limiting via Supabase Auth
- User tries to access protected route -> redirect to login, then back to original URL after login

## Technical Requirements
- Security: Supabase Auth (E-Mail + Passwort), E-Mail-Verifizierung Pflicht
- Session: Supabase session management (JWT), stored in httpOnly cookie or localStorage per Supabase default
- No custom auth logic -- use Supabase Auth exclusively
- DSGVO: Supabase EU-Region Frankfurt

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/
+-- (auth)/                     <-- Auth-Gruppe (kein Layout mit Nav)
|   +-- login/                  <-- /login
|   |   +-- LoginForm           <-- Email + Passwort Felder, Submit
|   |       +-- ErrorMessage    <-- Inline-Fehlermeldung
|   +-- register/               <-- /register
|   |   +-- RegisterForm        <-- Email + Passwort + Bestaetigung
|   |       +-- SuccessMessage  <-- "Bitte E-Mail bestaetigen"
|   +-- forgot-password/        <-- /forgot-password
|   |   +-- ForgotPasswordForm  <-- Nur E-Mail-Feld
|   +-- reset-password/         <-- /reset-password (via Link aus E-Mail)
|   |   +-- ResetPasswordForm   <-- Neues Passwort + Bestaetigung
|   +-- verify-email/           <-- /verify-email (Bestaetigungsseite)
|       +-- VerifyEmailNotice   <-- Status + "Link neu anfordern"
|
+-- (app)/                      <-- Geschuetzte Routen (benoetigen Auth)
|   +-- dashboard/              <-- /dashboard (wird nach Login gezeigt)
|
+-- middleware.ts               <-- Routenschutz (laeuft auf jedem Request)
```

### Datenmodell

Supabase Auth verwaltet alle Nutzerdaten intern -- keine eigenen DB-Tabellen fuer PROJ-1 noetig.

```
Supabase Auth User:
  - ID (UUID, auto-generiert)        -> wird spaeter als owner_id in mandanten gespeichert
  - E-Mail                           -> Pflichtfeld, muss verifiziert sein
  - Passwort (gehasht, von Supabase) -> mindestens 8 Zeichen
  - E-Mail bestaetigt: Ja / Nein     -> Login nur wenn Ja
  - Erstellt am, Letzter Login

Session:
  - JWT-Token (von Supabase verwaltet)
  - Gespeichert als Cookie (httpOnly) im Browser
```

### Technische Entscheidungen

| Entscheidung | Gewaehlt | Warum |
|---|---|---|
| Auth-Anbieter | Supabase Auth | EU-Region Frankfurt, DSGVO-konform, E-Mail-Verifizierung eingebaut |
| Session-Speicher | Cookies (httpOnly) | Sicherer als localStorage gegen XSS; funktioniert mit Next.js Server Components |
| Routenschutz | Next.js Middleware | Laeuft vor dem Seitenaufruf -- kein Flackern, keine ungeschuetzten Seiten |
| Paket | @supabase/ssr | Offizielle Supabase-Bibliothek fuer Next.js App Router mit Cookie-Unterstuetzung |

### Ablauf: Route Protection

```
Nutzer ruft /dashboard auf
        |
middleware.ts prueft Session-Cookie
        |
   Eingeloggt?
   /         \
  Ja          Nein
  |            |
Seite      Redirect zu /login?redirect=/dashboard
laden           |
           Nach Login -> Redirect zurueck zu /dashboard
```

### Abhaengigkeiten

| Package | Zweck |
|---|---|
| `@supabase/supabase-js` | Supabase Client |
| `@supabase/ssr` | Cookie-basierte Sessions fuer Next.js App Router |

## QA Test Results (Round 1 -- 2026-03-17)

> Round 1 found 6 bugs: BUG-1 (critical: missing auth callback), BUG-2 (medium: verify-email unreachable), BUG-3 (high: open redirect), BUG-4 (high: missing security headers), BUG-5 (low: root page double redirect), BUG-6 (low: login password validation inconsistency).

---

## QA Test Results (Round 2 -- 2026-03-18)

**Tested:** 2026-03-18
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification (no running Supabase instance)

### Round 1 Bug Regression Check

| Bug | Status | Notes |
|-----|--------|-------|
| BUG-1: Missing Auth Callback Route | FIXED | `/src/app/auth/callback/route.ts` now exists with `exchangeCodeForSession()`. However, a NEW critical bug was found -- see BUG-PROJ1-R2-001 below. |
| BUG-2: Verify-Email Unreachable | FIXED | Register page now calls `router.push(/verify-email?email=...)` after successful signup. |
| BUG-3: Open Redirect in Login | FIXED | Login form now validates `rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')`. Auth callback route also validates `next` param. |
| BUG-4: Missing Security Headers | FIXED | `next.config.ts` now includes X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS, CSP, Permissions-Policy. |
| BUG-5: Root Page Double Redirect | NOT FIXED | Still redirects `/` to `/login` via page.tsx, causing double redirect for auth users. |
| BUG-6: Login Password min(1) | NOT FIXED | Login form still uses `min(1)` instead of `min(8)`. |

### Acceptance Criteria Status

#### AC-1: User can register with email + password (min. 8 characters)
- [x] Registration form exists at `/register` with email, password, and confirm password fields
- [x] Zod schema enforces minimum 8 characters on password (`z.string().min(8, ...)`)
- [x] Uses `supabase.auth.signUp()` correctly with `emailRedirectTo` pointing to `/auth/callback`
- [x] Password confirmation field with mismatch validation via `.refine()`
- **PASS**

#### AC-2: After registration, a verification email is sent automatically
- [x] `signUp()` call includes `emailRedirectTo` option pointing to `/auth/callback`
- [x] After successful signup, user is redirected to `/verify-email?email=...` with resend capability
- [ ] BUG: Auth callback route is blocked by middleware -- see BUG-PROJ1-R2-001
- **FAIL** (see BUG-PROJ1-R2-001)

#### AC-3: User cannot log in before email is verified
- [x] Handled by Supabase Auth server-side configuration (email confirmation requirement)
- [x] No insecure `getSession()` calls found -- all auth checks use `getUser()` which validates JWT server-side
- **PASS (conditional)** -- depends on Supabase project settings being configured correctly

#### AC-4: User can log in with verified credentials
- [x] Login form at `/login` uses `supabase.auth.signInWithPassword()`
- [x] On success, redirects to validated `redirect` query param or `/dashboard`
- [x] Uses `router.refresh()` to update server-side session state
- **PASS**

#### AC-5: Invalid credentials show a clear error message (no user enumeration)
- [x] Login error message is generic: "E-Mail oder Passwort ist falsch. Bitte ueberpruefe deine Eingaben."
- [x] Does not reveal whether email exists or password is wrong
- **PASS**

#### AC-6: User can request a password reset link via email
- [x] Forgot-password page at `/forgot-password` exists
- [x] Uses `supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing to `/auth/callback?next=/reset-password`
- [x] Always shows success message regardless of whether email exists (anti-enumeration)
- [ ] BUG: Auth callback route blocked by middleware means password reset link will not work -- see BUG-PROJ1-R2-001
- **FAIL** (see BUG-PROJ1-R2-001)

#### AC-7: Password reset link expires after 1 hour
- [x] Informational text states "Der Link ist 1 Stunde gueltig"
- **PASS (conditional)** -- depends on Supabase project settings matching the displayed text

#### AC-8: Logged-in user can log out (session token invalidated)
- [x] Dashboard page has a server action calling `supabase.auth.signOut()` followed by redirect to `/login`
- [x] App sidebar has client-side `signOut()` that redirects to `/login` via `window.location.href` (full page reload clears all client state)
- **PASS**

#### AC-9: Authenticated routes redirect unauthenticated users to login
- [x] Middleware checks `supabase.auth.getUser()` and redirects to `/login?redirect=<path>` if no user
- [x] App layout (`(app)/layout.tsx`) also checks auth as a second layer with `getUser()`
- [x] All 27 API route files check `supabase.auth.getUser()` and return 401 (36 occurrences total)
- **PASS**

#### AC-10: Login page redirects already authenticated users to dashboard
- [x] Middleware checks if authenticated user visits an auth route and redirects to `/dashboard`
- **PASS**

### Edge Cases Status

#### EC-1: Email already registered -- no enumeration
- [x] Register page catches "already registered" error and redirects to verify-email page (same flow as success)
- **PASS**

#### EC-2: Expired verification link -- user can request a new one
- [x] Verify-email page has "Link erneut senden" button using `supabase.auth.resend()` with correct `emailRedirectTo`
- [x] Resend button is now reachable because register redirects to `/verify-email?email=...`
- **PASS** (functionality correct, blocked by BUG-PROJ1-R2-001 at the callback stage)

#### EC-3: Expired password reset link -- clear error + new link
- [x] Reset-password page catches expired/invalid errors and shows "Dieser Link ist abgelaufen"
- [x] Shows a link to `/forgot-password` to request a new one
- **PASS**

#### EC-4: Multiple failed login attempts -- rate limiting
- [x] Relies on Supabase Auth built-in rate limiting (no custom implementation needed per spec)
- **PASS**

#### EC-5: Redirect back to original URL after login
- [x] Middleware sets `redirect` query param when redirecting to login
- [x] Login form reads `redirect` param, validates it, and navigates there after success
- [x] Open redirect protection in place (checks for `/` prefix, blocks `//`)
- **PASS**

### Security Audit Results

#### Authentication and Session Management
- [x] Uses `@supabase/ssr` with cookie-based sessions (correct pattern for Next.js App Router)
- [x] Server client uses `cookies()` from `next/headers` (httpOnly by default via Supabase SSR)
- [x] Middleware runs on every request via broad matcher pattern
- [x] `supabase.auth.getUser()` used exclusively (validates JWT server-side) -- no insecure `getSession()` calls found
- [x] Auth callback route uses `exchangeCodeForSession()` for PKCE flow

#### Authorization
- [x] All 27 API route files check authentication before processing (36 `getUser()` calls)
- [x] RLS enabled on database tables with `mandant_id` scoping
- [x] Admin-only routes (`/api/benutzer/*`) use `requireAdmin()` helper with role check via RPC
- [x] `requireAuth()` and `requireAdmin()` are centralized in `src/lib/auth-helpers.ts`

#### Input Validation
- [x] All forms use Zod schema validation (client-side)
- [x] All API routes use Zod schema validation (server-side)
- [x] Email validated as proper email format
- [x] Password minimum length enforced (8 chars) on registration
- [x] UID number validated with regex (`/^(ATU\d{8})?$/`) in onboarding API

#### Open Redirect Protection
- [x] Login form validates redirect param: must start with `/` and not `//`
- [x] Auth callback route validates `next` param: must start with `/`, defaults to `/dashboard`
- **PASS**

#### Security Headers
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
- [x] Referrer-Policy: strict-origin-when-cross-origin
- [x] Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
- [x] Permissions-Policy: camera=(), microphone=(), geolocation=()
- [ ] NOTE: CSP includes `'unsafe-inline'` and `'unsafe-eval'` for script-src. This is common for Next.js but weakens XSS protection. Consider using nonces in production.
- **PASS** (with CSP note)

#### Admin Client Security
- [x] `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` (server-only env var, no `NEXT_PUBLIC_` prefix)
- [x] `autoRefreshToken: false` and `persistSession: false` set correctly
- [x] Only imported in server-side API routes (`benutzer/route.ts`, `benutzer/einladen/route.ts`)

#### Env Vars
- [x] `.env.local.example` documents all required env vars with dummy values
- [x] `SUPABASE_SERVICE_ROLE_KEY` is not prefixed with `NEXT_PUBLIC_`
- [x] `.env*.local` is in `.gitignore`
- [x] `.env.local` exists but is not tracked by git

### Bugs Found

#### BUG-PROJ1-R2-001: Middleware Blocks Auth Callback Route (CRITICAL - Blocker)
- **Severity:** Critical
- **Component:** `middleware.ts` line 41, `src/app/auth/callback/route.ts`
- **Steps to Reproduce:**
  1. Register a new account at `/register`
  2. Receive verification email from Supabase
  3. Click the verification link which points to `/auth/callback?code=...`
  4. Expected: The route handler at `/auth/callback` exchanges the code for a session via `exchangeCodeForSession()`, then redirects to `/dashboard`
  5. Actual: The middleware intercepts the request first. Since the user has no session yet (the code has not been exchanged), `getUser()` returns null. The path `/auth/callback` is NOT in the `isAuthRoute` whitelist (which only includes `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`). And `/auth/callback` is not `/`. Therefore the middleware redirects to `/login?redirect=/auth/callback` BEFORE the route handler ever executes. The PKCE code is lost in the redirect.
- **Impact:** Email verification and password reset flows are completely broken. Users cannot verify their email or reset their password because the callback route is unreachable by unauthenticated users.
- **Fix:** Add `pathname.startsWith('/auth/')` to the `isAuthRoute` check in `middleware.ts`.
- **Priority:** Fix before deployment (BLOCKER)

#### BUG-PROJ1-R2-002: Root Page Double Redirect for Authenticated Users (inherited from Round 1 BUG-5)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Log in as authenticated user
  2. Navigate to `/`
  3. Expected: Single redirect to `/dashboard`
  4. Actual: `page.tsx` does `redirect('/login')`, middleware then redirects auth user from `/login` to `/dashboard`. Two redirects instead of one.
- **Priority:** Nice to have

#### BUG-PROJ1-R2-003: Login Password Validation Inconsistency (inherited from Round 1 BUG-6)
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to `/login`, enter email and a 1-character password, submit
  2. Expected: Hint that password needs at least 8 characters (consistent with register)
  3. Actual: Login form accepts any non-empty password (`min(1)`). Functionally harmless since Supabase rejects wrong passwords server-side, but inconsistent UX.
- **Priority:** Nice to have

#### BUG-PROJ1-R2-004: CSP Uses unsafe-inline and unsafe-eval
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Inspect response headers in browser DevTools
  2. CSP header includes `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
  3. Expected: CSP should use nonces for inline scripts to prevent XSS
  4. Actual: `'unsafe-inline'` and `'unsafe-eval'` significantly weaken CSP protection against XSS attacks. An attacker who can inject HTML can execute arbitrary JavaScript.
- **Note:** This is a common compromise for Next.js apps. Full mitigation requires nonce-based CSP which is non-trivial with Next.js.
- **Priority:** Fix in next sprint (not a blocker but reduces security posture)

### Cross-Browser Compatibility (Code Review)
- [x] No browser-specific APIs used (standard React + Next.js)
- [x] `window.location.origin` used for email redirect URLs (standard API, supported in all browsers)
- [x] `useSearchParams()` wrapped in `Suspense` boundaries (correct for Next.js 14)
- [x] shadcn/ui components used consistently (cross-browser tested by library)
- [x] `autoComplete` attributes set correctly on all form inputs
- Note: Full manual browser testing (Chrome, Firefox, Safari) requires a running instance with Supabase configured.

### Responsive Design (Code Review)
- [x] Auth layout uses `min-h-screen flex items-center justify-center p-4` -- centers on all viewports
- [x] Form container constrained to `max-w-md` -- appropriate for mobile (375px) through desktop (1440px)
- [x] App sidebar uses `SidebarTrigger` visible only on `md:hidden` -- proper mobile handling
- [x] Mobile header with hamburger menu at 375px/768px breakpoints
- Note: Full responsive testing at 375px/768px/1440px requires a running instance.

### Summary
- **Acceptance Criteria:** 8/10 passed (AC-2 and AC-6 FAIL due to middleware blocking callback)
- **Bugs Found:** 4 total (1 critical, 0 high, 1 medium, 2 low)
- **Previous Bugs Fixed:** 4/6 from Round 1 (BUG-1 through BUG-4 all fixed)
- **Security:** CRITICAL ISSUE (middleware blocks PKCE callback, making email verification and password reset non-functional)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-PROJ1-R2-001 (add `/auth/callback` to middleware whitelist) -- this is the sole remaining blocker. After that fix, all acceptance criteria should pass and the feature can be marked production-ready. The medium and low severity bugs can be addressed in subsequent sprints.

## Deployment
_To be added by /deploy_
