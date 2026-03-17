# PROJ-1: Authentifizierung

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- None (Basisfunktion – alle anderen Features setzen PROJ-1 voraus)

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
- Email already registered → show "if this email exists, a link has been sent" (no enumeration)
- Expired verification link → user can request a new one
- Expired password reset link → user sees clear error and can request a new link
- Multiple failed login attempts → no lockout in MVP but rate limiting via Supabase Auth
- User tries to access protected route → redirect to login, then back to original URL after login

## Technical Requirements
- Security: Supabase Auth (E-Mail + Passwort), E-Mail-Verifizierung Pflicht
- Session: Supabase session management (JWT), stored in httpOnly cookie or localStorage per Supabase default
- No custom auth logic – use Supabase Auth exclusively
- DSGVO: Supabase EU-Region Frankfurt

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/
├── (auth)/                     ← Auth-Gruppe (kein Layout mit Nav)
│   ├── login/                  ← /login
│   │   └── LoginForm           ← Email + Passwort Felder, Submit
│   │       └── ErrorMessage    ← Inline-Fehlermeldung
│   ├── register/               ← /register
│   │   └── RegisterForm        ← Email + Passwort + Bestätigung
│   │       └── SuccessMessage  ← "Bitte E-Mail bestätigen"
│   ├── forgot-password/        ← /forgot-password
│   │   └── ForgotPasswordForm  ← Nur E-Mail-Feld
│   ├── reset-password/         ← /reset-password (via Link aus E-Mail)
│   │   └── ResetPasswordForm   ← Neues Passwort + Bestätigung
│   └── verify-email/           ← /verify-email (Bestätigungsseite)
│       └── VerifyEmailNotice   ← Status + "Link neu anfordern"
│
├── (app)/                      ← Geschützte Routen (benötigen Auth)
│   └── dashboard/              ← /dashboard (wird nach Login gezeigt)
│
└── middleware.ts               ← Routenschutz (läuft auf jedem Request)
```

### Datenmodell

Supabase Auth verwaltet alle Nutzerdaten intern – keine eigenen DB-Tabellen für PROJ-1 nötig.

```
Supabase Auth User:
  - ID (UUID, auto-generiert)        → wird später als owner_id in mandanten gespeichert
  - E-Mail                           → Pflichtfeld, muss verifiziert sein
  - Passwort (gehasht, von Supabase) → mindestens 8 Zeichen
  - E-Mail bestätigt: Ja / Nein      → Login nur wenn Ja
  - Erstellt am, Letzter Login

Session:
  - JWT-Token (von Supabase verwaltet)
  - Gespeichert als Cookie (httpOnly) im Browser
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Auth-Anbieter | Supabase Auth | EU-Region Frankfurt, DSGVO-konform, E-Mail-Verifizierung eingebaut |
| Session-Speicher | Cookies (httpOnly) | Sicherer als localStorage gegen XSS; funktioniert mit Next.js Server Components |
| Routenschutz | Next.js Middleware | Läuft vor dem Seitenaufruf – kein Flackern, keine ungeschützten Seiten |
| Paket | @supabase/ssr | Offizielle Supabase-Bibliothek für Next.js App Router mit Cookie-Unterstützung |

### Ablauf: Route Protection

```
Nutzer ruft /dashboard auf
        ↓
middleware.ts prüft Session-Cookie
        ↓
   Eingeloggt?
   ↙         ↘
  Ja          Nein
  ↓            ↓
Seite      Redirect zu /login?redirect=/dashboard
laden           ↓
           Nach Login → Redirect zurück zu /dashboard
```

### Abhängigkeiten

| Package | Zweck |
|---|---|
| `@supabase/supabase-js` | Supabase Client |
| `@supabase/ssr` | Cookie-basierte Sessions für Next.js App Router |

## QA Test Results

**Tested:** 2026-03-17
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification (no running Supabase instance)

### Acceptance Criteria Status

#### AC-1: User can register with email + password (min. 8 characters)
- [x] Registration form exists at `/register` with email, password, and confirm password fields
- [x] Zod schema enforces minimum 8 characters on password (`z.string().min(8, ...)`)
- [x] Uses `supabase.auth.signUp()` correctly
- [x] Password confirmation field with mismatch validation via `.refine()`
- **PASS**

#### AC-2: After registration, a verification email is sent automatically
- [x] `signUp()` call includes `emailRedirectTo` option pointing to `/verify-email`
- [x] After successful signup, user sees confirmation message ("Bestaetigungslink per E-Mail geschickt")
- [ ] BUG: Registration success screen does not redirect to `/verify-email?email=...` page; instead shows inline confirmation. The verify-email page with resend functionality is never reached from the registration flow.
- **PARTIAL PASS** (see BUG-1)

#### AC-3: User cannot log in before email is verified
- [x] This is handled by Supabase Auth server-side configuration (email confirmation requirement)
- [ ] BUG: No explicit check in the login form code. If Supabase email confirmation is not enabled in the project settings, unverified users could log in. The code relies entirely on Supabase config, which is not enforced or verified in code.
- **PASS (conditional)** -- depends on Supabase project settings being configured correctly

