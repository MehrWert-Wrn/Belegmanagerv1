# PROJ-16: SaaS-Billing via Stripe

**Status:** Deployed
**Created:** 2026-03-31
**Priority:** P1

---

## Overview

Belegmanager-Mandanten zahlen ihre monatliche Abo-Gebühr via Stripe (Kreditkarte, SEPA-Lastschrift je nach Zahlungsmethode). Die Integration nutzt Stripe Checkout für den Zahlungsabschluss und das Stripe Customer Portal für Verwaltung und Kündigung. Webhooks halten den DB-Status aktuell.

**Preis:** €49,90 / Monat (netto), kein Testzeitraum.

---

## Dependencies

- Requires: PROJ-1 (Authentifizierung) – eingeloggter Mandant
- Requires: PROJ-2 (Mandant-Onboarding) – Mandant-Datensatz muss existieren
- External: Stripe API (Test + Live)

---

## User Stories

### US-1: Abo abschließen (Checkout)
Als Mandant möchte ich mein Abonnement per Stripe Checkout abschließen.

**Acceptance Criteria:**
- [x] Button „Abonnement abschließen" auf `/settings/abonnement`
- [x] Klick startet Stripe Checkout Session (subscription mode, STRIPE_PRICE_ID)
- [x] Nach erfolgreichem Checkout: Mandant wird zu `/settings/abonnement` weitergeleitet
- [x] Webhook `checkout.session.completed` speichert Subscription-Daten in DB
- [x] Stripe Customer wird einmalig angelegt und wiederverwendet (upsert via `mandant_id`)

### US-2: Abo-Status einsehen
Als Mandant möchte ich auf `/settings/abonnement` meinen Abo-Status sehen.

**Acceptance Criteria:**
- [x] Seite zeigt: Status-Badge (Aktiv / Fehlgeschlagen / Gekündigt / Kein Abo)
- [x] Nächstes Abbuchungsdatum sichtbar (current_period_end)
- [x] Zahlungshistorie: letzte 12 Zahlungen (Betrag, Datum, Status)
- [x] Button „Abonnement verwalten" → Stripe Customer Portal

### US-3: Abo verwalten / kündigen
Als Mandant möchte ich mein Abo über das Stripe Customer Portal verwalten und kündigen können.

**Acceptance Criteria:**
- [x] Button „Abonnement verwalten" startet Stripe Customer Portal Session
- [x] Im Portal: Zahlungsmethode ändern, Kündigung, Rechnungen einsehen
- [x] Nach Kündigung: Webhook `customer.subscription.deleted` aktualisiert DB-Status
- [x] Nach Kündigung: Zugangskontrolle sperrt den Account

### US-4: Zahlungsfehlschlag behandeln
Als Mandant werde ich bei Zahlungsfehlschlägen im System informiert.

**Acceptance Criteria:**
- [x] Webhook `invoice.payment_failed` setzt `payment_failed_at` in `billing_subscriptions`
- [x] In-App-Banner in Sidebar bei `past_due` Status: rot, Hinweis auf Zahlungsproblem
- [x] Link in Banner zu `/settings/abonnement` für Zahlungsmethoden-Update via Portal

### US-5: Zahlungsbestätigung verarbeiten
Als System erfasse ich erfolgreiche Stripe-Zahlungen automatisch.

**Acceptance Criteria:**
- [x] Webhook `invoice.payment_succeeded` speichert Zahlung in `billing_payments`
- [x] `payment_failed_at` wird nach erfolgreicher Zahlung auf `null` zurückgesetzt
- [x] Billing-Cache wird nach jedem Webhook-Event invalidiert

### US-6: Trial-Banner in der Sidebar
Als Mandant ohne aktives Abo sehe ich einen Hinweis-Banner in der Sidebar.

**Acceptance Criteria:**
- [x] Banner am unteren Ende der linken Sidebar (oberhalb des User-Avatars)
- [x] Status `none` (kein Abo): teal Banner „Jetzt Belegmanager-Abo sichern!"
- [x] Status `past_due`: roter Banner „Zahlungsproblem – Abo jetzt aktualisieren"
- [x] Bei aktivem Abo: kein Banner

### US-7: Zugangskontrolle
Als System stelle ich sicher, dass nur zahlende Mandanten vollen Zugang haben.

**Acceptance Criteria:**
- [x] Zugang erlaubt wenn: status = `active` ODER status = `none` (Pre-Launch-Grace)
- [x] Zugang gesperrt wenn: status = `canceled` oder `unpaid`
- [x] Zugangsprüfung im App-Layout (serverseitig via AccessGuard)
- [x] `/settings/abonnement` bleibt immer zugänglich (auch bei gesperrtem Zugang)
- [x] Blocked-View zeigt: „Abonnement erforderlich" mit Button zum Portal/Checkout

---

## Technischer Ablauf

### Checkout Flow
```
Mandant klickt "Abonnement abschließen"
→ POST /api/billing/checkout
   → Stripe Customer suchen/anlegen (upsert via billing_subscriptions.stripe_customer_id)
   → stripe.checkout.sessions.create (mode: 'subscription', price: STRIPE_PRICE_ID)
   → Response: { url }
→ Redirect zu Stripe Checkout (Hosted Page)
→ Mandant gibt Zahlungsdaten ein
→ Stripe redirectet zu /settings/abonnement?success=true
→ Webhook: checkout.session.completed → DB Update
```

