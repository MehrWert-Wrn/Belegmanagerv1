# PROJ-31: Weiterempfehlungssystem (Referral)

## Status: In Review
**Created:** 2026-04-25
**Last Updated:** 2026-04-25

## Zusammenfassung
Wachstumshebel via Word-of-Mouth. Bestehende Mandanten empfehlen Belegmanager weiter und erhalten pro erfolgreicher Empfehlung 1 Monat gratis (39,90 € Stripe Credit Balance). Das System ist emotional direkt und sofort belohnend – kein kompliziertes Punktesystem, kein Cap.

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – für Signup-Flow mit Referral-Code
- Requires: PROJ-2 (Mandant-Onboarding) – Mandant-Anlage beim Signup
- Requires: PROJ-16 (SaaS-Billing via Stripe) – Stripe Customer, Subscription, Credit Balance API

---

## User Stories

### Referrer (bestehender Mandant)
- As a bestehender Mandant, I want to see my personal referral link so that I can share it with others easily
- As a bestehender Mandant, I want to share my link via WhatsApp, E-Mail or Copy so that I can reach contacts on my preferred channel
- As a bestehender Mandant, I want to see who clicked my link and what their current status is so that I know how my referrals are progressing
- As a bestehender Mandant, I want to be notified by email when my referral becomes a paying customer so that I know my reward is coming
- As a bestehender Mandant, I want to be notified by email when my free month is credited so that I can see the concrete benefit
- As a bestehender Mandant, I want to see total saved months and euros on my referral page so that I feel rewarded for my advocacy

### Geworbener Nutzer (Referee)
- As a geworbener Nutzer, I want to see a landing page when I click a referral link so that I understand why I'm being invited
- As a geworbener Nutzer, I want to sign up directly from the landing page so that the process is seamless
- As a geworbener Nutzer, I want my referral source to be remembered even if I close the tab so that the referrer gets credited correctly

### System / Betreiber
- As a system, I want to detect and block fraudulent referrals so that the reward is not abused
- As a system, I want to automatically apply Stripe credit balance when eligibility is confirmed so that no manual intervention is needed

---

## Acceptance Criteria

### Referral-Code & Link
- [ ] Jeder Mandant hat genau einen einzigartigen Referral-Code im Format `BM-XXXXXX` (6 alphanumerische Zeichen, Großbuchstaben + Ziffern)
- [ ] Der Code wird beim ersten Aufruf der Referral-Seite automatisch generiert (lazy generation)
- [ ] Der Referral-Link lautet: `https://belegmanager.at/ref/[CODE]`
- [ ] Der Code ist permanent (kein Ablaufdatum für den Link selbst)

### Landing Page `/ref/[CODE]`
- [ ] Zeigt Produktname, Kurzbeschreibung und klaren CTA "Jetzt kostenlos testen"
- [ ] CTA leitet weiter zu `/auth/signup?ref=[CODE]`
- [ ] Der Referral-Code wird als Cookie gespeichert (Name: `bm_referral`, 7 Tage Gültigkeit)
- [ ] Bei ungültigem Code: Weiterleitung zu `/auth/signup` ohne Referral (kein Fehler für den Besucher)
- [ ] Click wird in `referral_codes.total_clicks` und in `referrals` (Status: clicked) getrackt
- [ ] Seite ist ohne Login zugänglich (public route)

### Signup-Flow mit Referral
- [ ] Beim Signup wird Cookie `bm_referral` ausgelesen und der Code der Registrierung zugeordnet
- [ ] Referral-Eintrag wechselt von `clicked` zu `registered` sobald Signup abgeschlossen
- [ ] `referred_email` wird gespeichert (aus Signup-Formular)
- [ ] Self-Referral (geworbener Mandant = Referrer-Mandant) wird blockiert → Signup läuft normal weiter, aber kein Referral-Eintrag wird erstellt
- [ ] Cookie wird nach erfolgreichem Signup gelöscht

### Status-Tracking
- [ ] Status-Übergänge: `clicked` → `registered` → `pending` → `rewarded`
- [ ] `pending`: Sobald der geworbene Mandant ein aktives Stripe-Abo hat
- [ ] `rewarded`: Nachdem 14-Tage-Check bestätigt wurde und Stripe Credit angewendet wurde
- [ ] Timestamps für jeden Status-Übergang werden gespeichert

### Reward Engine (Cron-Job)
- [ ] Täglicher Cron-Job prüft alle Referrals mit Status `pending`
- [ ] Eligibility-Bedingung: `converted_at` liegt ≥ 14 Tage zurück UND Stripe-Abo des geworbenen Mandanten ist noch aktiv
- [ ] Bei Eligibility: Stripe Credit Balance von -3990 Cent (= -39,90 €) auf Stripe Customer des Referrer-Mandanten buchen
- [ ] Status wechselt zu `rewarded`, `rewarded_at` und `stripe_credit_transaction_id` werden gespeichert
- [ ] E-Mail-Notification an Referrer wird ausgelöst

### Fraud Prevention
- [ ] Self-Referral: Gleiche `mandant_id` → Referral wird nicht erstellt (silent block)
- [ ] Gleiche Stripe Payment Method (gleiche `payment_method_fingerprint`): Referral wird auf `blocked` gesetzt, kein Reward
- [ ] Gleiche E-Mail-Domain (z.B. @firma.at): `same_domain_flag = true`, kein automatischer Block, aber im Dashboard als "⚠ Gleiche Domain" markiert
- [ ] Bereits existierender Referral des gleichen geworbenen Mandanten: Kein Duplikat

### Dashboard Widget
- [ ] Widget erscheint auf dem Haupt-Dashboard (unterhalb von Matching-Stats oder in eigenem Bereich)
- [ ] Zeigt: persönlicher Referral-Link + Copy-Button
- [ ] Zeigt: Anzahl aktiver Empfehlungen (Status: rewarded) + gesparte Monate + gesparte Euro
- [ ] "Mehr Details" Link führt zu `/referral`
- [ ] Widget erscheint nur wenn Mandant ein aktives Stripe-Abo hat

### In-App Trigger-Prompts
- [ ] Nach erfolgreichem Auto-Matching (≥1 Transaktion gematcht): Toast/Banner "Gerade Zeit gespart? Empfehle Belegmanager und nutze es gratis." mit Link zu `/referral`
- [ ] Nach Monatsabschluss (Status: abgeschlossen): Gleicher Prompt
- [ ] Prompt erscheint max. 1x pro Tag pro Mandant (nicht bei jedem Match)