#### AC-4: User can log in with verified credentials
- [x] Login form at `/login` uses `supabase.auth.signInWithPassword()`
- [x] On success, redirects to the `redirect` query param or `/dashboard`
- [x] Uses `router.refresh()` to update server-side session state
- **PASS**

#### AC-5: Invalid credentials show a clear error message (no user enumeration)
- [x] Login error message is generic: "E-Mail oder Passwort ist falsch. Bitte ueberpruefe deine Eingaben."
- [x] Does not reveal whether email exists or password is wrong
- **PASS**

#### AC-6: User can request a password reset link via email
- [x] Forgot-password page at `/forgot-password` exists
- [x] Uses `supabase.auth.resetPasswordForEmail()` with `redirectTo` to `/reset-password`
- [x] Always shows success message regardless of whether email exists (anti-enumeration)
- **PASS**

#### AC-7: Password reset link expires after 1 hour
- [x] Informational text states "Der Link ist 1 Stunde gueltig"
- [ ] BUG: The 1-hour expiry is a Supabase server-side setting, not enforced in code. If Supabase default differs, the displayed text could be misleading.
- **PASS (conditional)** -- depends on Supabase project settings

#### AC-8: Logged-in user can log out (session token invalidated)
- [x] Dashboard page has a server action calling `supabase.auth.signOut()` followed by redirect to `/login`
- [x] App sidebar has client-side `signOut()` that redirects to `/login` via `window.location.href`
- **PASS**

#### AC-9: Authenticated routes redirect unauthenticated users to login
- [x] Middleware checks `supabase.auth.getUser()` and redirects to `/login?redirect=<path>` if no user
- [x] App layout (`(app)/layout.tsx`) also checks auth as a second layer
- [x] API routes all check `supabase.auth.getUser()` and return 401
- **PASS**

#### AC-10: Login page redirects already authenticated users to dashboard
- [x] Middleware checks if authenticated user visits an auth route and redirects to `/dashboard`
- **PASS**

### Edge Cases Status

#### EC-1: Email already registered -- no enumeration
- [x] Register page catches "already registered" error and shows same success screen as normal registration
- **PASS**

#### EC-2: Expired verification link -- user can request a new one
- [x] Verify-email page has "Link erneut senden" button using `supabase.auth.resend()`
- [ ] BUG: The resend button only works if `email` query param is present in the URL. Since the registration flow does not redirect to `/verify-email?email=...`, the resend button will not appear for most users.
- **PARTIAL PASS** (see BUG-2)

#### EC-3: Expired password reset link -- clear error + new link
- [x] Reset-password page catches expired/invalid errors and shows "Dieser Link ist abgelaufen"
- [x] Shows a link to `/forgot-password` to request a new one
- **PASS**

#### EC-4: Multiple failed login attempts -- rate limiting
- [x] Relies on Supabase Auth built-in rate limiting (no custom implementation needed per spec)
- **PASS**

#### EC-5: Redirect back to original URL after login
- [x] Middleware sets `redirect` query param when redirecting to login
- [x] Login form reads `redirect` param and navigates there after success
- **PASS**

### Security Audit Results

#### Authentication & Session Management
- [x] Uses `@supabase/ssr` with cookie-based sessions (correct pattern for Next.js App Router)
- [x] Server client uses `cookies()` from `next/headers` (httpOnly by default via Supabase SSR)
- [x] Middleware runs on every request via broad matcher pattern
- [x] `supabase.auth.getUser()` used (validates JWT server-side) instead of `getSession()` (client-side only)

#### Authorization
- [x] All API routes check authentication before processing
- [x] RLS enabled on database tables with `mandant_id` scoping
- [x] Admin-only routes use `requireAdmin()` helper

#### Input Validation
- [x] All forms use Zod schema validation
- [x] Email validated as proper email format
- [x] Password minimum length enforced (8 chars)
- [ ] BUG: Login form password validation only checks `min(1)` (not empty), not `min(8)`. While this is functionally fine (Supabase rejects wrong passwords anyway), it is inconsistent with register form validation.

#### Missing Auth Callback Route (CRITICAL)
- [ ] **BUG: No `/auth/callback` or `/auth/confirm` route handler exists.** Supabase Auth email verification and password reset flows use PKCE. After the user clicks the email link, Supabase redirects to a callback URL with a `code` parameter that must be exchanged for a session via `exchangeCodeForSession()`. Without this route, **email verification links and password reset links will NOT work.** The user will land on `/verify-email` or `/reset-password` without an active session, and password reset will fail because `updateUser()` requires an authenticated session.

#### Security Headers
- [ ] BUG: `next.config.ts` is empty -- no security headers configured. The security rules require X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, and Strict-Transport-Security.

#### Open Redirect
- [ ] BUG: The login form reads the `redirect` query parameter and calls `router.push(redirect)`. There is no validation that the redirect URL is a relative path or belongs to the same origin. An attacker could craft `/login?redirect=https://evil.com` and after successful login, the user would be redirected to a malicious site.