### Customer Portal Flow
```
Mandant klickt "Abonnement verwalten"
→ POST /api/billing/portal
   → stripe.billingPortal.sessions.create
   → Response: { url }
→ Redirect zu Stripe Customer Portal
→ Mandant verwaltet Abo (Kündigung, Zahlungsmethode, etc.)
→ Webhooks: customer.subscription.updated/deleted → DB Update
```

### Webhook-Endpunkt
```
POST /api/billing/webhook
→ Signatur-Verifikation (STRIPE_WEBHOOK_SECRET via stripe.webhooks.constructEvent)
→ Event-Routing:
   - checkout.session.completed      → Subscription-Daten in billing_subscriptions upserten
   - customer.subscription.updated   → Status + current_period_end aktualisieren
   - customer.subscription.deleted   → Status auf canceled setzen
   - invoice.payment_succeeded       → Payment in billing_payments speichern, payment_failed_at = null
   - invoice.payment_failed          → payment_failed_at setzen
→ invalidateBillingCache(mandant_id)
```

---

## Datenbank-Schema

### Tabelle: `billing_subscriptions`
```sql
id                      uuid PRIMARY KEY
mandant_id              uuid REFERENCES mandanten(id) UNIQUE
stripe_customer_id      text (UNIQUE WHERE NOT NULL)
stripe_subscription_id  text (UNIQUE WHERE NOT NULL)
stripe_price_id         text
status                  text (active | past_due | canceled | unpaid | none)
current_period_end      timestamptz
cancelled_at            timestamptz
payment_failed_at       timestamptz
updated_at              timestamptz
created_at              timestamptz DEFAULT now()
```

### Tabelle: `billing_payments`
```sql
id                        uuid PRIMARY KEY
mandant_id                uuid REFERENCES mandanten(id)
stripe_invoice_id         text
stripe_payment_intent_id  text
amount_cents              integer
currency                  text
status                    text (paid | failed)
charge_date               date
created_at                timestamptz DEFAULT now()
```

*RLS auf allen Tabellen: Mandant sieht nur eigene Daten.*

---

## API-Routen

| Methode | Route | Beschreibung |
|---------|-------|--------------|
| POST | `/api/billing/checkout` | Stripe Checkout Session erstellen |
| POST | `/api/billing/portal` | Stripe Customer Portal Session erstellen |
| GET | `/api/billing/status` | Abo-Status + letzte 12 Zahlungen |
| POST | `/api/billing/webhook` | Stripe Webhook-Endpunkt (Signatur-Verifikation) |

---

## Billing Cache

`getBillingStatus(mandant_id)` cached das Ergebnis 30 Minuten in-memory (Map). Wird via `invalidateBillingCache(mandant_id)` nach jedem Webhook-Event geleert.

---

## Environment Variables

```env
STRIPE_SECRET_KEY=         # Stripe Secret Key (sk_test_... / sk_live_...)
STRIPE_PUBLISHABLE_KEY=    # Stripe Publishable Key (pk_test_... / pk_live_...)
STRIPE_WEBHOOK_SECRET=     # Stripe Webhook Signing Secret (whsec_...)
```

---

## Edge Cases

1. **Mandant bricht Checkout ab** → Session expired, kein Abo aktiv → Mandant kann erneut starten
2. **Webhook kommt vor Redirect** → DB wird via Webhook aktualisiert, Redirect-URL zeigt dann korrekten Status
3. **Stripe Customer bereits angelegt** → `upsert` via `mandant_id` verhindert Duplikate
4. **`current_period_end` lesen** → In Stripe SDK v22+ liegt dieses Feld auf `subscription.items.data[0].current_period_end` (nicht mehr auf `subscription` direkt)
5. **STRIPE_SECRET_KEY nicht gesetzt** → Stripe-Client ist lazy-initialized (Proxy), wirft erst beim ersten API-Call
6. **Webhook-Duplikate** → Stripe sendet Webhooks ggf. mehrfach → `upsert` und `update` sind idempotent
7. **Mandant kündigt während laufender Zahlung** → `cancel_at_period_end` via Portal; Zugang bis Period-End
8. **Pre-Launch-Grace** → Status `none` (kein Abo-Datensatz) gilt als `hasAccess = true` (wird nach Launch-Phase angepasst)

---

## Implementierung

- `src/lib/stripe.ts` — Stripe-Client (Lazy Proxy), STRIPE_PRICE_ID
- `src/lib/billing.ts` — BillingStatus-Typ, getBillingStatus(), invalidateBillingCache()
- `src/app/api/billing/checkout/route.ts` — Checkout Session
- `src/app/api/billing/portal/route.ts` — Customer Portal Session
- `src/app/api/billing/webhook/route.ts` — Webhook Handler
- `src/app/api/billing/status/route.ts` — Status + Zahlungshistorie
- `src/components/billing/access-guard.tsx` — Blocked-View bei gesperrtem Zugang
- `src/components/billing/trial-banner.tsx` — Sidebar-Banner
- `src/app/(app)/settings/abonnement/page.tsx` — Abonnement-Seite
- `supabase/migrations/20260402000003_migrate_billing_to_stripe.sql` — DB-Migration
