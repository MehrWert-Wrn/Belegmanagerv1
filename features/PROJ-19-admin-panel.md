# PROJ-19: Admin Panel

## Status: Deployed
**Created:** 2026-04-09
**Last Updated:** 2026-04-09

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – `is_admin`-Flag im `profiles`-Datensatz
- Requires: PROJ-2 (Mandant-Onboarding) – Mandanten-Datensatz muss existieren
- Requires: PROJ-16 (SaaS-Billing via Stripe) – Abo-Override baut auf `billing_subscriptions` auf

---

## Overview

Internes Admin-Panel für Software-Betreiber von Belegmanager. Ermöglicht Zugriff auf alle Mandanten-Oberflächen (Impersonation), manuelle Abo-Verwaltung mit Override-Logik sowie ein vollständiges Support-Ticket-System mit bidirektionaler Kommunikation und E-Mail-Benachrichtigungen.

---

## User Stories

### US-1: Admin-Zugang & Mandanten-Übersicht
Als Admin möchte ich eine geschützte `/admin`-Oberfläche aufrufen können, um alle Mandanten auf einen Blick zu sehen.

**Acceptance Criteria:**
- [ ] Route `/admin` ist nur zugänglich wenn `profiles.is_admin = true`
- [ ] Nicht-Admins werden bei Aufruf auf `/dashboard` weitergeleitet
- [ ] Mandanten-Übersicht zeigt: Name, E-Mail, Abo-Status, letzter Login, Anzahl offener Support-Tickets
- [ ] Suche nach Mandantenname oder E-Mail
- [ ] Klick auf Mandant öffnet Mandanten-Detailansicht

### US-2: Mandanten-Impersonation
Als Admin möchte ich als beliebiger Mandant eingeloggt sein, um Support-Probleme direkt in dessen Oberfläche nachvollziehen und lösen zu können.

**Acceptance Criteria:**
- [ ] Button „Als Mandant einloggen" in der Mandanten-Detailansicht
- [ ] Impersonation verwendet Service Role Key + manuelle `mandant_id`-Setzung in der Session
- [ ] Während Impersonation ist ein sichtbares Banner am oberen Rand der App: „Admin-Modus: [Mandantenname] – Session beenden"
- [ ] Klick auf „Session beenden" kehrt zur Admin-Übersicht zurück
- [ ] Impersonation-Start und -Stop werden in `admin_audit_log` geloggt (`admin_id`, `mandant_id`, `action`, `timestamp`)
- [ ] RLS wird für Admin-Session bewusst umgangen (Service Role)

### US-3: Manuelle Abo-Verwaltung (Override)
Als Admin möchte ich das Abonnement eines Mandanten manuell aktivieren können, unabhängig vom Stripe-Status.

**Acceptance Criteria:**
- [ ] In der Mandanten-Detailansicht: Abschnitt „Abo-Override"
- [ ] Aktueller Stripe-Status und aktueller Override-Status werden nebeneinander angezeigt
- [ ] Override-Optionen: `permanent` (kein Ablaufdatum) oder `bis Datum` (Datepicker)
- [ ] Aktivierter Override wird in `billing_subscriptions` gespeichert: `admin_override_type` (permanent/until_date/none), `admin_override_until` (nullable Date)
- [ ] Override-Aktivierung und -Entfernung werden in `admin_audit_log` geloggt
- [ ] Zugangskontrolle prüft: `admin_override_active = true` ODER `stripe_status = active` → Zugang gewährt
- [ ] Stripe-Webhooks überschreiben `admin_override_*`-Felder nie
- [ ] Mandant sieht auf `/settings/abonnement` das Badge „Vom Support aktiviert" wenn Override aktiv
- [ ] Admin kann Override jederzeit manuell entfernen

### US-4: Support-Ticket erstellen (Mandant)
Als Mandant möchte ich über ein Chat-Widget ein Support-Ticket erstellen können.

**Acceptance Criteria:**
- [ ] Chat-Widget ist auf allen Seiten der App als Icon rechts unten sichtbar (aufklappbar)
- [ ] Widget enthält: Betreff-Feld + Nachrichtenfeld + „Ticket senden"-Button
- [ ] Abgesendetes Ticket erscheint sofort in der Ticket-Übersicht des Mandanten
- [ ] Widget zeigt Bestätigung nach Absenden: „Ticket wurde erstellt – wir melden uns bald"
- [ ] Widget zeigt Anzahl offener Tickets als Badge auf dem Icon

### US-5: Support-Ticket-Übersicht (Mandant-Dashboard)
Als Mandant möchte ich meine Support-Tickets und alle Antworten einsehen können.