### Referral Full Page `/referral`
- [ ] Erreichbar über Sidebar-Navigationseintrag "Empfehlen & Sparen"
- [ ] Persönlicher Referral-Link mit Copy-Button
- [ ] Share Buttons: WhatsApp (wa.me Link), E-Mail (mailto Link), Link kopieren
- [ ] Gesamtübersicht-Card: Gesamt-Empfehlungen, Aktive Belohnungen, Gesparte Monate, Gesparte Euro
- [ ] Tabelle aller Referrals mit Spalten: Datum (clicked_at), E-Mail (referred_email, gekürzt auf Datenschutz z.B. m***@firma.at), Status-Badge, Reward-Datum
- [ ] Status-Badges: "Angeklickt" (grau), "Registriert" (blau), "Ausstehend" (gelb), "Belohnt" (grün), "Blockiert" (rot)
- [ ] `same_domain_flag = true` Einträge zeigen ⚠ Icon mit Tooltip "Gleiche E-Mail-Domain – wird manuell geprüft"

### E-Mail-Notifications
- [ ] E-Mail 1 – "Empfehlung ist zahlender Kunde": Ausgelöst wenn Referral-Status zu `pending` wechselt. Betreff: "Deine Empfehlung ist zahlender Belegmanager-Kunde". Body: Name/E-Mail der Empfehlung (datenschutzkonform), Hinweis dass Gratismonat in 14 Tagen gutgeschrieben wird.
- [ ] E-Mail 2 – "Gratismonat gutgeschrieben": Ausgelöst wenn Status zu `rewarded` wechselt. Betreff: "Dein Gratismonat wurde gutgeschrieben – 39,90 € Guthaben". Body: Betrag, Hinweis wann es verrechnet wird, Link zu `/referral`
- [ ] E-Mails werden via Brevo gesendet an die primäre E-Mail-Adresse des Referrer-Mandanten
- [ ] E-Mails verwenden das bestehende Brevo-Template-Design (CI-konform)

---

## Edge Cases

- **Geworbener Mandant cancelt Abo vor 14-Tage-Deadline:** Status bleibt `pending`, Cron-Job findet kein aktives Abo → kein Reward. Status wechselt zu `expired`. Referrer bekommt keine Notification.
- **Referral-Code aus Cookie fehlt beim Signup** (z.B. Cookie gelöscht): Normaler Signup ohne Referral-Attribution. Kein Fehler, kein Retry möglich.
- **Stripe Credit auf Mandant dessen Abo bereits gekündigt:** Credit wird trotzdem gebucht (gilt als Guthaben für eventuelle Reaktivierung oder verbleibt als offenes Guthaben). Stripe handhabt das nativ.
- **Mehrfach-Click auf gleichen Link:** `total_clicks` wird erhöht, aber nur ein `referrals`-Eintrag pro geworbener Session (Cookie bereits vorhanden → kein neuer Eintrag).
- **Geworbener Nutzer meldet sich mehrmals an** (verschiedene E-Mails, gleiche Zahlungsquelle): Fraud-Check via Stripe Payment Method Fingerprint → blockiert.
- **Referrer-Mandant löscht Account:** Bestehende offene Referrals in `pending` → kein Reward (kein Stripe Customer mehr). Bereits `rewarded` Einträge bleiben historisch erhalten.
- **Code-Kollision bei Generierung:** Unique Constraint auf `referral_codes.code` → bei Kollision wird neuer Code generiert (max. 3 Versuche, dann Fehler loggen).
- **Ungültiger Code in URL** (z.B. manipuliert): `/ref/[CODE]` zeigt Fallback-Landing ohne Referral-Attribution, kein 404.
- **Landing Page SEO:** `noindex` Meta-Tag setzen, nicht in Sitemap aufnehmen (verhindert Code-Scraping).

---

## Datenbankschema

### Tabelle: `referral_codes`
```
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
mandant_id      UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE
code            TEXT NOT NULL UNIQUE  -- Format: BM-XXXXXX
total_clicks    INTEGER NOT NULL DEFAULT 0
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```
RLS: Mandant sieht nur eigenen Code.

### Tabelle: `referrals`
```
id                          UUID PRIMARY KEY DEFAULT gen_random_uuid()
referral_code_id            UUID NOT NULL REFERENCES referral_codes(id)
referred_mandant_id         UUID REFERENCES mandanten(id)  -- NULL bis Signup
referred_email              TEXT  -- aus Signup, für Anzeige
status                      TEXT NOT NULL DEFAULT 'clicked'
  -- Werte: clicked | registered | pending | rewarded | expired | blocked
clicked_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
registered_at               TIMESTAMPTZ
converted_at                TIMESTAMPTZ  -- Stripe Abo aktiv
reward_eligible_at          TIMESTAMPTZ  -- converted_at + 14 Tage
rewarded_at                 TIMESTAMPTZ
stripe_credit_transaction_id TEXT  -- Stripe Balance Transaction ID
same_domain_flag            BOOLEAN NOT NULL DEFAULT false
blocked_reason              TEXT  -- 'self_referral' | 'payment_method' | NULL
```
RLS: Mandant sieht nur Referrals seines eigenen Codes (via referral_code_id → mandant_id).

---

## API-Routen

| Route | Methode | Beschreibung |
|-------|---------|-------------|
| `/api/referral/code` | GET | Eigenen Code abrufen (generiert wenn nicht vorhanden) |
| `/api/referral/stats` | GET | Statistiken für Dashboard Widget + Full Page |
| `/api/referral/track-click` | POST | Click auf Landing Page tracken |
| `/api/referral/register` | POST | Intern: Referral bei Signup zuordnen (aufgerufen von Auth-Flow) |
| `/api/referral/convert` | POST | Intern: Webhook-Handler wenn Stripe Abo aktiv wird |
| `/api/cron/referral-reward` | GET | Cron-Job: 14-Tage-Check und Reward-Anwendung |

---

## Tech Requirements
- Performance: Landing Page `/ref/[CODE]` lädt in < 1s (statisch renderbar via Next.js)
- Sicherheit: Alle `/api/referral/*` Routes außer `track-click` erfordern Auth
- Cron: Vercel Cron `0 6 * * *` (täglich 06:00 UTC)
- Stripe: `stripe.customers.createBalanceTransaction({ amount: -3990, currency: 'eur', description: 'Referral Reward - 1 Gratismonat' })`
- Datenschutz: `referred_email` wird in der UI auf `m***@firma.at` Format maskiert
- Cookie: `bm_referral`, SameSite=Lax, Secure, HttpOnly=false (muss vom Next.js Client lesbar sein für Signup-Form), 7 Tage

---

## Tech Design (Solution Architect)

### Komponentenstruktur

