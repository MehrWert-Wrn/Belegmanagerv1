# PROJ-24: Sichere Zugangsdaten-Übermittlung für E-Mail-Anbindung

## Status: In Review
**Created:** 2026-04-16
**Last Updated:** 2026-04-16

### Implementation Notes (Frontend)
- `src/components/onboarding/credential-form.tsx` – Provider-aware credential submission form (IMAP/Microsoft 365/Gmail), integrated into onboarding checklist Step 2
- `src/components/admin/credentials-tabelle.tsx` – Admin table with decrypted detail view, acknowledge + delete actions
- `src/app/admin/credentials/page.tsx` – Admin credentials management page
- Admin sidebar updated with "Zugangsdaten" nav item (KeyRound icon)
- Onboarding checklist refreshes progress after credential submission (auto-marks Step 2 done)
- States: loading, error, empty, submitted (pending), acknowledged (active)

### Implementation Notes (Backend)
- Migration: `supabase/migrations/20260416000000_mandant_credentials.sql`
- pgcrypto extension + `encrypt_credential_payload` / `decrypt_credential_payload` RPC functions (SECURITY DEFINER, revoked from PUBLIC)
- RLS: SELECT own rows, INSERT own (with duplicate check), no UPDATE/DELETE for mandants
- API Routes:
  - `POST /api/onboarding/credentials` – Zod-validated, encrypts via RPC, updates onboarding_progress, sends Resend notification
  - `GET /api/onboarding/credentials` – returns status only (no payload)
  - `GET /api/admin/credentials` – Super-Admin, decrypts all submissions
  - `PATCH /api/admin/credentials/[id]` – Super-Admin, sets acknowledged_at
  - `DELETE /api/admin/credentials/[id]` – Super-Admin, hard delete (only if acknowledged)
- Email notification via existing Resend integration (`sendCredentialNotificationEmail` in `src/lib/resend.ts`)
- New env var: `CREDENTIALS_ENCRYPTION_KEY` (documented in `.env.local.example`)

---

## Übersicht

Mandanten müssen ihre E-Mail-Zugangsdaten (Microsoft 365, Gmail oder IMAP) sicher an das Mehr.Wert-Team übermitteln können – direkt im Belegmanager, ohne WhatsApp/E-Mail mit Passwörtern. Die Daten werden AES-256-verschlüsselt gespeichert und nach erfolgter Einrichtung unwiederbringlich gelöscht.

---

## Dependencies

- Requires: PROJ-1 (Authentifizierung) – eingeloggter Mandant
- Requires: PROJ-2 (Mandant-Onboarding) – `mandant_id` vorhanden
- Requires: PROJ-21 (Onboarding-Checkliste) – Schritt 2 (`email_connection_done`) wird nach Absenden automatisch auf `true` gesetzt
- Requires: PROJ-19 (Admin Panel) – Admin-Ansicht für eingegangene Credentials

---

## User Stories

### Mandant

1. **Als Mandant** möchte ich meine E-Mail-Zugangsdaten direkt in Schritt 2 der Onboarding-Checkliste eingeben können, damit ich keine sensiblen Daten per WhatsApp oder E-Mail verschicken muss.

2. **Als Mandant** möchte ich meinen E-Mail-Anbieter (Microsoft 365 / Gmail / IMAP) auswählen können, damit ich nur die für mich relevanten Felder sehe.

3. **Als Mandant** möchte ich nach dem Absenden einen klaren Bestätigungsstatus sehen ("Zugangsdaten übermittelt – wir richten die Anbindung ein"), damit ich weiß, dass alles angekommen ist.

4. **Als Mandant** möchte ich darüber informiert werden, dass meine Zugangsdaten nach erfolgreicher Einrichtung gelöscht werden, damit ich mich datenschutzseitig sicher fühle.

5. **Als Mandant** möchte ich meine übermittelten Credentials nicht mehr einsehen können, damit die Daten serverseitig geschützt bleiben.

### Admin (Mehr.Wert Team)

6. **Als Super-Admin** möchte ich im Admin-Panel einen Badge sehen, wenn neue Zugangsdaten vorliegen, damit ich keine Submissions übersehe.

7. **Als Super-Admin** möchte ich die entschlüsselten Zugangsdaten strukturiert anzeigen können (Anbieter + Felder), damit ich die Anbindung effizient einrichten kann.

8. **Als Super-Admin** möchte ich nach der Einrichtung auf "Als eingerichtet markieren" klicken können, damit der Mandant sieht, dass seine Anbindung aktiv ist.

