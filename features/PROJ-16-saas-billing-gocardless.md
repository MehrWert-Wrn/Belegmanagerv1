# PROJ-16: SaaS-Billing via GoCardless

**Status:** In Review
**Created:** 2026-03-31
**Priority:** P1

---

## Overview

Belegmanager-Mandanten zahlen ihre monatliche Abo-Gebühr automatisch per SEPA-Lastschrift via GoCardless. Mehr.Wert Gruppe GmbH richtet einmalig ein GoCardless-Konto ein; Mandanten erteilen beim Onboarding ein Lastschriftmandat. Zahlungen werden automatisch monatlich eingezogen.

---

## Dependencies

- Requires: PROJ-1 (Authentifizierung) – eingeloggter Mandant
- Requires: PROJ-2 (Mandant-Onboarding) – Mandant-Datensatz muss existieren
- External: GoCardless API (SEPA Core Scheme, Sandbox + Production)

---

## User Stories

### US-1: Mandat erteilen (Onboarding-Flow)
Als neuer Mandant möchte ich beim oder nach dem Onboarding ein SEPA-Lastschriftmandat erteilen, damit Mehr.Wert meine monatliche Gebühr automatisch einziehen kann.

**Acceptance Criteria:**
- [ ] Button „Abo abschließen" / „Zahlungsmethode hinterlegen" in Onboarding oder Settings
- [ ] Klick leitet zu GoCardless Hosted Payment Page (Billing Request Flow)
- [ ] Nach erfolgreichem Mandat: Mandant wird zurück auf `/settings/billing` geleitet
- [ ] Erfolgs-Toast: „Mandat erfolgreich eingerichtet – Abonnement ist aktiv"
- [ ] Mandat-Status wird in DB gespeichert (GoCardless Mandate ID + Status)

### US-2: Abo-Status einsehen
Als Mandant möchte ich auf einer Einstellungsseite meinen Abo-Status sehen, damit ich weiß ob mein Konto aktiv ist und wann die nächste Zahlung fällig ist.

**Acceptance Criteria:**
- [ ] Seite `/settings/billing` zeigt: Plan, Status (Aktiv / Ausstehend / Fehlgeschlagen / Gekündigt)
- [ ] Nächstes Abbuchungsdatum und Betrag sichtbar
- [ ] Letzte Zahlung (Datum + Status) sichtbar
- [ ] Mandat-Referenz (IBAN-Ende maskiert, z.B. DE** **** 1234) sichtbar

### US-3: Abo kündigen
Als Mandant möchte ich mein Abo kündigen können, damit ich keine weiteren Zahlungen autorisiere.

**Acceptance Criteria:**
- [ ] Button „Abo kündigen" auf `/settings/billing`
- [ ] Bestätigungs-Dialog: „Dein Konto bleibt bis [Datum] aktiv. Danach kein Zugang mehr."
- [ ] GoCardless Subscription wird via API gecancelled
- [ ] Status ändert sich auf „Gekündigt – aktiv bis [Datum]"
- [ ] Kein automatischer Datenverlust bei Kündigung

### US-4: Zahlungsfehlschlag behandeln
Als Mandant möchte ich benachrichtigt werden, wenn eine Zahlung fehlschlägt, damit ich die Situation klären kann.

**Acceptance Criteria:**
- [ ] Webhook von GoCardless (`payment_failed`) wird verarbeitet
- [ ] Mandant-Status in DB auf `payment_failed` setzen
- [ ] E-Mail-Benachrichtigung an Mandant (via Supabase Auth oder Resend)
- [ ] In-App-Banner auf Dashboard: „Zahlungsproblem – bitte Zahlungsmethode aktualisieren"
- [ ] Link zu `/settings/billing` für Mandat-Update

### US-5: Zahlungsbestätigung verarbeiten
Als System möchte ich erfolgreiche GoCardless-Zahlungen automatisch erfassen, damit der Abo-Status aktuell bleibt.

**Acceptance Criteria:**
- [ ] Webhook `payment_paid_out` verarbeitet und in `billing_payments` gespeichert
- [ ] Mandant-Status nach Zahlung auf `active` gesetzt
- [ ] Webhook-Signatur wird verifiziert (GoCardless Webhook Secret)

### US-6: Mandat aktualisieren
Als Mandant mit fehlgeschlagener Zahlung möchte ich eine neue Bankverbindung hinterlegen, damit mein Konto wieder aktiv wird.