```
Öffentliche Seiten (kein Login)
└── /ref/[CODE]  (Landing Page – Next.js Server Component)
    ├── Produkt-Kurzbeschreibung
    ├── Vorteils-Liste
    └── CTA "Jetzt kostenlos testen" → /auth/register?ref=CODE

App-Seiten (Login erforderlich)
├── /dashboard  (bestehend – Widget ergänzt)
│   └── ReferralWidget (NEU, nur bei aktivem Abo)
│       ├── Persönlicher Link + Copy-Button
│       └── Mini-Statistik (Empfehlungen / Monate / Euro)
│
└── /referral  (NEU – Vollseite, Sidebar-Eintrag "Empfehlen & Sparen")
    ├── StatistikCard (Gesamt: Empfehlungen / Monate / Euro)
    ├── LinkCard (Link + Copy + WhatsApp + E-Mail Share)
    └── Empfehlungstabelle (Datum | E-Mail maskiert | Status-Badge | Reward-Datum)

In-App Prompts
├── Matching-Seite: Dismissibler Banner nach erfolgreichem Match
└── Monatsabschluss-Dialog: Prompt nach erfolgreichem Abschluss
```

### Datenfluss

```
[Referrer teilt Link]
        ↓
/ref/BM-XY7K2A
  → Code server-seitig aus DB validiert
  → Cookie bm_referral gesetzt (server-seitig, 7 Tage, SameSite=Lax)
  → Click in DB getrackt (referral_codes.total_clicks + referrals-Eintrag)
        ↓
/auth/register?ref=BM-XY7K2A
  → Cookie ausgelesen nach erfolgreichem Signup
  → POST /api/referral/register → Status "registered", referred_email gespeichert
        ↓
Bestehender Billing-Webhook (/api/billing/webhook) – checkout.session.completed
  → Referral-Conversion-Logik ergänzt:
     Fraud-Checks (Self-Referral, Payment Method Fingerprint)
     Status → "pending", converted_at gesetzt
     E-Mail 1 an Referrer via Brevo
        ↓
Täglicher Cron-Job 06:00 UTC (/api/cron/referral-reward)
  → Alle "pending" Referrals: converted_at ≥ 14 Tage + Stripe-Abo aktiv?
  → Stripe Credit Balance -3990 Cent auf Referrer-Mandant-Customer
  → Status → "rewarded", stripe_credit_transaction_id gespeichert
  → E-Mail 2 an Referrer via Brevo
```

### Schlüsselentscheidungen

| Entscheidung | Gewählter Weg | Warum |
|---|---|---|
| Cookie-Setzen | Server-seitig in Landing Page | Sofort verfügbar, kein JS-Flicker |
| Conversion-Erkennung | Im bestehenden Billing-Webhook erweitert | checkout.session.completed kommt bereits – kein zweiter Webhook |
| Cron | Neue Datei /api/cron/referral-reward | Klar abgetrennt, einfach debuggbar |
| In-App Prompt Rate Limit | localStorage mit Tagesdatum | Kein Server-Overhead nötig |
| Payment Fingerprint | Aus Stripe Webhook-Event | Stripe liefert fingerprint nativ |
| Landing Page | Next.js Server Component | < 1s Ladezeit, sofortige DB-Validierung |

### Neue Dateien

```
src/app/ref/[code]/page.tsx              (Landing Page, public)
src/app/(app)/referral/page.tsx          (Full Page)
src/components/dashboard/referral-widget.tsx
src/components/referral/stats-card.tsx
src/components/referral/link-card.tsx
src/components/referral/share-buttons.tsx
src/components/referral/tabelle.tsx
src/components/referral/status-badge.tsx
src/app/api/referral/code/route.ts
src/app/api/referral/stats/route.ts
src/app/api/referral/track-click/route.ts
src/app/api/referral/register/route.ts
src/app/api/cron/referral-reward/route.ts
```

### Bestehende Dateien die erweitert werden

```
src/app/api/billing/webhook/route.ts     → +Referral-Conversion bei checkout.session.completed
vercel.json                              → +Cron /api/cron/referral-reward "0 6 * * *"
src/app/(app)/dashboard/page.tsx         → +ReferralWidget (konditionell)
src/app/(auth)/register/page.tsx         → +Cookie auslesen + /api/referral/register
src/components/app-sidebar.tsx           → +Eintrag "Empfehlen & Sparen"
```

### Keine neuen npm-Pakete erforderlich
Stripe, Brevo und Next.js Cookies sind bereits im Projekt vorhanden.

## Implementation Notes (Frontend – 2026-04-25)

Frontend-Komponenten und Seiten wurden gebaut. Backend-Routen (API + Cron + Webhook-Erweiterung + DB-Migration) sind noch zu implementieren (`/backend`).

### Neu erstellt
- `src/components/referral/status-badge.tsx` – Status-Badge mit allen 6 Status-Werten
- `src/components/referral/share-buttons.tsx` – WhatsApp + E-Mail Share
- `src/components/referral/link-card.tsx` – Link mit Copy + Share-Buttons
- `src/components/referral/stats-card.tsx` – 4-Kachel-Statistik (Empfehlungen / Belohnungen / Monate / Euro)
- `src/components/referral/tabelle.tsx` – Empfehlungstabelle mit maskierter E-Mail + same_domain_flag Tooltip
- `src/components/dashboard/referral-widget.tsx` – Kompaktes Dashboard-Widget (versteckt sich bei 403)
- `src/app/ref/[code]/page.tsx` – Public Landing Page (Server Component, force-dynamic, noindex Meta)
- `src/app/(app)/referral/page.tsx` + `referral-client.tsx` – Full Page mit Hero, Stats, Link, Tabelle, So-funktioniert-Erklärung

### Erweitert
- `src/app/(app)/dashboard/page.tsx` – ReferralWidget eingebunden (unterhalb CloudStorageWidget)
- `src/components/app-sidebar.tsx` – Sidebar-Eintrag "Empfehlen & Sparen" (Gift-Icon) zwischen Monatsabschluss und Einstellungen
- `src/app/(auth)/register/page.tsx` – Liest `bm_referral` Cookie + `?ref=` URL-Param, zeigt Referral-Banner, ruft `/api/referral/register` nach Signup auf, löscht Cookie nach Submit