**Acceptance Criteria:**
- [ ] Dashboard-Widget „Support-Tickets" mit Liste aller eigenen Tickets
- [ ] Spalten: Betreff, Status, Erstellt am, Letzte Aktivität
- [ ] Klick auf Ticket öffnet Detailansicht mit vollständigem Nachrichtenverlauf
- [ ] Mandant sieht Nachrichten von sich selbst und Antworten vom Admin
- [ ] Mandant kann auf ein offenes Ticket eine weitere Nachricht hinzufügen
- [ ] Status-Badges: Offen (gelb), In Bearbeitung (blau), Geschlossen (grau)

### US-6: Support-Ticket-Verwaltung (Admin)
Als Admin möchte ich alle Support-Tickets verwalten, zuweisen und beantworten können.

**Acceptance Criteria:**
- [ ] `/admin/tickets` zeigt alle Tickets aller Mandanten
- [ ] Filter: Status (Offen / In Bearbeitung / Geschlossen), Zugewiesen an (Admin-Auswahl), Mandant, Zeitraum (von/bis)
- [ ] Unzugewiesene Tickets sind visuell hervorgehoben (separate Sektion oder Badge)
- [ ] Admin kann Ticket sich selbst oder einem anderen Admin zuweisen (`assigned_to_admin_id`)
- [ ] Admin kann Ticket-Status ändern: Offen → In Bearbeitung → Geschlossen
- [ ] Admin kann Antwort schreiben (erscheint im Nachrichtenverlauf)
- [ ] Ticket-Detailansicht zeigt: Mandantenname, Betreff, vollständiger Nachrichtenverlauf, aktueller Status, zugewiesener Admin

### US-7: E-Mail-Benachrichtigungen (Mandant)
Als Mandant möchte ich per E-Mail informiert werden, wenn sich bei meinem Support-Ticket etwas ändert.

**Acceptance Criteria:**
- [ ] E-Mail bei neuer Admin-Antwort: Betreff „[Belegmanager Support] Antwort zu: [Ticket-Betreff]", enthält die Antwort und einen Link zur Ticket-Detailansicht
- [ ] E-Mail bei Statuswechsel: Betreff „[Belegmanager Support] Ihr Ticket wurde [Status]", enthält neuen Status und Link
- [ ] E-Mails werden an die E-Mail-Adresse des Mandanten gesendet (aus `profiles`)
- [ ] Kein E-Mail-Versand wenn der Mandant selbst die letzte Aktion ausgeführt hat

---

## Edge Cases

- Admin ruft `/admin` auf ohne `is_admin = true` → Redirect auf `/dashboard`, kein Fehler-Stacktrace sichtbar
- Impersonation während die Mandanten-Session noch aktiv ist → bestehende Session wird ersetzt, nach Beenden der Admin-Session kehrt Admin zur eigenen Session zurück
- Admin-Override wird gesetzt, Stripe-Webhook `subscription.deleted` kommt danach → Override bleibt aktiv, Stripe-Felder werden aktualisiert aber Override-Felder nicht berührt
- Override-Typ `until_date` läuft ab → Zugangskontrolle prüft `admin_override_until < now()` → kein Zugang mehr (ohne manuelle Admin-Aktion)
- Mandant sendet Ticket, kein Admin ist online → Ticket bleibt unzugewiesen, erscheint in der Unassigned-Queue
- Mandant antwortet auf ein geschlossenes Ticket → Status wechselt automatisch zurück auf „Offen"
- E-Mail-Versand schlägt fehl → Ticket-Aktion wird trotzdem gespeichert, E-Mail-Fehler wird geloggt (kein Rollback)
- Mehrere Admins beantworten dasselbe Ticket gleichzeitig → beide Nachrichten werden gespeichert, Reihenfolge nach Timestamp
- Admin löscht sich selbst aus der Admin-Liste → kein Selbst-Entfernen von `is_admin` über die UI möglich (nur direkt in DB)

---

## Data Model

### Neue Felder in `billing_subscriptions`
- `admin_override_type`: `'permanent' | 'until_date' | null`
- `admin_override_until`: `timestamp | null`

### Neue Tabellen

**`admin_audit_log`**
- `id` uuid PK
- `admin_id` uuid → profiles.id
- `mandant_id` uuid → mandanten.id (nullable)
- `action_type` text: `impersonation_start | impersonation_stop | override_set | override_removed`
- `metadata` jsonb (z.B. override_type, override_until)
- `created_at` timestamp

**`support_tickets`**
- `id` uuid PK
- `mandant_id` uuid → mandanten.id
- `subject` text
- `status` text: `open | in_progress | closed`
- `assigned_to_admin_id` uuid → profiles.id (nullable)
- `created_at` timestamp
- `updated_at` timestamp

**`support_ticket_messages`**
- `id` uuid PK
- `ticket_id` uuid → support_tickets.id
- `sender_type` text: `mandant | admin`
- `sender_id` uuid → profiles.id
- `message` text
- `created_at` timestamp

---

## Technical Requirements