**Acceptance Criteria:**
- [ ] Button „Bankverbindung aktualisieren" bei `payment_failed` Status
- [ ] Neuer GoCardless Billing Request Flow für neues Mandat
- [ ] Nach Erfolg: altes Mandat gecancelled, neues Mandat aktiv, neue Subscription erstellt

### US-7: Testzeitraum (30 Tage)
Als neuer Mandant möchte ich die Software 30 Tage kostenlos testen, damit ich die Funktionen kennenlernen kann bevor ich zahle.

**Acceptance Criteria:**
- [ ] Beim Anlegen eines Mandanten wird `trial_ends_at = NOW() + 30 Tage` automatisch gesetzt
- [ ] Kein manueller Eingriff nötig – das System managt den Trial vollständig selbst
- [ ] Zugang während Trial genauso vollständig wie bei aktivem Abo
- [ ] Nach Ablauf der 30 Tage ohne aktives Abo: Zugang gesperrt (Blocked-View, alle Routen außer `/settings/abonnement`)
- [ ] Blocked-View zeigt: "Testzeitraum abgelaufen – Abo abschließen um weiterzumachen"
- [ ] Button auf Blocked-View: direkt zu GoCardless Mandate-Setup

### US-8: Trial-Banner in der Sidebar
Als Mandant im Testzeitraum möchte ich jederzeit sehen wie viele Tage mein Test noch läuft, damit ich rechtzeitig ein Abo abschließen kann.

**Acceptance Criteria:**
- [ ] Banner am unteren Ende der linken Sidebar (oberhalb des User-Avatars)
- [ ] Text: „Jetzt Belegmanager-ABO sichern!" + Countdown „noch X Tage"
- [ ] Button: „Abonnieren" → leitet zu `/settings/abonnement`
- [ ] Banner nur sichtbar solange: Trial aktiv UND noch kein aktives Abo
- [ ] Wenn 7 Tage oder weniger: Banner wird farblich hervorgehoben (Magenta statt Petrol)
- [ ] Nach Abo-Abschluss: Banner verschwindet dauerhaft

### US-9: Zugangskontrolle (Trial + Abo)
Als System möchte ich sicherstellen, dass Mandanten nur im erlaubten Zeitraum Zugang haben.

**Acceptance Criteria:**
- [ ] Zugang erlaubt wenn: Trial aktiv (trial_ends_at > NOW()) ODER Abo aktiv (status = 'active')
- [ ] Zugang gesperrt wenn: Trial abgelaufen UND kein aktives Abo
- [ ] Zugangsprüfung im App-Layout (serverseitig, nicht nur Client) – kein Bypass möglich
- [ ] Ausnahme: `/settings/abonnement` bleibt immer zugänglich (auch bei gesperrtem Zugang)
- [ ] Bei `payment_failed` Status: Zugang für 3 Tage Kulanz-Periode noch gewährt

---

## Abo-Pläne (MVP)

| Plan | Preis | Interval | GoCardless Subscription |
|------|-------|----------|------------------------|
| Starter | 29 € / Monat | monthly | `amount: 2900`, `currency: EUR` |
| Professional | 59 € / Monat | monthly | `amount: 5900`, `currency: EUR` |

*Pläne in DB-Tabelle `billing_plans` konfigurierbar (kein Hardcoding)*

---

## GoCardless Integration – Technischer Ablauf

### Mandat + Subscription Setup (Hosted Flow)
```
Mandant klickt "Abo abschließen"
→ POST /api/billing/setup
   → GoCardless: POST /billing_requests (mandate_request für SEPA)
   → GoCardless: POST /billing_request_flows (redirect_uri = /settings/billing?success=true)
   → Response: { authorisation_url }
→ Mandant wird zu authorisation_url weitergeleitet (GoCardless Hosted Page)
→ Mandant gibt IBAN ein + bestätigt Mandat
→ GoCardless redirectet zu /settings/billing?success=true
→ Webhook: billing_request.fulfilled → Mandate ID extrahieren
→ POST /subscriptions mit Mandate ID → Subscription aktiv
```

### Webhook-Endpunkt
```
POST /api/billing/webhook
→ Signature-Verifikation (WEBHOOK_SECRET)
→ Event-Routing:
   - billing_request.fulfilled     → Mandate ID speichern, Subscription erstellen
   - payment.paid_out              → Payment als bezahlt markieren
   - payment.failed                → Mandant als payment_failed markieren, E-Mail
   - subscription.cancelled        → Subscription-Status updaten
   - mandate.cancelled / .expired  → Mandat-Status updaten
```