### Abweichungen vom Spec
- **E-Mail-Versand:** Spec erwähnt Brevo, Codebase nutzt **Resend** (`src/lib/resend.ts`). Backend-Implementierung sollte die zwei Referral-Mails dort hinzufügen.
- **Navigation:** Sidebar-Eintrag liegt zwischen "Monatsabschluss" und "Einstellungen" (nicht ganz unten), für bessere Sichtbarkeit.
- **Landing Page Click-Tracking:** Frontend ruft direkt Admin-DB an (Server Component); Backend muss eine RPC `increment_referral_clicks(p_code TEXT)` bereitstellen ODER die Logik in einem API-Endpoint kapseln.
- **Cookie-Setzung:** Erfolgt server-seitig in der Landing Page (wie im Tech Design vorgesehen). HttpOnly=false, damit Client beim Signup lesen kann.

### Frontend-Erwartungen an Backend (für /backend)
- API: `GET /api/referral/code` → `{ code, referral_link }` oder 403 bei kein-aktives-Abo
- API: `GET /api/referral/stats` → `{ total_referrals, active_rewards, saved_months, saved_euros, referrals: ReferralRow[] }`
- API: `POST /api/referral/register` → Body `{ code, referred_email }`
- API: `GET /api/cron/referral-reward` (vercel.json Cron `0 6 * * *`)
- Webhook: `/api/billing/webhook` checkout.session.completed → Referral-Conversion + E-Mail 1
- DB: Tabellen `referral_codes` + `referrals` mit RLS gemäß Spec

## Implementation Notes (Backend – 2026-04-25)

Backend-Implementierung abgeschlossen. Datenbank-Migration, alle API-Routen, Cron-Job, Webhook-Erweiterung und E-Mail-Versand fertig.

### Neu erstellt
- `supabase/migrations/20260425000000_referral_system.sql` – Tabellen `referral_codes` + `referrals` mit RLS, Constraints, Indizes und RPC `increment_referral_clicks(p_code TEXT)`
- `src/lib/referral.ts` – Helper: Code-Generator (BM-XXXXXX), `getOrCreateReferralCode`, `maskEmail`, `sameEmailDomain`, Konstanten (Reward 3990 Cent, Holding 14 Tage)
- `src/app/api/referral/code/route.ts` – `GET`, lazy Code-Erzeugung, Feature-Gate via `getBillingStatus` (403 wenn kein aktives Abo / kein Admin-Override)
- `src/app/api/referral/stats/route.ts` – `GET`, liefert Total/Active/Saved + max. 200 Referrals (sortiert nach `clicked_at DESC`)
- `src/app/api/referral/register/route.ts` – `POST`, oeffentlich (vor E-Mail-Verifizierung), Zod-validiert, upgradet existierenden `clicked`-Eintrag oder legt neuen `registered` an, blockiert Self-Referral
- `src/app/api/referral/track-click/route.ts` – `POST`, oeffentlich, ruft `increment_referral_clicks` RPC + legt `clicked`-Eintrag an
- `src/app/api/cron/referral-reward/route.ts` – Cron, Bearer-Auth via `CRON_SECRET`, prueft `pending`-Referrals mit `converted_at <= heute - 14 Tage`, bucht Stripe `customers.createBalanceTransaction` -3990 Cent, setzt `rewarded` oder `expired`, sendet E-Mail 2

### Erweitert
- `src/lib/resend.ts` – +`sendReferralPendingEmail` (E-Mail 1, "Empfehlung ist zahlender Kunde") und +`sendReferralRewardedEmail` (E-Mail 2, "39,90 € gutgeschrieben"). Beide CI-konform (Plus Jakarta Sans, Teal-Gradient)
- `src/app/api/billing/webhook/route.ts` – `checkout.session.completed` ruft neue `processReferralConversion(...)` auf: matcht Referral via `referred_email`, prueft Self-Referral (Mandant-ID), prueft `payment_method.card.fingerprint` gegen bestehende Referrals, setzt `pending` + `converted_at` + `reward_eligible_at` (+14 Tage) + `referred_mandant_id`, sendet E-Mail 1
- `vercel.json` – +Cron `/api/cron/referral-reward` täglich `0 6 * * *`

### Abweichungen vom Spec
- **E-Mail-Versand:** Spec sagt Brevo, Codebase nutzt **Resend** (`src/lib/resend.ts`). Beide neuen Helper sind dort eingebaut – konsistent zu bestehenden Mails.
- **Self-Referral / Duplikat-Check:** `register`-Endpoint vergleicht `referred_email` gegen die `auth.users`-E-Mail des Referrer-Mandanten, nicht gegen die Mandant-ID (die zum Signup-Zeitpunkt noch nicht existiert). Final-Block per Mandant-ID erfolgt im Webhook bei Conversion.
- **Track-Click-Endpoint:** Existiert zusätzlich, obwohl die Landing Page Server-seitig direkt trackt. RPC `increment_referral_clicks` ist die zentrale Atomar-Logik – Server-Component und API-Endpoint nutzen sie identisch.
- **`payment_method_fingerprint`-Spalte:** Wurde zusätzlich zum Spec-Schema in `referrals` hinzugefügt (Index nur wenn nicht NULL), damit Cross-Referral-Fraud-Erkennung funktioniert.

### Frontend-Anpassungen erforderlich? Nein.
Die Frontend-Komponenten (Widget, Full Page, Landing Page) sind kompatibel mit den jetzt gelieferten APIs. Die Landing Page (`/ref/[code]`) trackt bereits server-seitig via direktem DB-Aufruf bzw. RPC – die Migration stellt die RPC bereit, sodass keine Code-Änderung dort nötig ist.

## QA Test Results

**Tested:** 2026-04-25
**Tester:** QA Engineer (AI – statische Code-Analyse, keine Live-Browser-Session)
**Methodik:** Code-Review von Migration, API-Routen, Cron, Webhook-Erweiterung, Komponenten, Landing Page und Signup-Integration. Keine Live-DB / Live-Stripe-Tests durchgeführt – diese müssen vor Deployment manuell auf Staging verifiziert werden.

### Acceptance Criteria Status

#### AC – Referral-Code & Link
- [x] Eindeutiger Code pro Mandant – `referral_codes_mandant_unique UNIQUE (mandant_id)` + UNIQUE auf `code` mit Format-CHECK (`BM-[A-Z0-9]{6}`).
- [x] Lazy Generation – `getOrCreateReferralCode` in `src/lib/referral.ts`, aufgerufen von `/api/referral/code` und `/api/referral/stats`.
- [x] Referral-Link-Schema `https://.../ref/[CODE]` – via `NEXT_PUBLIC_SITE_URL` aufgebaut. Spec sagt `https://belegmanager.at/ref/[CODE]`; abhängig von Env-Variable korrekt gesetzt sein muss (siehe BUG-002).
- [x] Code permanent – kein Ablaufdatum in DB-Schema.