9. **Als Super-Admin** möchte ich die Credentials nach der Einrichtung endgültig löschen (hard delete), damit keine sensiblen Daten länger als nötig gespeichert bleiben.

---

## Acceptance Criteria

### Mandant-Formular (Schritt 2 Onboarding-Checkliste)

- [ ] Unterhalb der bestehenden Hilfe-Center-Buttons erscheint ein Formular zur Provider-Auswahl (Microsoft 365 / Gmail / IMAP)
- [ ] Nach Auswahl eines Providers werden nur die relevanten Felder angezeigt:
  - **IMAP:** Host, Port (default 993), SSL/TLS (Checkbox, default aktiv), E-Mail-Adresse, Passwort
  - **Microsoft 365:** Tenant ID, Client ID, Client Secret
  - **Gmail:** E-Mail-Adresse des Google-Kontos, Client ID, Client Secret
- [ ] Alle Pflichtfelder werden clientseitig validiert (kein leeres Submit)
- [ ] Passwort-Felder sind vom Typ `password` (nicht sichtbar)
- [ ] **Sicherheits-Badge prominent sichtbar** im Formular (vor dem Submit-Button): Lock-Icon + "AES-256-verschlüsselt · Nach Einrichtung gelöscht · DSGVO-konform" – teal-farbig, gut lesbar
- [ ] Nach Absenden: Schritt 2 (`email_connection_done`) in `onboarding_progress` wird automatisch auf `true` gesetzt
- [ ] Nach Absenden: Formular verschwindet, Status-Banner "Zugangsdaten übermittelt" wird angezeigt
- [ ] Status-Banner enthält: Checkmark-Icon + "Deine Zugangsdaten wurden sicher übermittelt. Wir richten deine E-Mail-Anbindung ein und löschen die Daten danach."
- [ ] Ist bereits eine Submission vorhanden (acknowledged_at IS NULL): Status anzeigen, kein erneutes Absenden möglich
- [ ] Ist acknowledged_at gesetzt: Grünes Banner "Deine E-Mail-Anbindung ist aktiv." anzeigen

### Datenspeicherung & Sicherheit

- [ ] Credentials werden ausschließlich serverseitig (API Route) entgegengenommen – niemals im Frontend verarbeitet
- [ ] Speicherung erfolgt AES-256-verschlüsselt via `pgcrypto` (`pgp_sym_encrypt`) mit einem Encryption Key aus der Serverumgebung (`CREDENTIALS_ENCRYPTION_KEY`)
- [ ] Der Encryption Key existiert nur als Server-seitiges Environment-Variable, nie im Frontend-Bundle
- [ ] Kein Klartext-Logging der Credential-Werte in Vercel Logs oder Supabase Logs
- [ ] RLS: Mandant kann nur eine eigene Row pro Provider lesen (nur `submitted_at` und `acknowledged_at`, nicht `payload_encrypted`)
- [ ] `payload_encrypted` ist über RLS für Mandanten nicht lesbar – nur über Service Role Key (serverseitig)

### E-Mail-Benachrichtigung

- [ ] Nach erfolgreichem Absenden wird automatisch eine Benachrichtigungs-E-Mail an `office@online-mehrwert.at` gesendet
- [ ] Betreff: `[Belegmanager] Neue Zugangsdaten von [Firmenname]`
- [ ] Inhalt: Firmenname des Mandanten, gewählter Provider (IMAP / Microsoft 365 / Gmail), Zeitstempel der Übermittlung
- [ ] **Kein Credential-Inhalt** in der E-Mail – nur die Benachrichtigung dass neue Daten vorliegen
- [ ] E-Mail-Versand über Supabase SMTP (bestehende Konfiguration) oder Resend API
- [ ] Bei E-Mail-Fehler: Submission trotzdem erfolgreich (kein Rollback) – Fehler wird geloggt

### Admin-Panel

- [ ] Admin-Übersichtsseite zeigt Badge "X neue Zugangsdaten" wenn `acknowledged_at IS NULL`
- [ ] Detailansicht: Provider, Mandant, Submission-Datum, entschlüsselte Felder strukturiert angezeigt
- [ ] Button "Als eingerichtet markieren" → setzt `acknowledged_at = now()`
- [ ] Button "Credentials löschen" → hard delete der Row (kein soft delete)
- [ ] Nach hard delete: keine Möglichkeit zur Wiederherstellung
- [ ] Löschen nur möglich wenn `acknowledged_at IS NOT NULL` (Einrichtung muss zuerst bestätigt werden)