---

## Datenbank-Schema

### Erweiterung: `mandanten`-Tabelle
```sql
trial_ends_at   timestamptz   -- gesetzt beim Anlegen: NOW() + 30 days
```
*Wird im Onboarding-Trigger oder in PROJ-2-Onboarding-Route automatisch befüllt.*

### Tabelle: `billing_plans`
```sql
id              uuid PRIMARY KEY
name            text (z.B. "Starter", "Professional")
amount_cents    integer (z.B. 2900)
currency        text DEFAULT 'EUR'
interval        text DEFAULT 'monthly'
active          boolean DEFAULT true
```

### Tabelle: `billing_subscriptions`
```sql
id                      uuid PRIMARY KEY
mandant_id              uuid REFERENCES mandanten(id)
plan_id                 uuid REFERENCES billing_plans(id)
status                  text (pending_mandate | active | payment_failed | cancelled | paused)
gc_mandate_id           text (GoCardless Mandate ID)
gc_subscription_id      text (GoCardless Subscription ID)
gc_customer_id          text (GoCardless Customer ID)
current_period_end      date
cancelled_at            timestamptz
created_at              timestamptz DEFAULT now()
```

### Tabelle: `billing_payments`
```sql
id                  uuid PRIMARY KEY
mandant_id          uuid REFERENCES mandanten(id)
subscription_id     uuid REFERENCES billing_subscriptions(id)
gc_payment_id       text
amount_cents        integer
currency            text
status              text (pending | confirmed | paid_out | failed | cancelled)
charge_date         date
created_at          timestamptz DEFAULT now()
```

*RLS auf allen Tabellen: Mandant sieht nur eigene Daten. Admin sieht alle.*

---

## API-Routen

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| POST | `/api/billing/setup` | Billing Request + Flow erstellen, URL zurückgeben |
| GET | `/api/billing/status` | Abo-Status des eingeloggten Mandanten |
| POST | `/api/billing/cancel` | Subscription cancellen |
| POST | `/api/billing/webhook` | GoCardless Webhook-Endpunkt (kein Auth, Signatur-Verifikation) |

---

## Environment Variables (neu)

```env
GOCARDLESS_ACCESS_TOKEN=     # GoCardless API Token (Sandbox/Production)
GOCARDLESS_WEBHOOK_SECRET=   # Für Webhook-Signatur-Verifikation
GOCARDLESS_ENVIRONMENT=      # "sandbox" | "live"
```

---

## Edge Cases

1. **Mandant bricht Hosted Flow ab** → Billing Request bleibt `pending`, kein Abo aktiv → Bei nächstem Login erneut anbieten
2. **Webhook kommt vor Redirect** → Status muss auch via Webhook (nicht nur Redirect-Parameter) gesetzt werden
3. **Doppelklick auf Setup** → Idempotenz prüfen: wenn `pending_mandate` Subscription existiert, keinen zweiten Billing Request erstellen
4. **Mandat abgelaufen (expired)** → Status `payment_failed` setzen, Mandant benachrichtigen
5. **Mandant kündigt während laufender Zahlung** → Subscription cancellen, aktuelle Zahlung noch einziehen, Zugang bis Period-End
6. **GoCardless-API nicht erreichbar** → Fehler graceful abfangen, Toast „Zahlungsservice momentan nicht verfügbar"
7. **Webhook-Duplikate** → GoCardless sendet Webhooks ggf. mehrfach → Idempotenz via `gc_payment_id`
8. **Trial läuft genau um Mitternacht ab** → Zugangsprüfung UTC-basiert; `trial_ends_at` auf 23:59:59 des 30. Tages setzen
9. **Mandant schließt Abo noch am letzten Trial-Tag ab** → Kein Unterbruch; Trial endet, Abo übernimmt nahtlos
10. **Trial bereits abgelaufen beim ersten Login** → (z.B. Account inaktiv gelassen) → Sofort Blocked-View, kein Zugang
11. **`payment_failed` + Trial gleichzeitig abgelaufen** → Kein Kulanz-Zugang; sofort gesperrt

---

## UI-Seiten

### `/settings/billing` (neue Seite unter Settings)
- Status-Card: Plan + Status-Badge (Aktiv/Fehlgeschlagen/Gekündigt)
- Nächste Zahlung: Betrag + Datum
- Mandat-Info: maskierte IBAN
- Zahlungshistorie: Tabelle letzte 12 Monate
- Aktionen: „Kündigen" / „Bankverbindung aktualisieren"