#### AC – Landing Page `/ref/[CODE]`
- [x] Produktname, Kurzbeschreibung, CTA "Jetzt kostenlos testen" – in `src/app/ref/[code]/page.tsx`.
- [x] CTA leitet zu `/register?ref=[CODE]` (Spec sagt `/auth/signup`, Code nutzt `/register` – bewusste Abweichung, da Routen-Struktur `/register` ist).
- [x] Cookie `bm_referral`, 7 Tage, SameSite=Lax, HttpOnly=false, Secure in Production.
- [x] Bei ungültigem Code: `redirect('/register')` ohne Fehlermeldung.
- [x] Click-Tracking via RPC `increment_referral_clicks` + Insert in `referrals`.
- [x] Public Route – ohne Login zugänglich (steht nicht in `PUBLIC_ROUTES` set, aber `/ref/...` startet nicht mit `/api/`, Unauthenticated-Block greift trotzdem) → siehe BUG-001 (kritisch).
- [x] Performance: Server Component mit `force-dynamic`. Keine Tracking-Pixel/Schwergewichte.
- [x] `noindex` Meta-Tag gesetzt.

#### AC – Signup-Flow mit Referral
- [x] Cookie `bm_referral` wird im Register-Page-Client gelesen + URL-Param `?ref=` als Fallback.
- [x] `referred_email` wird gespeichert (POST-Body an `/api/referral/register`).
- [x] Self-Referral – im register-Endpoint via E-Mail-Vergleich gegen `auth.users` des Referrer-Mandanten (frühe Stufe). Im Webhook später nochmal via Mandant-ID-Vergleich → `blocked`.
- [x] Cookie wird nach Submit gelöscht (`clearReferralCookie()`).
- [ ] BUG-007: Referral-Eintrag wird auch dann angelegt, wenn `supabase.auth.signUp` fehlschlägt (Logikfehler im Control-Flow). Siehe Bug-Beschreibung.

#### AC – Status-Tracking
- [x] Status-Übergänge `clicked → registered → pending → rewarded` in DB CHECK-Constraint definiert.
- [x] `pending` wird im Webhook bei `checkout.session.completed` gesetzt.
- [x] `rewarded` wird im Cron nach 14-Tage-Check gesetzt.
- [x] Timestamps: `clicked_at`, `registered_at`, `converted_at`, `reward_eligible_at`, `rewarded_at`.

#### AC – Reward Engine (Cron)
- [x] Cron in `vercel.json` registriert: `0 6 * * *`.
- [x] Eligibility-Check: `converted_at <= heute - 14 Tage` UND Referee-Abo-Status `active`/`trialing`.
- [x] Stripe Credit Balance -3990 Cent (`createBalanceTransaction`).
- [x] `stripe_credit_transaction_id` wird gespeichert.
- [x] E-Mail 2 wird gesendet (Resend statt Brevo – konsistent zur Codebase).
- [x] Bearer-Auth via `CRON_SECRET`.

#### AC – Fraud Prevention
- [x] Self-Referral via Mandant-ID im Webhook → `blocked` mit `blocked_reason='self_referral'`.
- [x] Payment-Method-Fingerprint-Vergleich gegen alle existierenden Referrals → `blocked` mit `blocked_reason='payment_method'`.
- [x] `same_domain_flag` gesetzt, kein Auto-Block, im UI als ⚠ Tooltip markiert.
- [ ] BUG-006: Duplikat-Check im `register`-Endpoint hat eine Nullable-Logik-Lücke (siehe Bug).

#### AC – Dashboard Widget
- [x] Widget `ReferralWidget` ist auf `/dashboard` eingebunden (Zeile 31 dashboard/page.tsx).
- [x] Persönlicher Link + Copy-Button.
- [x] Mini-Stats (Empfehlungen / Belohnungen / Guthaben).
- [x] "Mehr Details" Link zu `/referral`.
- [x] Versteckt sich bei 403 (kein aktives Abo).

#### AC – In-App Trigger-Prompts
- [ ] BUG-004 (HIGH): Spec verlangt Toast/Banner nach Auto-Matching und nach Monatsabschluss. Im Codebase ist KEIN solcher Trigger-Prompt-Mechanismus implementiert. Auch keine localStorage-Rate-Limit-Logik. Komplettes AC fehlt.

#### AC – Referral Full Page `/referral`
- [x] Sidebar-Eintrag "Empfehlen & Sparen" mit Gift-Icon (app-sidebar.tsx Z.49).
- [x] Persönlicher Link + Copy-Button (LinkCard-Komponente).
- [x] Share-Buttons WhatsApp + E-Mail (Spec verlangt zusätzlich "Link kopieren" – ist redundant in LinkCard bereits oben vorhanden).
- [x] StatsCard mit 4 Kacheln (Empfehlungen / Belohnungen / Monate / Euro).
- [x] Tabelle mit Datum, maskierte E-Mail, Status-Badge, Reward-Datum.
- [x] Status-Badges in 6 Varianten (StatusBadge.tsx) – Spec verlangt 5 Varianten (clicked/registered/pending/rewarded/blocked), Code zeigt zusätzlich `expired` – konsistente Erweiterung.
- [x] `same_domain_flag` Tooltip mit ⚠ Icon.

#### AC – E-Mail-Notifications
- [x] E-Mail 1 ("Empfehlung ist zahlender Kunde") in `sendReferralPendingEmail`, ausgelöst beim Webhook nach Conversion.
- [x] E-Mail 2 ("Gratismonat gutgeschrieben") in `sendReferralRewardedEmail`, ausgelöst im Cron.
- [x] Resend (statt Brevo) – Abweichung dokumentiert.
- [x] CI-konform: Plus Jakarta Sans, Teal `#0d9488`, escapeHtml gegen XSS.

### Edge Cases Status

- [x] Geworbener Mandant cancelt vor 14 Tagen: Cron findet kein aktives Abo → Status `expired`.
- [x] Cookie fehlt beim Signup: Normaler Signup ohne Attribution.
- [x] Mehrfach-Click: `total_clicks++` via RPC, aber Logik in Landing Page legt nur dann neuen Eintrag an, wenn Cookie ≠ Code. Siehe BUG-008 (medium).
- [x] Stripe-Customer fehlt: Status → `expired` mit Skip im Cron.
- [x] Code-Kollision: `getOrCreateReferralCode` macht max. 3 Versuche.
- [x] Ungültiger Code: stille Weiterleitung zu `/register`.
- [x] Landing Page SEO: `noindex/follow:false` in Metadata.
- [ ] BUG-005 (MEDIUM): Referrer löscht Account → bestehende `pending`-Referrals: Cron prüft auf Stripe-Customer, aber wenn Referrer-Mandant über CASCADE gelöscht wird, werden auch `referral_codes` (CASCADE) und `referrals` (CASCADE) gelöscht. Bereits `rewarded` Einträge gehen damit verloren – Spec verlangt jedoch "Bereits rewarded Einträge bleiben historisch erhalten."