---

## Datenmodell

### Tabelle: `mandant_credentials`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | `uuid` (PK) | Auto-generiert |
| `mandant_id` | `uuid` (FK → mandanten) | ON DELETE CASCADE |
| `provider` | `text` (CHECK: imap/microsoft365/gmail) | E-Mail-Anbieter |
| `payload_encrypted` | `text` | AES-256-verschlüsselter JSON-Blob der Credentials |
| `submitted_at` | `timestamptz` | Zeitpunkt des Absendens |
| `acknowledged_at` | `timestamptz` (nullable) | Zeitpunkt der Bestätigung durch Admin |
| *(kein deleted_at)* | — | Hard delete, kein Soft delete — keine Spalte nötig |

**UNIQUE Constraint:** `(mandant_id, provider)` – pro Mandant und Provider nur eine aktive Submission

**RLS:**
- Mandant: `SELECT` nur eigene Rows, aber `payload_encrypted` nicht lesbar (über Column-Level Security oder separaten View)
- Mandant: `INSERT` eigene Row (nur wenn keine aktive Submission existiert)
- Admin (Service Role): volles Lesen/Schreiben/Löschen

---

## API-Routen

| Route | Methode | Wer | Beschreibung |
|-------|---------|-----|--------------|
| `/api/onboarding/credentials` | `POST` | Mandant | Credentials verschlüsselt einreichen |
| `/api/onboarding/credentials` | `GET` | Mandant | Status abrufen (submitted_at, acknowledged_at) – kein payload |
| `/api/admin/credentials` | `GET` | Super-Admin | Alle offenen Submissions (entschlüsselt) |
| `/api/admin/credentials/[id]` | `PATCH` | Super-Admin | Als eingerichtet markieren |
| `/api/admin/credentials/[id]` | `DELETE` | Super-Admin | Hard delete |

---

## Edge Cases

1. **Mandant sendet mehrfach ab:** UNIQUE Constraint auf `(mandant_id, provider)` → API gibt Fehler zurück, UI zeigt bestehenden Status
2. **Admin löscht Credentials bevor er sie eingerichtet hat:** Nur möglich wenn `acknowledged_at IS NOT NULL` (Absicherung im Backend)
3. **Encryption Key rotiert:** Bestehende Submissions können nicht mehr entschlüsselt werden → Admin-Panel zeigt Warnung, Mandant wird gebeten, erneut einzureichen
4. **Mandant wechselt den Provider:** Neue Submission für anderen Provider möglich (separater Record), alter bleibt bis Löschung
5. **Mandant submitted und verlässt dann das Unternehmen:** Daten bleiben bis Admin-Einrichtung + Löschung, dann weg (DSGVO-konform)
6. **Network-Fehler beim Submit:** Optimistic UI rückgängig machen, Fehlermeldung anzeigen, Felder bleiben ausgefüllt
7. **Brute-Force auf Admin-Credentials-Ansicht:** Rate-Limiting auf Admin-API-Routes, nur Super-Admin-Rolle (nicht normale Admin-Rolle)
8. **Payload zu groß:** Maximale Feldlängen validieren (Host max 253 Zeichen, Passwörter max 500 Zeichen)

---

## DSGVO & Sicherheitshinweise

- Speicherung ausschließlich in EU-Region (Supabase Frankfurt)
- Verschlüsselung: AES-256 via pgcrypto, Key liegt nur server-seitig
- Löschpflicht: Admin muss Credentials löschen nachdem Anbindung eingerichtet ist (durch UI enforced)
- Mandant wird explizit informiert über Zweck der Datenspeicherung und Löschung
- Audit-Log: `submitted_at` und `acknowledged_at` bleiben nach Löschung als anonymisierte Timestamps erhalten (optional, für Compliance)

---

## UI-Skizze: Schritt 2 Onboarding