### Sidebar-Erweiterung
- In `/settings` Navigation: neuer Punkt „Abonnement"

### Dashboard-Banner (bei `payment_failed`)
- Roter Banner oben: „⚠ Zahlung fehlgeschlagen – Bankverbindung aktualisieren"

---

## Out of Scope (MVP)

- Jährliche Abos (nur monatlich)
- Rabattcodes / Promotions
- Rechnungs-PDF-Generierung (GoCardless stellt einfache Receipts bereit)
- Upgrade/Downgrade zwischen Plänen

---

## Tech Design (Solution Architect)

### Zugangskontrolle – Logik

```
Zugangsprüfung (serverseitig im App-Layout):

  trialAktiv   = mandant.trial_ends_at > NOW()
  aboAktiv     = billing_subscriptions.status IN ('active')
  kulanzdAktiv = billing_subscriptions.status = 'payment_failed'
                 AND billing_subscriptions.updated_at > NOW() - 3 days

  WENN (trialAktiv ODER aboAktiv ODER kulanzAktiv)
    → Zugang gewähren
  SONST
    → Blocked-View anzeigen (außer Route = /settings/abonnement)
```

### Trial-Banner – Anzeigelogik

```
Sidebar-Banner sichtbar wenn:
  trialAktiv = true UND aboAktiv = false

  daysLeft = CEIL((trial_ends_at - NOW()) / 1 Tag)

  daysLeft > 7  → Petrol-Farbe  „Noch X Tage Testphase"
  daysLeft ≤ 7  → Magenta-Farbe „Nur noch X Tage!"

  Text:    „Jetzt Belegmanager-ABO sichern!"
  Button:  „Abonnieren" → /settings/abonnement
```

### Komponenten-Struktur

```
/settings/abonnement (neue Seite)
+-- BillingStatusCard
|   +-- PlanBadge (Starter / Professional)
|   +-- StatusBadge (Aktiv / Ausstehend / Fehlgeschlagen / Gekündigt)
|   +-- NächsteZahlung (Betrag + Datum)
|   +-- MandatInfo (maskierte IBAN: DE** **** 1234)
+-- ZahlungshistorieTabelle
|   +-- Zeilen: Datum | Betrag | Status-Badge (12 Monate)
+-- BillingAktionen
|   +-- [Abo abschließen] Button  ← nur wenn kein aktives Mandat
|   +-- [Kündigen] Button          ← nur wenn aktiv
|   +-- [Bankverbindung aktualisieren] Button  ← nur bei payment_failed
+-- KündigungsDialog (Bestätigung mit Ablaufdatum)

TrialBanner (in SidebarFooter, oberhalb des User-Avatars)
+-- CountdownBadge (X Tage – petrol wenn >7, magenta wenn ≤7)
+-- Headline „Jetzt Belegmanager-ABO sichern!"
+-- Button „Abonnieren" → /settings/abonnement
+-- [nur sichtbar wenn: trial aktiv + kein aktives Abo]

BlockedView (Vollbild-Overlay, wenn Trial abgelaufen + kein Abo)
+-- Logo
+-- Titel „Testzeitraum abgelaufen"
+-- Text „Schließe ein Abo ab um Belegmanager weiter zu nutzen."
+-- Button „Jetzt abonnieren" → /settings/abonnement
+-- [zeigt /settings/abonnement normal, kein Overlay dort]

/api/billing/setup (Server-Route)
+-- Erstellt GoCardless Billing Request
+-- Erstellt GoCardless Billing Request Flow (Redirect-URL)
+-- Gibt { authorisation_url } zurück

/api/billing/status (Server-Route)
+-- Liest billing_subscriptions + billing_payments aus DB
+-- Gibt Abo-Status, Plan, nächste Zahlung zurück

/api/billing/cancel (Server-Route)
+-- Cancelt GoCardless Subscription via API
+-- Aktualisiert Status in DB

/api/billing/webhook (Server-Route, kein Auth)
+-- Verifiziert GoCardless Webhook-Signatur
+-- Routet Events → DB-Updates + E-Mail-Benachrichtigung

Dashboard-Banner (in /dashboard/page.tsx)
+-- Wird eingeblendet wenn billing_subscriptions.status = 'payment_failed'
+-- Roter Alert-Banner mit Link zu /settings/abonnement
```

### Datenmodell (Klartext)