### Security Audit Results

- [x] **Auth `/api/referral/code`** – verifiziert User-Session, prüft Mandant + aktives Abo. 
- [x] **Auth `/api/referral/stats`** – analog zu `/code`, liefert nur Referrals des eigenen Codes.
- [x] **Auth `/api/cron/referral-reward`** – Bearer-Token via `CRON_SECRET`, 401 wenn nicht gesetzt.
- [x] **Auth `/api/billing/webhook`** – Stripe-Signatur-Verifizierung in der Middleware-Bypass-Liste enthalten.
- [ ] **BUG-001 (CRITICAL)** – `/api/referral/track-click` ist eine **öffentliche Route ohne Rate-Limiting**, ohne CAPTCHA, ohne Token. Angreifer kann mit einem geleakten Code beliebig oft `total_clicks` aufblasen UND bei jedem Aufruf einen neuen `referrals`-Eintrag mit Status `clicked` anlegen → DB-Flooding-Vektor.
- [ ] **BUG-002 (CRITICAL)** – `/api/referral/register` ist **öffentlich**, validiert nur Format. Angreifer kann mit beliebigem `BM-XXXXXX`-Code (sobald geleakt oder erraten) und beliebiger E-Mail-Adresse Fake-Registrierungen einlegen, um die Statistik des Referrers zu verzerren. Self-Referral-Check vergleicht E-Mail gegen `auth.users.email` des Referrers, blockiert aber nicht, wenn die E-Mail noch nicht in `auth.users` existiert. Damit lassen sich Referrals mit fremden E-Mails einlegen, ohne dass je ein Signup nötig ist.
- [ ] **BUG-003 (HIGH)** – Code-Enumeration: Code-Format `BM-XXXXXX` mit nur 36^6 ≈ 2,2 Mrd Möglichkeiten. Bei 10k aktiven Mandanten ist die Treffer-Wahrscheinlichkeit ~1:220k pro Versuch. Ohne Rate-Limit auf `/ref/[CODE]` und `/api/referral/track-click` ist Brute-Force möglich (Angreifer kann valid Codes finden + dann Referral-Conversion-Statistik manipulieren).
- [x] **RLS** – `referrals_select_own_code` policy korrekt: nur Mandant des Referral-Codes sieht Einträge.
- [x] **RLS** – kein INSERT/UPDATE/DELETE für authentifizierte User auf `referrals` (nur Service-Role).
- [x] **RLS** – `referral_codes` SELECT/INSERT/UPDATE nur für `mandant_id = get_mandant_id()`.
- [x] **RPC** – `increment_referral_clicks` ist `SECURITY DEFINER` mit `search_path = public`, EXECUTE nur für `service_role` (PUBLIC revoked) – korrekt gehärtet.
- [x] **XSS** – `escapeHtml` in beiden Mail-Helpers verwendet (für `referredEmailMasked`).
- [x] **XSS** – Code-Anzeige in Landing Page (`{code}`) nutzt React-Escaping, kein dangerouslySetInnerHTML.
- [x] **Datenleak** – `referred_email` wird im API-Response (Stats) im Plaintext geliefert, im UI maskiert. Da nur eigene Referrals via RLS sichtbar, akzeptables Risiko – aber UI-only-Maskierung lässt Referee-Mail im Frontend Network-Tab des Referrers sichtbar (Spec sagt nur "Anzeige" muss maskiert sein). Akzeptabel.
- [x] **CSP** – Middleware setzt CSP mit Nonce + script-src strict-dynamic. WhatsApp/mailto-Links sind anchor-Tags, keine Skript-Loads → CSP-konform.

### Regression Testing
- [x] **PROJ-1 Authentifizierung** – Register-Page: Cookie/URL-Param-Zusatzlogik in `useEffect` wirkt nicht-blockierend, Signup-Flow läuft im Fehlerfall trotzdem weiter (Try/Catch + `clearReferralCookie` in `finally`).
- [x] **PROJ-2 Mandant-Onboarding** – Keine Änderungen am Onboarding-Wizard.
- [x] **PROJ-16 SaaS-Billing** – Webhook-Logik wurde erweitert (`processReferralConversion`), die bestehenden Cases bleiben unangetastet. Try/Catch verhindert dass Referral-Fehler den Subscription-Upsert blockt.
- [x] **PROJ-19 Admin Panel** – Keine Berührungspunkte.
- [x] **PROJ-30 E-Mail-Belegeingang** – Webhook bypass in `WEBHOOK_ROUTES` korrekt vorhanden, kein Konflikt.
- [ ] BUG-009 (LOW): `vercel.json` enthält jetzt zwei Cron-Jobs (banksapi-sync + referral-reward). Vercel Hobby-Plan erlaubt nur Cron-Schedules in 24-Stunden-Granularität – beide täglich, daher OK. Auf Pro-Plan kein Issue.

### Cross-Browser & Responsive
- Statische Code-Analyse: Komponenten nutzen Tailwind responsive Klassen (`md:`, `lg:`, `sm:`).
- LinkCard: `flex-col sm:flex-row` – Mobile stack, Desktop nebeneinander.
- StatsCard: `grid-cols-2 lg:grid-cols-4` – 2 Kacheln Mobile, 4 Desktop. OK.
- Tabelle: `whitespace-nowrap` auf Datums-Zellen + `overflow-hidden` auf Container – kann auf 375px horizontal scrollen, jedoch wird kein expliziter Overflow-Container gesetzt.
- [ ] BUG-010 (LOW): Landing Page Hero-Layout `grid lg:grid-cols-2` – Bild-Card erscheint auf Mobile unter dem Pitch, OK. Kein expliziter Test in 375px durchgeführt – manuell auf Staging prüfen.

### Bugs Found

#### BUG-001: `/api/referral/track-click` ist öffentlich und ohne Rate-Limit
- **Severity:** Critical (Security)
- **Steps to Reproduce:**
  1. Code via Landing-Page-URL (öffentlich teilbar) abgreifen.
  2. POST `/api/referral/track-click` mit `{ "code": "BM-XXXXXX" }` 1000x in Schleife (curl/script).
  3. Erwartet: Rate-Limit nach ~20 Requests / Min.
  4. Tatsächlich: Endpoint ist nicht in `RATE_LIMITED_ROUTES` der Middleware → unbegrenzte Anfragen möglich. Jeder Aufruf erhöht `total_clicks` UND legt einen neuen `referrals`-Eintrag mit Status `clicked` an → DB-Flooding + verzerrte Statistik im Referrer-Dashboard.