#### Admin Client Security
- [x] `createAdminClient()` uses `SUPABASE_SERVICE_ROLE_KEY` (server-only env var, no `NEXT_PUBLIC_` prefix)
- [x] `autoRefreshToken: false` and `persistSession: false` set correctly

#### Env Vars
- [x] `.env.local.example` documents all required env vars with dummy values
- [x] `SUPABASE_SERVICE_ROLE_KEY` is not prefixed with `NEXT_PUBLIC_`

### Bugs Found

#### BUG-1: Missing Auth Callback Route Handler (CRITICAL - Blocker)
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Register a new account at `/register`
  2. Receive verification email from Supabase
  3. Click the verification link in the email
  4. Expected: User is redirected to app with verified session established via `exchangeCodeForSession()`
  5. Actual: No route handler exists at `/auth/callback` to exchange the PKCE code. The verification link will either 404 or land on a page without session exchange, meaning email verification and password reset flows are completely broken.
- **Impact:** Email verification and password reset -- two core acceptance criteria -- cannot function without this route.
- **Priority:** Fix before deployment (BLOCKER)

#### BUG-2: Verify-Email Page Unreachable from Registration Flow
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Register a new account at `/register`
  2. Registration succeeds and shows inline "E-Mail bestaetigen" card
  3. Expected: User is redirected to `/verify-email?email=user@example.com` where they can resend the verification link
  4. Actual: User sees inline message on register page with no resend capability. The `/verify-email` page exists but is never navigated to with the `email` param, so the resend button never appears.
- **Priority:** Fix before deployment

#### BUG-3: Open Redirect Vulnerability in Login
- **Severity:** High
- **Steps to Reproduce:**
  1. Craft URL: `/login?redirect=https://evil-site.com/phish`
  2. User logs in with valid credentials
  3. Expected: Redirect should only allow relative paths within the app
  4. Actual: `router.push(redirect)` will navigate to the external URL. While Next.js client-side router may mitigate full external redirects, the value is passed unchecked and could be exploited with protocol-relative URLs like `//evil.com`.
- **Priority:** Fix before deployment

#### BUG-4: Missing Security Headers in next.config.ts
- **Severity:** High
- **Steps to Reproduce:**
  1. Open browser DevTools > Network tab
  2. Load any page
  3. Expected: Response headers include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Strict-Transport-Security
  4. Actual: `next.config.ts` is empty -- no security headers configured. App is vulnerable to clickjacking (no X-Frame-Options), MIME-type sniffing, and missing HSTS.
- **Priority:** Fix before deployment

#### BUG-5: Root Page (/) Bypasses Auth for Authenticated Users
- **Severity:** Low
- **Steps to Reproduce:**
  1. Log in as authenticated user
  2. Navigate to `/`
  3. Expected: Redirect to `/dashboard`
  4. Actual: `page.tsx` does `redirect('/login')`, and then middleware redirects auth users from `/login` to `/dashboard`. This creates a double redirect (`/` -> `/login` -> `/dashboard`) which is inefficient. Also, the middleware excludes `/` from auth checks (`pathname !== '/'`), meaning the root page behavior is handled by the page itself, not the middleware -- inconsistent pattern.
- **Priority:** Nice to have

#### BUG-6: Login Password Validation Inconsistency
- **Severity:** Low
- **Steps to Reproduce:**
  1. Go to `/login`, enter email and a 1-character password
  2. Expected: Form should hint that password needs at least 8 characters (matching register validation)
  3. Actual: Login form only checks `min(1)` (non-empty), while register enforces `min(8)`. Functionally harmless since Supabase rejects wrong passwords, but inconsistent UX.
- **Priority:** Nice to have

### Cross-Browser Compatibility (Code Review)
- [x] No browser-specific APIs used (standard React + Next.js)
- [x] `window.location.origin` used for email redirect URLs (standard API)
- [x] `useSearchParams()` wrapped in `Suspense` boundaries (correct for Next.js 14)
- [x] shadcn/ui components used consistently (cross-browser tested by library)
- Note: Full manual browser testing (Chrome, Firefox, Safari) requires a running instance with Supabase configured.

### Responsive Design (Code Review)
- [x] Auth layout uses `min-h-screen flex items-center justify-center p-4` -- centers on all viewports
- [x] Form container constrained to `max-w-md` -- appropriate for mobile and desktop
- [x] App sidebar uses `SidebarTrigger` visible only on `md:hidden` -- proper mobile handling
- Note: Full responsive testing at 375px/768px/1440px requires a running instance.

### Summary
- **Acceptance Criteria:** 8/10 passed (AC-2 partial, AC-7 conditional)
- **Bugs Found:** 6 total (1 critical, 2 high, 1 medium, 2 low)
- **Security:** ISSUES FOUND (missing auth callback, open redirect, missing security headers)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (auth callback route) first as it is a BLOCKER -- email verification and password reset cannot work without it. Then fix BUG-3 (open redirect) and BUG-4 (security headers). BUG-2 should also be addressed before deployment.

## Deployment
_To be added by /deploy_