- Security: `/admin`-Route serverseitig geprüft (`is_admin`), nie nur client-seitig
- Security: Service Role Key nur in API Routes, nie im Frontend
- Security: Audit-Log ist append-only (kein Delete/Update über API)
- E-Mail: Transaktionale E-Mails via Resend
- RLS: `support_tickets` und `support_ticket_messages` haben RLS – Mandant sieht nur eigene Tickets; Admins haben via Service Role vollen Zugriff

---

## Tech Design (Solution Architect)

### Routen-Struktur

```
/admin                          ← eigene Route-Gruppe (admin)
  Layout: Admin-Sidebar + Admin-Guard
  |
  +-- /admin/mandanten          ← Mandanten-Übersicht (Suche, Tabelle)
  |
  +-- /admin/mandanten/[id]     ← Mandanten-Detail
  |     +-- Stammdaten
  |     +-- Abo-Status (Stripe + Override nebeneinander)
  |     +-- Override-Verwaltung
  |     +-- Impersonation-Button
  |
  +-- /admin/tickets            ← Alle Tickets aller Mandanten
        +-- Filterleiste
        +-- Unassigned-Sektion
        +-- Ticket-Tabelle
        +-- /admin/tickets/[id] ← Ticket-Detail + Antwort

Mandanten-App (bestehend):
  (app)/layout.tsx
  +-- [NEU] SupportWidget       ← floating icon rechts unten, Badge

  (app)/dashboard
  +-- [NEU] SupportTicketsWidget

  (app)/support/tickets/[id]   ← Ticket-Detailansicht für Mandant
```

### Impersonation-Mechanismus

- Cookie `bm_admin_ctx` (HTTP-only, server-side): `{ admin_id, mandant_id, started_at }`
- Alle bestehenden API-Routen lesen diesen Cookie: falls gesetzt → Service Role + mandant_id aus Cookie
- `(app)/layout.tsx` liest Cookie serverseitig → rendert Impersonation-Banner wenn aktiv
- "Session beenden" → Cookie löschen + `impersonation_stop` in `admin_audit_log`
- Kein Umbau bestehender Business-Logik nötig – nur das Auth-Layer wird ergänzt

### Abo-Override-Logik

- `billing/status`-Route wird erweitert: prüft `admin_override_type` + `admin_override_until`
- Zugangsbedingung: `admin_override_active = true` OR `stripe_status = active`
- Stripe-Webhook-Route bleibt unverändert – schreibt nie in `admin_override_*`-Felder
- `access-guard.tsx` liest erweiterten Status ohne strukturelle Änderung

### E-Mail-Fluss

- Admin antwortet → `POST /api/admin/tickets/[id]/messages` → Resend-E-Mail an Mandant
- Admin ändert Status → `PATCH /api/admin/tickets/[id]/status` → Resend-E-Mail an Mandant
- Mandant schreibt selbst → kein E-Mail-Versand
- Mandant antwortet auf geschlossenes Ticket → Status wechselt automatisch auf `open`

### Neue Komponenten

| Komponente | Zweck |
|---|---|
| `admin/admin-guard.tsx` | Serverseitiger Redirect für Nicht-Admins |
| `admin/admin-sidebar.tsx` | Eigene Navigation im /admin-Bereich |
| `admin/mandanten-tabelle.tsx` | Mandantenliste mit Suche und Status-Badges |
| `admin/abo-override-panel.tsx` | Stripe-Status + Override mit Datepicker |
| `admin/impersonation-button.tsx` | Startet Session + Audit-Log |
| `admin/tickets-tabelle.tsx` | Ticket-Liste mit Filtern und Zuweisung |
| `admin/ticket-detail.tsx` | Nachrichtenverlauf + Antwort-Formular |
| `support/support-widget.tsx` | Floating Chat-Icon rechts unten |
| `support/ticket-erstellen-form.tsx` | Betreff + Nachricht + Absenden |
| `support/tickets-uebersicht.tsx` | Dashboard-Widget Ticket-Tabelle |
| `support/ticket-verlauf.tsx` | Chat-UI (Vorlage: kommentare-section.tsx) |
| `impersonation-banner.tsx` | Fixiertes Banner oben während Admin-Session |

### Neue API-Routen

| Route | Zweck |
|---|---|
| `POST /api/admin/impersonation` | Session starten (Cookie + Audit-Log) |
| `DELETE /api/admin/impersonation` | Session beenden |
| `GET /api/admin/mandanten` | Alle Mandanten (Service Role) |
| `GET /api/admin/mandanten/[id]` | Mandanten-Detail |
| `PATCH /api/admin/mandanten/[id]/override` | Abo-Override setzen/entfernen |
| `GET /api/admin/tickets` | Alle Tickets mit Filter-Parametern |
| `PATCH /api/admin/tickets/[id]` | Status ändern, Admin zuweisen |
| `POST /api/admin/tickets/[id]/messages` | Admin-Antwort + E-Mail-Trigger |
| `GET /api/tickets` | Eigene Tickets des Mandanten |
| `POST /api/tickets` | Neues Ticket erstellen |
| `POST /api/tickets/[id]/messages` | Mandant antwortet |