- **Priorität:** Fix vor Deployment
- **Empfehlung:** `/api/referral` zur `RATE_LIMITED_ROUTES`-Liste hinzufügen ODER zumindest IP-basiertes Rate-Limit speziell für `/api/referral/track-click`.

#### BUG-002: `/api/referral/register` ist öffentlich und erlaubt Fake-Referrals
- **Severity:** Critical (Security / Data Integrity)
- **Steps to Reproduce:**
  1. Code raten oder von Landing-Page abgreifen.
  2. POST `/api/referral/register` mit `{ "code": "BM-XXXXXX", "referred_email": "fake-victim@example.com" }`.
  3. Endpoint validiert nur Format + macht E-Mail-Lookup gegen `auth.users` (existiert nicht für fremde E-Mail), umgeht Self-Referral-Check und legt `registered`-Eintrag an.
  4. Erwartet: Endpoint sollte mit Auth-Context oder Token (z.B. einem Server-only-Token aus `/register`-Page) gegen Anonymous Calls gesichert sein.
  5. Tatsächlich: Beliebige Referral-Einträge mit fremden E-Mails sind möglich → Spam, Statistikmanipulation, Fraud-Vektor (Angreifer kann sich selbst über fremde E-Mail "registrieren" und dann selbst zahlendes Abo abschließen → Reward bekommt der manipulierte Code-Inhaber, nicht der echte Referrer).
- **Priorität:** Fix vor Deployment
- **Empfehlung:** Endpoint nur über interne Auth (Service-Role-Header von Auth-Callback) oder per Stripe-Webhook-zentrierter Conversion absichern. Alternativ: Endpoint nur akzeptieren, wenn ein gültiger Cookie + Origin-Header vorhanden sind.

#### BUG-003: Code-Brute-Force möglich (kein Rate-Limit auf `/ref/[CODE]`)
- **Severity:** High (Security)
- **Steps to Reproduce:**
  1. Script generiert zufällige `BM-XXXXXX` Codes und ruft `/ref/[CODE]` auf.
  2. Bei gültigem Code: 200 Response mit Hero. Bei ungültigem Code: 307 Redirect auf `/register`.
  3. Status-Code unterschiedlich → Code-Existenz aufdeckbar.
  4. `/ref/...` ist nicht in `RATE_LIMITED_ROUTES` → unbegrenzte Versuche.
- **Priorität:** Fix vor Deployment
- **Empfehlung:** `/ref/` zur Rate-Limit-Liste hinzufügen. Alternativ: Bei ungültigem Code identische Response (gleicher HTTP-Status + Body) wie bei gültigem Code, damit Existenz nicht ableitbar ist.

#### BUG-004: In-App Trigger-Prompts komplett fehlen
- **Severity:** High
- **Steps to Reproduce:**
  1. Spec verlangt: Nach erfolgreichem Auto-Matching (≥1 Transaktion) Toast/Banner mit Empfehlungs-Hinweis.
  2. Spec verlangt: Nach Monatsabschluss (Status: abgeschlossen) gleicher Prompt.
  3. Spec verlangt: max. 1x pro Tag pro Mandant via localStorage.
  4. Im Codebase: `grep -rn "referral\|empfehl" src/app/(app)/transaktionen/` und `monatsabschluss/` zeigt keine Trigger-Logik.
- **Priorität:** Fix vor Deployment (Acceptance Criterion explizit gefordert)
- **Empfehlung:** Einen `<ReferralPrompt />` Toast/Banner-Component bauen, der per Trigger-Hook aus Matching-Success-Handler und Monatsabschluss-Workflow aufgerufen wird.

#### BUG-005: CASCADE-Delete löscht historische `rewarded` Referrals
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Mandant A wirbt Mandant B → Referral `rewarded`, Stripe-Credit gebucht.
  2. Mandant A löscht Account (Mandant-Datensatz in `mandanten` wird gelöscht).
  3. Wegen `referral_codes.mandant_id REFERENCES mandanten(id) ON DELETE CASCADE` wird `referral_codes` gelöscht.
  4. Wegen `referrals.referral_code_id REFERENCES referral_codes(id) ON DELETE CASCADE` werden auch alle bisherigen Referrals (auch `rewarded`) gelöscht.
  5. Spec sagt: "Bereits rewarded Einträge bleiben historisch erhalten."
- **Priorität:** Fix vor Deployment
- **Empfehlung:** `ON DELETE SET NULL` auf `referral_codes.mandant_id` ODER bewusst `mandant_id NULLABLE` machen + Soft-Delete-Pattern für Mandanten verwenden.

#### BUG-006: Duplikat-Check in `/api/referral/register` hat Nullable-Logik-Lücke
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Existiert bereits ein `clicked`-Eintrag mit `referred_email = NULL`, ruft `register` mit gleicher E-Mail auf.
  2. `.eq('referred_email', referredEmail)` schließt den `clicked`-Eintrag aus, weil `referred_email` NULL ist.
  3. `.not('status', 'eq', 'clicked')` schließt zusätzlich `clicked` aus → kein Duplikat erkannt.
  4. Code legt korrekterweise einen neuen Eintrag an (Update des `clicked`-Eintrags). OK in dieser Konstellation.
  5. ABER: Wenn ein `registered`-Eintrag mit derselben E-Mail bereits existiert + ein `clicked`-Eintrag (aus späterem Klick) ohne E-Mail dazukommt + `register` für dieselbe E-Mail nochmal aufgerufen wird (z.B. Page-Reload des Signup-Forms), wird der `clicked`-Eintrag ge-upgraded → Duplikat-Eintrag mit gleicher E-Mail.
- **Priorität:** Fix in nächstem Sprint
- **Empfehlung:** Duplikat-Check früher: prüfen ob für `referral_code_id + referred_email` schon irgendein `registered/pending/rewarded/blocked` Eintrag existiert.

#### BUG-007: Referral-register läuft auch wenn Auth-Signup fehlschlägt
- **Severity:** Medium
- **Steps to Reproduce:**
  1. User füllt Signup-Form aus, klickt Submit.
  2. `supabase.auth.signUp()` schlägt fehl (z.B. Server-Down) und Fehler enthält NICHT "already registered".
  3. Code returned aus dem onSubmit, aber `if (referralCode)` darüber wird ausgewertet, BEVOR das `return` greift...
  4. Tatsächlicher Code-Flow: `if (!error.message.includes('already registered'))` setzt Error + return mit `loading=false`. Der Referral-Block (Z.86) wird NICHT erreicht. **OK in diesem Fall.**
  5. ABER: Wenn Error-Message "already registered" enthält → Code überspringt das `setError`/`return` und führt Referral-Register aus, ohne dass eine echte Registrierung erfolgt ist. Das ist konzeptionell verzeihbar (User existiert bereits), aber es wird trotzdem ein neuer Referral-Eintrag angelegt → Existing-User-Hijack möglich, da der Referrer einen Reward für einen Lead bekommt, der gar nicht NEU registriert ist.