```
Schritt 2: E-Mail-Postfach anbinden
─────────────────────────────────────────────────
[Microsoft 365] [Gmail] [IMAP]  ← Hilfe-Artikel

┌─ Zugangsdaten direkt übermitteln ──────────────┐
│  Anbieter: [Microsoft 365 ▼]                   │
│                                                │
│  Tenant ID:    [___________________________]   │
│  Client ID:    [___________________________]   │
│  Client Secret:[●●●●●●●●●●●●●●●●●●●●●●●●●]   │
│                                                │
│  🔒 Verschlüsselt übertragen, nach Einrichtung │
│     unwiederbringlich gelöscht.                │
│                                                │
│                   [Zugangsdaten einreichen →]  │
└────────────────────────────────────────────────┘

--- NACH ABSENDEN ---

✅ Zugangsdaten übermittelt
   Wir richten deine Anbindung ein.
   Du erhältst eine Benachrichtigung, sobald sie aktiv ist.

[Als erledigt markieren ✓]
```

---

## QA Test Results

### Round 2 (2026-04-16) -- Code Review + Static Analysis

**Tested:** 2026-04-16
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI) -- Code Review + Static Analysis (Round 2)

#### Acceptance Criteria Status

##### AC-1: Mandant-Formular (Schritt 2 Onboarding-Checkliste)

- [x] PASS: Formular zur Provider-Auswahl (Microsoft 365 / Gmail / IMAP) vorhanden in `credential-form.tsx`, integriert in onboarding-checkliste.tsx Schritt 2
- [x] PASS: Nach Auswahl eines Providers werden nur die relevanten Felder angezeigt (IMAP: Host, Port, SSL, E-Mail, Passwort; MS365: Tenant ID, Client ID, Client Secret; Gmail: E-Mail, Client ID, Client Secret) -- conditional rendering per provider value
- [x] PASS: Alle Pflichtfelder werden clientseitig validiert (required-Attribute + JS-Check vor Submit, z.B. `if (!imapHost || !imapEmail || !imapPassword)`)
- [x] PASS: Passwort-Felder sind vom Typ `password` (IMAP Passwort, MS365 Client Secret, Gmail Client Secret) -- verified `type="password"` on all 3
- [x] PASS: Sicherheits-Badge sichtbar im Formular: Lock-Icon + "AES-256-verschluesselt / Nach Einrichtung geloescht / DSGVO-konform" in teal-Farbe (border-teal-200 bg-teal-50/60 text-teal-800)
- [x] PASS: Nach Absenden: `email_connection_done` in `onboarding_progress` wird auf `true` gesetzt (via admin client in POST route, line 122-126)
- [x] PASS: Nach Absenden: Status-Banner "Zugangsdaten uebermittelt" wird angezeigt (via fetchStatus refresh + onSubmitted callback)
- [x] PASS: Status-Banner enthaelt CheckCircle2-Icon + korrekte Nachricht ("Deine Zugangsdaten ... wurden sicher uebermittelt. Wir richten deine E-Mail-Anbindung ein und loeschen die Daten danach.")
- [x] PASS: Ist bereits eine Submission vorhanden (acknowledged_at IS NULL): Status anzeigen, kein erneutes Absenden moeglich (409 Conflict from API + status banner in UI)
- [x] PASS: Ist acknowledged_at gesetzt: Gruenes Banner "Deine E-Mail-Anbindung ist aktiv." angezeigt (allAcknowledged branch, line 173-188)

##### AC-2: Datenspeicherung und Sicherheit

- [x] PASS: Credentials werden ausschliesslich serverseitig (API Route) entgegengenommen -- POST handler in route.ts, no encryption in frontend
- [x] PASS: Speicherung erfolgt AES-256-verschluesselt via pgcrypto (pgp_sym_encrypt) mit CREDENTIALS_ENCRYPTION_KEY -- RPC call on line 96-99
- [x] PASS: Encryption Key existiert nur als Server-seitiges Environment-Variable, nicht im Frontend-Bundle (kein NEXT_PUBLIC_ prefix) -- documented in .env.local.example
- [ ] FAIL: payload_encrypted ueber RLS fuer Mandanten nicht lesbar -- NICHT ERFUELLT (siehe BUG-1)
- [ ] FAIL: Kein Klartext-Logging-Schutz verifizierbar (siehe BUG-2)

##### AC-3: E-Mail-Benachrichtigung

- [x] PASS: Nach erfolgreichem Absenden wird automatisch eine Benachrichtigungs-E-Mail an office@online-mehrwert.at gesendet (sendCredentialNotificationEmail in resend.ts)
- [x] PASS: Betreff: "[Belegmanager] Neue Zugangsdaten von [Firmenname]" (line 140 in resend.ts)
- [x] PASS: Inhalt: Firmenname, Provider, Zeitstempel -- kein Credential-Inhalt -- escapeHtml() applied to all dynamic values
- [x] PASS: E-Mail-Versand ueber Resend API (getResend() call)
- [x] PASS: Bei E-Mail-Fehler: Submission trotzdem erfolgreich (fire-and-forget with .catch(), lines 140-145 in POST route)