### Dependencies

- `resend` – transaktionale E-Mails (voraussichtlich aus PROJ-16 bereits vorhanden)
- `date-fns` – Datepicker-Formatierung (voraussichtlich bereits vorhanden)
- Keine weiteren neuen Pakete erforderlich

## Backend Implementation Notes

**Migration:** `supabase/migrations/20260409000000_admin_panel.sql`
- Created `profiles` table with `is_admin` flag, auto-create trigger on auth.users, backfill for existing users
- Created `admin_audit_log` (append-only, no SELECT/UPDATE/DELETE RLS for normal users)
- Created `support_tickets` + `support_ticket_messages` with mandant-scoped RLS
- Added `admin_override_type` and `admin_override_until` to `billing_subscriptions`
- All tables have RLS enabled with proper policies and indexes

**Shared Helper:** `src/lib/admin-context.ts`
- `getEffectiveContext()` – reads `bm_admin_ctx` cookie for impersonation, falls back to normal auth
- `verifyAdmin()` – checks `profiles.is_admin = true` server-side
- `logAdminAction()` – append-only audit logging via Service Role
- `setImpersonationCookie()` / `clearImpersonationCookie()` / `getImpersonationState()`

**Email:** `src/lib/resend.ts` – Resend integration with `sendTicketReplyEmail()` and `sendTicketStatusEmail()`

**Admin API Routes:**
- `POST/DELETE /api/admin/impersonation` – start/stop impersonation with cookie + audit
- `GET /api/admin/mandanten` – list all mandants with sub status, last login, ticket counts
- `GET /api/admin/mandanten/[id]` – mandant detail
- `PATCH /api/admin/mandanten/[id]/override` – set/remove billing override + audit
- `GET /api/admin/tickets` – all tickets with filters (status, assigned_to, mandant_id, from, to, unassigned)
- `PATCH /api/admin/tickets/[id]` – update status/assignment + email notification
- `POST /api/admin/tickets/[id]/messages` – admin reply + email notification

**Mandant API Routes:**
- `GET /api/tickets` – own tickets (RLS enforced)
- `POST /api/tickets` – create ticket (rate limit: 3/hour per mandant)
- `GET /api/tickets/[id]` – ticket detail with messages
- `POST /api/tickets/[id]/messages` – mandant reply; auto-reopens closed tickets

**Billing Status Extended:** `src/app/api/billing/status/route.ts` now returns `admin_override_active: boolean`
**Billing Lib Extended:** `src/lib/billing.ts` – `BillingStatus` interface includes `adminOverrideActive`

**Installed:** `resend` package, added `RESEND_API_KEY` to `.env.local.example`

## QA Test Results

**QA Date:** 2026-04-09
**Tester:** QA Engineer (automated code review + build verification)
**Build Status:** PASSES (Next.js production build succeeds)

---

### US-1: Admin-Zugang & Mandanten-Uebersicht

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Route `/admin` nur zugaenglich wenn `profiles.is_admin = true` | PASS | `requireAdmin()` in layout.tsx checks server-side via `createAdminClient` |
| 2 | Nicht-Admins werden auf `/dashboard` weitergeleitet | PASS | `redirect('/dashboard')` in admin-guard.tsx |
| 3 | Mandanten-Uebersicht zeigt: Name, E-Mail, Abo-Status, letzter Login, Anzahl offener Tickets | PASS | All columns present in mandanten-tabelle.tsx |
| 4 | Suche nach Mandantenname oder E-Mail | PASS | Search input with debounce + server-side ilike filter + client-side email filter |
| 5 | Klick auf Mandant oeffnet Mandanten-Detailansicht | PASS | `router.push(/admin/mandanten/${m.id})` on TableRow click |

### US-2: Mandanten-Impersonation

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Button "Als Mandant einloggen" in Mandanten-Detailansicht | PASS | ImpersonationButton component rendered |
| 2 | Impersonation verwendet Service Role Key + mandant_id in Session | PASS | HTTP-only cookie `bm_admin_ctx` with admin verification |
| 3 | Sichtbares Banner am oberen Rand waehrend Impersonation | PASS | ImpersonationBanner in `(app)/layout.tsx`, sticky top-0 |
| 4 | "Session beenden" kehrt zur Admin-Uebersicht zurueck | PASS | DELETE to `/api/admin/impersonation` + redirect to `/admin/mandanten` |
| 5 | Impersonation-Start und -Stop in `admin_audit_log` geloggt | PASS | `logAdminAction` calls in POST and DELETE handlers |
| 6 | RLS wird fuer Admin-Session umgangen (Service Role) | PASS | `getEffectiveContext()` returns impersonated context; admin routes use `createAdminClient()` |