**billing_plans** – Konfigurationstabelle für Abo-Pläne:
- Name (z.B. "Starter"), Preis in Cent (2900), Währung (EUR), Intervall (monthly), Aktiv-Flag
- Wird vom Admin gepflegt, nicht hardcoded

**billing_subscriptions** – Ein Datensatz pro Mandant, verknüpft mit seinem Abo:
- Verknüpfung zum Mandanten + zum Plan
- Status (5 Zustände: pending_mandate → active → payment_failed / cancelled / paused)
- Drei GoCardless-IDs: Customer ID, Mandate ID, Subscription ID
- Ablaufdatum der laufenden Periode (für "aktiv bis"-Anzeige nach Kündigung)
- RLS: Mandant sieht nur seine eigene Subscription

**billing_payments** – Jede eingezogene oder fehlgeschlagene Zahlung:
- Verknüpfung zu Mandant + Subscription
- GoCardless Payment ID (für Idempotenz bei doppelten Webhooks)
- Betrag, Währung, Status (pending → confirmed → paid_out / failed / cancelled)
- Einzugsdatum
- RLS: Mandant sieht nur seine eigenen Zahlungen

### Tech-Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| GoCardless Flow | Hosted Billing Request Flow | Keine PCI-Compliance nötig; GoCardless hostet die IBAN-Eingabe sicher |
| Mandate-Aktivierung | Via Webhook (nicht Redirect-Parameter) | Webhook ist zuverlässiger; Redirect-Parameter allein ist race-condition-anfällig |
| Subscription-Erstellung | Im Webhook `billing_request.fulfilled` | Erst wenn Mandat bestätigt, nicht schon beim Redirect |
| Webhook-Sicherheit | HMAC-Signaturprüfung mit `GOCARDLESS_WEBHOOK_SECRET` | Verhindert gefälschte Webhook-Events von Dritten |
| Idempotenz | Unique-Constraint auf `gc_payment_id` | GoCardless sendet Webhooks ggf. mehrfach – doppelte Verarbeitung verhindert |
| E-Mail bei Fehlschlag | Supabase Auth E-Mail oder Resend | Mandant muss informiert werden, auch wenn er nicht eingeloggt ist |
| Trial-Speicherort | `trial_ends_at` auf `mandanten`-Tabelle | Einfach, kein extra Status; Trial ist mandantenspezifisch und ändert sich nie |
| Zugangsprüfung | Serverseitig im App-Layout (Server Component) | Client-seitige Guards sind bypassbar; Server Component hat immer aktuellen Status |
| Trial-Setzen | Automatisch im Onboarding (DB-Trigger oder API Route) | Kein manueller Eingriff; Trial startet exakt beim Mandant-Anlegen |
| Blocked-View | Overlay im App-Layout (nicht Middleware-Redirect) | `/settings/abonnement` muss erreichbar bleiben; Overlay ist einfacher als Route-Whitelist in Middleware |

### Neue Abhängigkeiten

| Paket | Zweck |
|---|---|
| `gocardless-nodejs` | Offizieller GoCardless Node.js SDK |

### Settings-Navigation (Erweiterung)

Bestehende Tabs in `src/app/(app)/settings/layout.tsx`:
- Firma
- Zahlungsquellen
- Benutzer
- **→ NEU: Abonnement** (href: `/settings/abonnement`)

### Neue Umgebungsvariablen

```
GOCARDLESS_ACCESS_TOKEN      GoCardless API Token (Sandbox/Production)
GOCARDLESS_WEBHOOK_SECRET    Für Webhook-Signatur-Verifikation
GOCARDLESS_ENVIRONMENT       "sandbox" | "live"
```

### Sequenzdiagramm (vereinfacht)

```
Mandant               Next.js App              GoCardless             Webhook
   |                      |                        |                     |
   |-- Klick "Abo" ------>|                        |                     |
   |                      |-- POST /billing/setup ->|                     |
   |                      |<- { authorisation_url } |                     |
   |<-- Redirect -------->|                        |                     |
   |                      |                        |                     |
   |---- IBAN eingeben --------------------------------->|               |
   |<--- Bestätigt ----------------------------------------|             |
   |                      |                 billing_request.fulfilled --->|
   |                      |<-------------------------------------------- |
   |                      |-- Mandate-ID speichern                        |
   |                      |-- POST /subscriptions (GoCardless) ---------->|
   |                      |<- Subscription aktiv ----------------------- |
   |<-- /settings/abonnement (Status: Aktiv) -----|                      |
```