##### AC-4: Admin-Panel

- [x] PASS: Admin-Sidebar hat "Zugangsdaten" Nav-Item mit KeyRound-Icon (admin-sidebar.tsx line 43)
- [x] PASS: Admin-Uebersichtsseite zeigt Badge "X neue Zugangsdaten warten auf Einrichtung" wenn pending vorhanden (credentials-tabelle.tsx line 188-194)
- [x] PASS: Detailansicht: Provider, Mandant, Submission-Datum, entschluesselte Felder strukturiert angezeigt (CredentialDetailDialog component)
- [x] PASS: Button "Als eingerichtet markieren" setzt acknowledged_at = now() (PATCH route line 38-42)
- [x] PASS: Button "Credentials loeschen" fuehrt hard delete durch (DELETE route line 88-91)
- [x] PASS: Nach hard delete: keine Moeglichkeit zur Wiederherstellung (no soft delete, no backup)
- [x] PASS: Loeschen nur moeglich wenn acknowledged_at IS NOT NULL (Backend check line 80 + UI conditional line 272)

##### Edge Cases Status

- [x] EC-1 PASS: Mandant sendet mehrfach ab -- UNIQUE + 409
- [x] EC-2 PASS: Admin loescht vor Einrichtung -- acknowledged_at check
- [x] EC-3 PASS: Mandant wechselt Provider -- separate record
- [x] EC-4 PASS: Network-Fehler beim Submit -- try/catch, fields preserved
- [x] EC-5 PASS: Payload zu gross -- maxLength + Zod max()
- [ ] EC-6 FAIL: Brute-Force auf Admin-Credentials-Ansicht -- kein Rate-Limiting (BUG-3)
- [x] EC-7 PASS: Encryption Key rotiert -- graceful error display

---

### Round 3 (2026-04-16) -- Verification + Deep Security Audit

**Tested:** 2026-04-16
**Tester:** QA Engineer (AI) -- Deep Code Review + Security Pen-Test (Round 3)

#### Bug Status Check (from Round 2)

All 7 bugs from Round 2 remain UNFIXED. No code changes detected since Round 2.

| Bug | Severity | Status | Notes |
|-----|----------|--------|-------|
| BUG-1 | HIGH | OPEN | No column-level REVOKE added, no view created |
| BUG-2 | MEDIUM | OPEN | Still passing cleartext to pgcrypto RPC |
| BUG-3 | MEDIUM | OPEN | No checkRateLimit() calls added to any credential endpoint |
| BUG-4 | LOW | OPEN | No UUID validation on [id] param |
| BUG-5 | HIGH | OPEN | No isImpersonating check in POST route |
| BUG-6 | HIGH | OPEN | getEffectiveContext() still does not compare admin_id to current session |
| BUG-7 | LOW | OPEN | Spec still lists deleted_at column |

#### Additional Findings (Round 3)

##### BUG-8 (NEW): Admin GET /api/admin/credentials leaks Supabase error messages to client
- **Severity:** LOW
- **Location:** `src/app/api/admin/credentials/route.ts` line 30
- **Steps to Reproduce:**
  1. Trigger a database error on the admin GET endpoint (e.g., table does not exist, connection timeout)
  2. Expected: Generic error message returned to client
  3. Actual: `error.message` from Supabase is returned directly: `return NextResponse.json({ error: error.message }, { status: 500 })`
- **Root Cause:** Raw Supabase error messages may contain internal table names, column names, or constraint names that reveal database schema details to the admin client.
- **Note:** Risk is mitigated by the fact that only verified admins can access this endpoint, but defense-in-depth suggests generic error messages. The same pattern exists in the mandant GET route (line 171 in onboarding/credentials/route.ts).
- **Priority:** Nice to have

##### BUG-9 (NEW): Admin decryption runs N+1 sequential RPC calls without pagination
- **Severity:** MEDIUM
- **Location:** `src/app/api/admin/credentials/route.ts` lines 49-84
- **Steps to Reproduce:**
  1. 50+ mandants submit credentials (each with 1-3 providers)
  2. Admin opens /admin/credentials page
  3. Expected: Reasonable response time
  4. Actual: Each credential is decrypted with a separate `admin.rpc('decrypt_credential_payload')` call via `Promise.all()`. With 100 rows, this fires 100 concurrent RPC calls against the database.