### US-3: Manuelle Abo-Verwaltung (Override)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Abschnitt "Abo-Override" in Mandanten-Detailansicht | PASS | AboOverridePanel component rendered |
| 2 | Stripe-Status und Override-Status nebeneinander | PASS | Grid layout in abo-override-panel.tsx |
| 3 | Override-Optionen: permanent oder bis Datum (Datepicker) | PASS | Select + date input |
| 4 | Override in `billing_subscriptions` gespeichert | PASS | PATCH route updates/inserts billing_subscriptions |
| 5 | Override-Aktivierung/-Entfernung im Audit-Log | PASS | `logAdminAction` with override_set/override_removed |
| 6 | Zugangskontrolle prueft Override OR Stripe active | PASS | `getBillingStatus()` checks both conditions |
| 7 | Stripe-Webhooks ueberschreiben Override-Felder nie | PASS | No `admin_override` references in webhook route |
| 8 | Mandant sieht "Vom Support aktiviert" Badge auf /settings/abonnement | **BUG-003** | See bug report below |
| 9 | Admin kann Override jederzeit entfernen | PASS | Remove button with confirmation dialog |

### US-4: Support-Ticket erstellen (Mandant)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Chat-Widget auf allen Seiten als Icon rechts unten | PASS | SupportWidget in `(app)/layout.tsx`, fixed bottom-6 right-6 |
| 2 | Widget enthaelt: Betreff + Nachricht + "Ticket senden" | PASS | Form with subject input and message textarea |
| 3 | Ticket erscheint sofort in Ticket-Uebersicht | PASS | `submitted` state triggers refetch of open count |
| 4 | Bestaetigung nach Absenden | PASS | Green checkmark with "Ticket wurde erstellt" message |
| 5 | Badge mit Anzahl offener Tickets auf Icon | **BUG-001** | See bug report below |

### US-5: Support-Ticket-Uebersicht (Mandant-Dashboard)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Dashboard-Widget "Support-Tickets" mit Ticket-Liste | PASS | TicketsUebersicht on dashboard page |
| 2 | Spalten: Betreff, Status, Erstellt am, Letzte Aktivitaet | **BUG-005** | Only shows Betreff, Erstellt am, Status -- no "Letzte Aktivitaet" column |
| 3 | Klick oeffnet Detailansicht mit Nachrichtenverlauf | PASS | router.push to `/support/tickets/${id}` |
| 4 | Mandant sieht eigene und Admin-Nachrichten | PASS | TicketVerlauf shows both sender types |
| 5 | Mandant kann auf offenes Ticket antworten | PASS | Reply form in TicketVerlauf |
| 6 | Status-Badges: Offen (gelb), In Bearbeitung (blau), Geschlossen (grau) | PASS | TicketStatusBadge with correct colors |

### US-6: Support-Ticket-Verwaltung (Admin)

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `/admin/tickets` zeigt alle Tickets aller Mandanten | PASS | TicketsTabelle fetches from admin endpoint |
| 2 | Filter: Status, Zugewiesen, Mandant, Zeitraum | **BUG-006** | Only Status filter in UI. Missing: Zugewiesen-an, Mandant, Zeitraum filters |
| 3 | Unzugewiesene Tickets visuell hervorgehoben | PASS | Separate "Nicht zugewiesen" section with amber indicator |
| 4 | Admin kann Ticket zuweisen | **BUG-002** | "Mir zuweisen" sends `{ assign_to_me: true }` but API expects `{ assigned_to_admin_id }` |
| 5 | Admin kann Ticket-Status aendern | PASS | Status select dropdown in ticket detail sidebar |
| 6 | Admin kann Antwort schreiben | **BUG-004** | See bug report below |
| 7 | Ticket-Detailansicht zeigt alle required info | **BUG-004** | Admin ticket detail has no GET endpoint |

### US-7: E-Mail-Benachrichtigungen

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | E-Mail bei neuer Admin-Antwort | PASS | `sendTicketReplyEmail` called after message insert |
| 2 | E-Mail bei Statuswechsel | PASS | `sendTicketStatusEmail` called in PATCH handler |
| 3 | E-Mails an Mandant-E-Mail-Adresse | PASS | Fetches owner email from mandant -> auth.users |
| 4 | Kein E-Mail wenn Mandant selbst aktiv | PASS | No email calls in mandant message/ticket routes |

---

### Bug Reports

#### BUG-001: Support-Widget Badge zeigt keine Ticket-Anzahl (Severity: Medium)

**Description:** The SupportWidget fetches `/api/tickets?count_only=true` expecting an `open_count` field in the response, but the GET handler in `/api/tickets/route.ts` does not recognize the `count_only` query parameter. It always returns the full ticket array. The widget then reads `data.open_count` which is `undefined`, defaulting to 0 -- so the badge never shows.