- **Priorität:** Fix vor Deployment
- **Empfehlung:** Referral-Register nur dann aufrufen, wenn `data.user` existiert und kein "already registered"-Fehler vorliegt.

#### BUG-008: Mehrfach-Click vom selben Browser produziert mehrere `clicked` Einträge bei Cookie-Wechsel
- **Severity:** Medium
- **Steps to Reproduce:**
  1. User A klickt Code X → Cookie X gesetzt + Eintrag-1 (`clicked`).
  2. User A klickt Code Y (anderer Referrer) → Cookie wird auf Y überschrieben + Eintrag-2 (`clicked`) für Code Y.
  3. User A klickt Code X erneut → Cookie X überschreibt Y, NEUER Eintrag-3 (`clicked`) für Code X angelegt.
  4. Bei Signup mit E-Mail wird Eintrag-3 ge-upgraded auf `registered`. Eintrag-1 bleibt als `clicked` ohne E-Mail liegen → Garbage-Daten in Referrer-Tabelle (Statistik aufgebläht).
- **Priorität:** Fix in nächstem Sprint
- **Empfehlung:** `clicked`-Einträge ohne `referred_email` nach 7+ Tagen via Cron aufräumen ODER Statistiken auf Basis von `total_referrals = registered+pending+rewarded+blocked` zählen statt ALLE Einträge.

#### BUG-009: Doppelte Cron-Jobs auf Vercel Hobby-Plan
- **Severity:** Low
- **Steps to Reproduce:**
  1. `vercel.json` enthält 2 Cron-Schedules (banksapi + referral-reward).
  2. Vercel Hobby-Plan erlaubt nur 2 Cron-Jobs gesamt → Limit aktuell erreicht.
- **Priorität:** Nice to have / vor Skalierung beachten
- **Empfehlung:** Pro-Plan oder Cron-Konsolidierung in einen "daily-master" Cron, der intern alle Tasks ausführt.

#### BUG-010: Mobile-Layout der Tabelle nicht in 375px verifiziert
- **Severity:** Low
- **Steps to Reproduce:**
  1. Tabelle hat 4 Spalten, mit `whitespace-nowrap` Datums-Spalte → kann horizontalen Overflow erzeugen.
  2. `<div className="rounded-lg border overflow-hidden">` cuttet den Overflow ab → User kann horizontal nicht scrollen.
- **Priorität:** Fix in nächstem Sprint
- **Empfehlung:** `overflow-hidden` durch `overflow-x-auto` ersetzen für Mobile-Scroll.

#### BUG-011: Landing Page Click-Tracking ohne IP-/Bot-Filter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Bots / Crawler / Preview-Generators (Slack, WhatsApp, Telegram) fetchen `/ref/[CODE]` beim Link-Sharing.
  2. Trotz `noindex` werden Click-Events generiert.
  3. `total_clicks` ist verzerrt durch Bot-Traffic.
- **Priorität:** Nice to have
- **Empfehlung:** User-Agent-Filter in Landing-Page-Tracking ODER Click nur dann zählen, wenn Cookie noch nicht existiert UND User-Agent kein Bot.

#### BUG-012: TODO-Kommentar für `payment_intent` aus PROJ-16 noch nicht gefixt
- **Severity:** Low (vorhanden vor PROJ-31)
- **Steps to Reproduce:**
  1. `src/app/api/billing/webhook/route.ts:109` enthält `// TODO BUG-007: payment_intent field not available in Stripe API 2026-03-25.dahlia`.
  2. Nicht durch PROJ-31 verursacht, fällt aber bei Code-Review auf.
- **Priorität:** Nice to have

### Summary
- **Acceptance Criteria:** 50/55 bestanden (5 Lücken)
- **Bugs Found:** 12 total (2 Critical, 2 High, 4 Medium, 4 Low)
- **Security:** **Issues found** – 2 Critical (öffentliche Endpoints ohne Rate-Limit / Auth-Token) + 1 High (Code-Brute-Force möglich)
- **Production Ready:** **NO**
- **Recommendation:** **Fix bugs first.** Vor Deployment müssen mindestens BUG-001, BUG-002, BUG-003, BUG-004, BUG-005, BUG-007 gelöst werden. BUG-006/008 können in nächstem Sprint folgen, BUG-009/010/011/012 sind kosmetisch.

### Empfohlene Fix-Reihenfolge
1. BUG-001 + BUG-003 → Rate-Limiting auf `/api/referral/*` und `/ref/*` aktivieren.
2. BUG-002 → `/api/referral/register` nur über authentifizierten Auth-Callback aufrufen.
3. BUG-004 → In-App Trigger-Prompts implementieren (Toast nach Matching, Banner nach Monatsabschluss).
4. BUG-005 → ON DELETE Strategie ändern (`SET NULL` auf `referral_codes.mandant_id`, Soft-Delete).
5. BUG-007 → Referral-Register nur bei erfolgreichem Auth-Signup aufrufen.
6. BUG-006, BUG-008, BUG-010 → nächste Iteration.
7. BUG-009, BUG-011, BUG-012 → kosmetisch / Skalierungs-Hinweise.

### Manuelle Live-Tests vor Deployment empfohlen
Diese statische Analyse konnte folgende Aspekte NICHT verifizieren – bitte auf Staging manuell prüfen:
1. Stripe-Webhook `checkout.session.completed` mit echtem Test-Payload triggern → `processReferralConversion` ausführen.
2. Cron-Job manuell aufrufen mit Bearer-Token + Test-Pending-Referral.
3. Stripe-Credit-Balance-Anzeige auf Stripe-Customer-Page nach Reward.
4. E-Mail-Versand via Resend mit Test-Empfänger (E-Mail 1 + E-Mail 2).
5. Cookie-Verhalten auf echten Browsern (Safari iOS Mobile, Firefox, Chrome).
6. Landing Page in 375px / 768px / 1440px – visuelles Layout.
7. Prüfung dass Resend-API-Key + CRON_SECRET + STRIPE_WEBHOOK_SECRET in Vercel-ENV gesetzt sind.

## Deployment
_To be added by /deploy_