- **Root Cause:** Decryption is done row-by-row in a `Promise.all(credentials.map(...))` loop. No pagination, no batching. The `.limit(100)` is a hard ceiling, but 100 concurrent decrypt calls is significant load.
- **Impact:** Combined with BUG-3 (no rate limiting), an attacker with admin credentials could trigger massive DB load by repeatedly hitting this endpoint.
- **Fix:** Add server-side pagination (page/limit query params) and consider a single SQL query that decrypts all rows in one call: `SELECT id, pgp_sym_decrypt(...) FROM mandant_credentials`
- **Priority:** Should fix before production scale

#### Acceptance Criteria Re-verification

All 18 previously passing acceptance criteria re-confirmed via code review. No regressions.

The 2 previously failing criteria (BUG-1, BUG-2) remain failed.

#### Security Audit Deepening (Round 3)

- [x] PASS: POST route correctly uses `createAdminClient()` (Service Role) for INSERT, bypassing RLS -- mandant identity verified via getEffectiveContext() before insert
- [x] PASS: GET route (mandant) correctly uses `createClient()` (user session) with RLS -- only own rows returned
- [x] PASS: Zod discriminatedUnion rejects unknown providers (e.g., `provider: "oauth2"` returns 400)
- [x] PASS: IMAP port validated as integer 1-65535 via Zod (rejects port 0, port 99999, port "abc")
- [x] PASS: Email fields validated as proper email format via z.string().email()
- [x] PASS: Admin PATCH route prevents double-acknowledge (returns 409 if already acknowledged)
- [x] PASS: Dialog in admin credentials table resets showSecrets on close (onOpenChange handler)
- [x] PASS: Impersonation cookie is HttpOnly + Secure (in production) + SameSite=strict -- cannot be read by client-side JS
- [ ] NOTE: However BUG-6 remains -- the cookie value is not cryptographically signed, so it can be forged by any authenticated server-side code path or manipulated via browser dev tools

#### Cross-Browser / Responsive Re-check (Code Review)

- [x] PASS: Form uses standard HTML input types (text, email, password, number, checkbox) -- universal browser support
- [x] PASS: `sm:grid-cols-2` responsive grid for IMAP host/port fields (stacks on mobile)
- [x] PASS: All interactive elements use shadcn/ui primitives (no custom implementations)
- [x] PASS: No CSS custom properties, no `backdrop-filter`, no `gap` on flexbox (all have wide support)
- [x] PASS: No `fetch()` usage with unsupported options (standard JSON POST/GET only)

### Summary (Round 3 -- Cumulative)

- **Acceptance Criteria:** 18/20 passed (2 failed -- BUG-1 payload exposure, BUG-2 log exposure)
- **Edge Cases:** 6/7 passed (1 failed -- BUG-3 no rate limiting)
- **Bugs Found:** 9 total
  - 3 High: BUG-1 (payload exposure), BUG-5 (impersonation bypass), BUG-6 (cookie forgery)
  - 3 Medium: BUG-2 (log exposure), BUG-3 (no rate limiting), BUG-9 (N+1 decryption)
  - 3 Low: BUG-4 (UUID validation), BUG-7 (spec inconsistency), BUG-8 (error message leak)
- **Security Audit:** 3 HIGH security issues remain unfixed
- **Production Ready:** NO

#### Blocking bugs (MUST FIX before deployment):
1. **BUG-1 (High)** -- REVOKE SELECT on payload_encrypted for authenticated role, or create a restricted view
2. **BUG-5 (High)** -- Add `if (ctx.isImpersonating) return 403` to POST /api/onboarding/credentials
3. **BUG-6 (High)** -- Upstream PROJ-19 fix: verify `payload.admin_id === currentUser.id` in getEffectiveContext()
4. **BUG-3 (Medium)** -- Add checkRateLimit() to all 4 credential endpoints (pattern already exists in codebase)

#### Should fix before production scale:
5. **BUG-9 (Medium)** -- Pagination + batch decryption for admin GET endpoint
6. **BUG-2 (Medium)** -- Move encryption to Node.js layer (crypto.createCipheriv) to avoid cleartext in SQL logs

#### Deferrable:
7. **BUG-4 (Low)** -- UUID validation on [id] route param
8. **BUG-7 (Low)** -- Spec cleanup: remove deleted_at references
9. **BUG-8 (Low)** -- Generic error messages on admin endpoints