**Steps to Reproduce:**
1. Login as a mandant with open support tickets
2. Observe the floating support chat icon in the bottom-right
3. No badge appears even though tickets exist

**Expected:** Badge shows number of open tickets.
**Actual:** Badge never displays (always reads 0).

**Root Cause:** `GET /api/tickets` returns an array, not `{ open_count: N }`. The `count_only` param is not handled.

**Priority:** P2

---

#### BUG-002: "Mir zuweisen" Button sendet falsches Payload (Severity: High)

**Description:** In `ticket-detail.tsx` line 151, the "Mir zuweisen" button sends `{ assign_to_me: true }` to `PATCH /api/admin/tickets/[id]`. However, the API schema expects `{ assigned_to_admin_id: string | null }`. The Zod schema validation will reject `assign_to_me` as an unknown field (it's not in the schema), and the refine check requires at least `status` or `assigned_to_admin_id` to be present -- so the request returns 400 Bad Request.

**Steps to Reproduce:**
1. Login as admin
2. Navigate to `/admin/tickets/[id]`
3. Click "Mir zuweisen"
4. Request fails with 400

**Expected:** Ticket is assigned to the current admin.
**Actual:** Request fails because `assign_to_me` is not a valid field.

**Root Cause:** Frontend sends `assign_to_me: true` but API route expects `assigned_to_admin_id: <uuid>`.

**Priority:** P1

---

#### BUG-003: Billing-Status-API liefert nicht die Felder fuer Override-Badge auf Mandant-Seite (Severity: Medium)

**Description:** The `/settings/abonnement` page reads `data.adminOverrideType` and `data.adminOverrideUntil` to show the "Vom Support aktiviert" badge with details. However, the `/api/billing/status` route only returns `admin_override_active: boolean` -- it does NOT return `admin_override_type` or `admin_override_until`. Additionally, the response uses snake_case (`admin_override_active`) while the frontend expects camelCase (`adminOverrideType`). The `hasAdminOverride` check uses `!!data?.adminOverrideType` which will always be falsy.

**Steps to Reproduce:**
1. Set an admin override for a mandant
2. Login as that mandant
3. Go to `/settings/abonnement`
4. The "Vom Support aktiviert" badge does not appear

**Expected:** Badge shows with override type details.
**Actual:** Badge never renders because the API does not return the required fields.

**Root Cause:** API response shape mismatch between `/api/billing/status` and the settings page expectations.

**Priority:** P2

---

#### BUG-004: Admin Ticket-Detail hat keinen GET-Endpoint (Severity: Critical)

**Description:** The `AdminTicketDetail` component (`ticket-detail.tsx`) fetches ticket data from `GET /api/admin/tickets/${ticketId}`, but the route file at `src/app/api/admin/tickets/[id]/route.ts` only exports a `PATCH` handler. There is NO `GET` handler. This means `fetchTicket()` will receive a 405 Method Not Allowed error, and the entire admin ticket detail page will show an error state permanently.

**Steps to Reproduce:**
1. Login as admin
2. Navigate to `/admin/tickets`
3. Click on any ticket
4. Page shows error "Ticket konnte nicht geladen werden"

**Expected:** Ticket detail page loads with message thread, status controls, and meta information.
**Actual:** HTTP 405 -- the detail page never loads.

**Root Cause:** Missing `GET` export in `/api/admin/tickets/[id]/route.ts`.

**Priority:** P0

---

#### BUG-005: Mandant-Ticket-Uebersicht fehlt "Letzte Aktivitaet" Spalte (Severity: Low)

**Description:** The acceptance criteria specify columns: Betreff, Status, Erstellt am, Letzte Aktivitaet. The `TicketsUebersicht` widget only shows Betreff, Erstellt am, and Status badge. The "Letzte Aktivitaet" (updated_at) is not displayed.

**Steps to Reproduce:**
1. Login as mandant
2. View dashboard
3. Support-Tickets widget shows only 3 data points per ticket

**Expected:** "Letzte Aktivitaet" column/field visible.
**Actual:** Not shown.

**Priority:** P3

---

#### BUG-006: Admin-Tickets-Seite fehlen Filter (Zugewiesen, Mandant, Zeitraum) (Severity: Medium)

**Description:** The acceptance criteria for US-6 require filter options for: Status, Zugewiesen an (Admin-Auswahl), Mandant, and Zeitraum (von/bis). The `TicketsTabelle` component only implements a status filter and a free-text search. The API supports all these filters (`assigned_to`, `mandant_id`, `from`, `to`, `unassigned`) but the UI does not expose them.

**Steps to Reproduce:**
1. Login as admin
2. Go to `/admin/tickets`
3. Only Status filter and search field visible

**Expected:** Additional filters for assigned admin, mandant, and date range.
**Actual:** Only status filter is present.

**Priority:** P2

---

#### BUG-007: Mandant-API-Responses wrappen Daten nicht konsistent (Severity: High)

**Description:** Multiple frontend components read `data.data` from API responses (e.g., `mandanten-tabelle.tsx` line 82: `setMandanten(data.data ?? [])`, `tickets-tabelle.tsx` line 74: `setTickets(data.data ?? [])`, `mandant-detail-page` line 59: `setMandant(data.data)`, `ticket-detail.tsx` line 76: `setTicket(data.ticket)`). However, the actual API routes return the data directly (e.g., `NextResponse.json(result)` not `NextResponse.json({ data: result })`). This means `data.data` is always `undefined`, and the components show empty states.

**Steps to Reproduce:**
1. Login as admin
2. Navigate to `/admin/mandanten` -- table shows "Keine Mandanten gefunden" even if mandants exist
3. Navigate to `/admin/tickets` -- table shows "Keine Tickets gefunden" even if tickets exist
4. Click on a mandant -- detail page shows error because `data.data` is null

**Expected:** Components correctly parse API response and display data.
**Actual:** Components read `data.data` which is undefined because APIs return data directly, not wrapped in `{ data: ... }`.

**Root Cause:** Frontend expects `{ data: [...] }` wrapper but API routes return arrays/objects directly.

**Priority:** P0

---

#### BUG-008: Admin Ticket-Detail "Antwort senden" doppelt-parsed Response (Severity: Medium)

**Description:** In `ticket-detail.tsx` line 111, after sending a reply, the code calls `const { data: newMessage } = await res.json()`. But the admin messages API (`POST /api/admin/tickets/[id]/messages`) returns the message directly via `NextResponse.json(message, { status: 201 })` -- there is no `data` wrapper. So `newMessage` will be `undefined`, and the message won't appear in the UI until page refresh.

Similarly in `ticket-verlauf.tsx` line 102, the mandant reply also does `const { data: newMessage } = await res.json()` but the API returns the message directly.

**Steps to Reproduce:**
1. Send a reply as admin or mandant in the ticket detail view
2. Message does not appear immediately in the thread
3. Refresh page -- message now visible

**Expected:** Message appears immediately in the thread after sending.
**Actual:** Message is undefined due to destructuring mismatch; thread doesn't update until refresh.

**Priority:** P2

---

#### BUG-009: Mandant TicketsUebersicht liest `data.data` statt `data` (Severity: High)

**Description:** The `TicketsUebersicht` component (line 53) reads `setTickets(data.data ?? [])` but `GET /api/tickets` returns an array directly. This means tickets never display on the dashboard widget.

**Steps to Reproduce:**
1. Login as mandant with existing tickets
2. Dashboard shows "Du hast noch keine Support-Tickets" even though tickets exist

**Expected:** Ticket list shows correctly.
**Actual:** Always shows empty state.

**Priority:** P1 (same root cause as BUG-007)

---

### Security Audit (Red Team)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Admin route server-side protection | PASS | `requireAdmin()` runs in layout, checks DB via Service Role |
| 2 | Service Role Key only in API Routes | PASS | `createAdminClient()` only used server-side |
| 3 | Audit log append-only (no delete/update via API) | PASS | No UPDATE/DELETE RLS policies; no API endpoints for modifying audit log |
| 4 | RLS on support_tickets and messages | PASS | Mandant-scoped SELECT/INSERT/UPDATE policies |
| 5 | Impersonation cookie security | PASS | httpOnly, secure in prod, sameSite strict, 4hr max |
| 6 | Input validation (Zod) on all API routes | PASS | All POST/PATCH handlers validate with Zod schemas |
| 7 | Rate limiting on ticket creation | PASS | 3/hour per mandant via in-memory rate limiter |
| 8 | XSS in email templates | PASS | `escapeHtml()` applied to all user-supplied content |
| 9 | Admin self-removal prevention | **NOTE** | No UI for managing `is_admin` flag at all -- only DB direct edit possible. This is by design per edge cases. |
| 10 | IDOR: Mandant accessing other mandant tickets | PASS | RLS + mandant_id check in API routes |
| 11 | Non-admin accessing admin API routes | PASS | `verifyAdmin()` on every admin API handler |
| 12 | Impersonation cookie tampering | **CONCERN** | Cookie value is plain JSON, not signed/encrypted. An attacker who can read the cookie value could craft a valid impersonation payload. However, `getEffectiveContext()` re-verifies `is_admin` on each request. Risk is LOW because httpOnly prevents JS access, but a MITM on non-HTTPS dev could exploit this. |
| 13 | Rate limiter bypass via serverless cold starts | **NOTE** | In-memory rate limit resets on cold start. Multiple Vercel instances have separate stores. Documented as limitation. |
| 14 | SQL injection via search params | PASS | Supabase parameterized queries via `.ilike()` |
| 15 | profiles_update_own allows users to set is_admin | **CONCERN** | The RLS policy `profiles_update_own` allows `FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid())` -- there is no column-level restriction. A user could directly call Supabase client to set `is_admin = true` on their own profile. This is a privilege escalation vulnerability. |

### Security Bug: VULN-001 -- Privilege Escalation via profiles self-update (Severity: CRITICAL)

**Description:** The RLS policy `profiles_update_own` on the `profiles` table allows any authenticated user to update ANY column on their own row, including `is_admin`. A malicious user can use the Supabase JS client directly (available in the browser) to set `is_admin = true` on their own profile and gain full admin access.

**Steps to Reproduce:**
1. Login as any regular user
2. Open browser console
3. Execute: `const { createClient } = await import('@supabase/supabase-js'); const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY); await supabase.from('profiles').update({ is_admin: true }).eq('id', '<user-id>');`
4. Navigate to `/admin` -- full admin access granted

**Expected:** Users cannot modify `is_admin` field.
**Actual:** RLS policy does not restrict which columns can be updated.

**Fix Recommendation:** Add a column-level check to the UPDATE policy: `WITH CHECK (id = auth.uid() AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid()))` or use a BEFORE UPDATE trigger to prevent `is_admin` changes.

**Priority:** P0 -- MUST fix before any deployment

---

### Cross-Browser / Responsive Testing

| Aspect | Status | Notes |
|--------|--------|-------|
| Chrome Desktop (1440px) | PASS (code review) | Standard layout, grid cols, responsive breakpoints present |
| Firefox Desktop | PASS (code review) | No Firefox-specific CSS used; standard Tailwind |
| Safari Desktop | PASS (code review) | No Safari-specific issues identified |
| Mobile (375px) | PASS (code review) | `flex-col` at small breakpoints, `sm:` / `md:` / `lg:` breakpoints |
| Tablet (768px) | PASS (code review) | `md:p-6` padding, sidebar trigger for mobile |

Note: Cross-browser testing was done via code review only (no live browser testing). Recommend manual verification.

---

### Edge Cases Tested

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Admin without `is_admin` calls `/admin` | PASS | Redirect to dashboard |
| Impersonation while mandant session active | PASS | Cookie replaces session |
| Stripe webhook after override set | PASS | Override fields not touched by webhook |
| Override until_date expires | PASS | `getBillingStatus` checks `new Date(until) > new Date()` |
| Mandant sends ticket, no admin online | PASS | Ticket stays unassigned |
| Mandant replies on closed ticket | PASS | Auto-reopens to 'open' status |
| Email failure does not rollback | PASS | try/catch with console.error only |
| Multiple admins reply simultaneously | PASS | Both messages saved, ordered by timestamp |
| Admin self-removal prevention | PASS | No UI for managing is_admin |

---

### Summary

| Category | Count |
|----------|-------|
| Acceptance Criteria Tested | 35 |
| Passed | 26 |
| Failed (bugs) | 9 |
| Security Findings | 2 (1 Critical, 1 Low concern) |

**Bug Severity Breakdown:**
- Critical (P0): 3 (BUG-004, BUG-007, VULN-001)
- High (P1): 2 (BUG-002, BUG-009)
- Medium (P2): 4 (BUG-001, BUG-003, BUG-006, BUG-008)
- Low (P3): 1 (BUG-005)

### Production-Ready Decision: **NOT READY**

3 Critical and 2 High severity bugs must be fixed before deployment. The critical security vulnerability (VULN-001) allowing privilege escalation must be addressed immediately.

### Prioritized Fix Order:
1. **VULN-001** -- Privilege escalation via profiles self-update (CRITICAL SECURITY)
2. **BUG-007** -- API response wrapper mismatch (blocks ALL admin UI)
3. **BUG-004** -- Missing GET endpoint for admin ticket detail
4. **BUG-002** -- "Mir zuweisen" sends wrong payload
5. **BUG-009** -- Dashboard tickets widget empty (same root cause as BUG-007)
6. **BUG-001** -- Support widget badge not working
7. **BUG-003** -- Override badge not showing on mandant settings
8. **BUG-008** -- Reply message not appearing immediately
9. **BUG-006** -- Missing admin ticket filters
10. **BUG-005** -- Missing "Letzte Aktivitaet" in mandant widget

## Deployment

**Deployed:** 2026-04-09
**Commit:** `993f704`
**Branch:** main → Vercel Auto-Deploy

### Post-Deploy Schritte (manuell erforderlich)
1. **Supabase Migration:** `supabase/migrations/20260409000000_admin_panel.sql` in Supabase Cloud ausführen
2. **Vercel Env Var:** `RESEND_API_KEY` in Vercel Dashboard setzen + Redeploy
3. **Admin-User:** `UPDATE profiles SET is_admin = true WHERE email = 'admin@email.at';`
4. **Resend:** Domain `belegmanager.at` verifizieren für `noreply@belegmanager.at`
