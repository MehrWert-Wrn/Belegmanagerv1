# PROJ-21: Onboarding-Checkliste am Dashboard

## Status: In Review
**Created:** 2026-04-14
**Last Updated:** 2026-04-15

## Implementation Notes (Backend)
- **Migration:** `supabase/migrations/20260415000000_onboarding_progress.sql`
  - Tabelle `onboarding_progress` mit UNIQUE `mandant_id` FK (ON DELETE CASCADE), 5 Boolean-Flags, `dismissed_at`, `created_at`, `updated_at`
  - RLS aktiv mit `get_mandant_id()` fuer SELECT / INSERT / UPDATE / DELETE
  - Index `idx_onboarding_progress_mandant` auf `mandant_id`
  - Trigger `trg_onboarding_progress_updated_at` (SECURITY DEFINER, `search_path = public`)
- **API-Endpoints:** `src/app/api/onboarding/progress/route.ts`
  - `GET /api/onboarding/progress` -> liefert Progress oder **404** wenn kein Eintrag existiert (Opt-in fuer Bestands-Mandanten)
  - `PATCH /api/onboarding/progress` mit Zod-Validierung (z.union):
    - `{ step_key }` -> einzelnen Schritt auf `true` setzen, kein Rueckgaengigmachen
    - `{ action: 'dismiss' }` -> `dismissed_at` setzen, nur bei 5/5 erlaubt (sonst 400)
  - Bereits dismissed -> 409 bei weiteren PATCH-Versuchen
  - Auth via `requireAuth` + `getMandantId` aus `@/lib/auth-helpers`
- **Integration in `/api/onboarding` POST:** Nach Mandant- und mandant_users-Upsert wird ein `onboarding_progress`-Row per INSERT angelegt. Unique-Violation (23505) wird tolerant behandelt (Re-Submit). Fehler sind non-fatal.
- **Opt-in-Mechanismus:** Bestands-Mandanten haben keine Zeile in `onboarding_progress` und sehen dadurch die Checkliste nicht (GET liefert 404, Frontend rendert `null`).

## Implementation Notes (Frontend)
- **Component:** `src/components/onboarding/onboarding-checkliste.tsx` (Client Component)
- **Integration:** Eingebunden in `src/app/(app)/dashboard/page.tsx` zwischen Header und TicketsUebersicht
- **shadcn/ui verwendet:** Card, Accordion, Progress, Checkbox, Button, Badge, Tooltip, Skeleton (alle bereits installiert, keine neuen Installs nötig)
- **States implementiert:** Loading (Skeleton), Error (mit Retry-Button), Empty (gibt `null` zurück wenn 404/no progress row oder bereits dismissed)
- **Optimistisches UI:** Beim Abhaken eines Schrittes wird der State sofort aktualisiert und bei Fehler rollback via Toast
- **API-Calls (noch nicht implementiert – Backend-Handoff):**
  - `GET /api/onboarding/progress` → Status laden (404 = kein Eintrag = Checkliste nicht anzeigen)
  - `PATCH /api/onboarding/progress` mit `{ step_key }` → einzelnen Schritt abhaken
  - `PATCH /api/onboarding/progress` mit `{ action: 'dismiss' }` → Checkliste permanent schließen
- **5 Schritte:** E-Mail-Adresse, E-Mail-Postfach-Anbindung (3 Provider-Buttons), Firmendaten, WhatsApp (mit Copy-Button & wa.me-Link), Portalanbindungen (mit Badge & Meeting-Button)
- **Team-Sektion:** Teamfoto-Fallback auf "M+"-Initialen falls `/team/mehrwert-team.jpg` nicht existiert
- **Dismiss-Button:** Disabled mit Tooltip "Bitte alle Schritte abschließen" solange < 100%, aktiv erst bei 5/5
- **Responsive:** Mobile-friendly durch Accordion, Team-Sektion wechselt von flex-col zu flex-row ab `sm`
- **Accessibility:** `aria-valuenow` auf Progress-Bar, keyboard-navigierbare Accordion via shadcn, aria-label auf Checkboxen
- **Links zu Hilfe-Center:** `/help/email-anbindung-{microsoft-365|gmail|imap}` (PROJ-22)

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – eingeloggter User mit `mandant_id`
- Requires: PROJ-2 (Mandant-Onboarding) – `mandanten`-Datensatz muss existieren
- Relates to: PROJ-22 (Hilfe-Center) – Links zu E-Mail-Anbindungsartikeln

---

## Overview

Nach der Erstanmeldung erscheint am Dashboard eine temporäre Onboarding-Checkliste, die dem neuen Mandanten die nächsten Schritte für die Aktivierung der automatisierten Belegerfassung zeigt. Die Checkliste zeigt einen Fortschrittsbalken, kann schrittweise abgearbeitet werden und verschwindet endgültig, wenn alle Schritte erledigt und der Mandant sie manuell schließt.

Zweck: Mandanten schnellstmöglich zu aktivieren, damit das Mehr.Wert-Team die automatisierte Belegerfassung freischalten kann.

---

## User Stories

### US-1: Onboarding-Checkliste beim ersten Login
Als neuer Mandant möchte ich nach meiner Erstanmeldung eine klare Checkliste sehen, damit ich weiß, welche Schritte ich für die Aktivierung der automatisierten Belegerfassung durchführen muss.

**Acceptance Criteria:**
- [ ] Die Onboarding-Checkliste erscheint auf dem Dashboard direkt nach der Erstanmeldung (oberhalb der bestehenden Dashboard-Inhalte)
- [ ] Die Sektion zeigt einen Fortschrittsbalken mit Prozentsatz (z.B. „2 von 5 Schritten – 40%")
- [ ] Jeder Schritt ist als Card oder Accordion-Element dargestellt mit Titel und Beschreibung
- [ ] Abgehakte Schritte werden visuell als erledigt markiert (Haken, durchgestrichen oder eingeklappt)
- [ ] Die Checkliste bleibt über Sessions hinweg bestehen (Fortschritt in DB gespeichert)
- [ ] Einleitungstext: „Du kannst nun 30 Tage kostenlos unsere Belegmanager Software testen. Bitte versuche so schnell wie möglich, uns deine Zugangsdaten bzw. die geforderten Daten unten zuzusenden, damit wir dir die automatisierte Belegerfassung freischalten können."

### US-2: Schritte einzeln abhaken
Als Mandant möchte ich jeden Onboarding-Schritt individuell als erledigt markieren können, damit ich meinen Fortschritt sehen kann.

**Acceptance Criteria:**
- [ ] Jeder Schritt hat einen Checkbox oder „Als erledigt markieren"-Button
- [ ] Nach dem Abhaken eines Schritts aktualisiert sich der Fortschrittsbalken sofort
- [ ] Erledigte Schritte können nicht deaktiviert werden (kein Rückgängigmachen)
- [ ] Fortschritt wird in Echtzeit in `onboarding_progress` (DB-Tabelle) gespeichert
- [ ] Visuelles Feedback beim Abhaken (Animation oder Farbwechsel)

### US-3: Checkliste schließen bei 100%
Als Mandant möchte ich die Onboarding-Checkliste schließen können, sobald alle Schritte erledigt sind, damit sie nicht mehr das Dashboard belegt.

**Acceptance Criteria:**
- [ ] Bei 100% Fortschritt erscheint ein „Checkliste schließen"-Button
- [ ] Nach dem Schließen verschwindet die Sektion dauerhaft vom Dashboard (in DB gespeichert: `onboarding_dismissed = true`)
- [ ] Beim nächsten Login ist die Checkliste nicht mehr sichtbar
- [ ] Solange nicht alle 5 Schritte erledigt sind, ist der „Schließen"-Button nicht verfügbar

### US-4: Onboarding-Inhalte anzeigen
Als Mandant möchte ich zu jedem Schritt klare Informationen und Anweisungen sehen, damit ich weiß, was ich tun muss.

**Acceptance Criteria:**

**Schritt 1 – E-Mail-Adresse für Belege:**
- [ ] Titel: „E-Mail-Adresse für Belege"
- [ ] Beschreibung: „Empfehlung: Eine reine Rechnungs-Mailadresse, an die alle Belege einlangen."
- [ ] Textfeld oder Hinweis-Feld zur Eingabe / Notiz der E-Mail-Adresse (informativer Charakter)

**Schritt 2 – E-Mail-Postfach Anbindung:**
- [ ] Titel: „Daten für Anbindung an das E-Mail-Postfach"
- [ ] Drei Optionen als Buttons/Links: Microsoft 365 | Gmail | IMAP
- [ ] Jeder Button verlinkt auf den entsprechenden Hilfe-Center-Artikel (PROJ-22)
- [ ] Hinweis: „Klicke auf deinen E-Mail-Anbieter für eine Schritt-für-Schritt-Anleitung"

**Schritt 3 – Firmendaten:**
- [ ] Titel: „Firmendaten"
- [ ] Beschreibung: „Firmenanschrift (wie auf Rechnungen) & UID-Nummer"
- [ ] Link zu den Einstellungen oder Hinweis, diese an das Mehr.Wert-Team zu senden

**Schritt 4 – WhatsApp-Nummer:**
- [ ] Titel: „WhatsApp-Nummer für DSGVO-konforme Belegübergabe"
- [ ] Beschreibung: „Speichert euch dazu die Nummer der Mehr.Wert Gruppe GmbH ein: +4367761906498 und sendet uns ganz einfach pro Beleg ein Bild oder Datei an diese Nummer."
- [ ] Klickbare WhatsApp-Nummer als Link (`https://wa.me/4367761906498`)
- [ ] Optionaler Copy-Button für die Nummer

**Schritt 5 – Portalanbindungen (optional):**
- [ ] Titel: „Portalanbindungen (optional)"
- [ ] Badge: „+5€ netto pro Portalanbindung"
- [ ] Beschreibung: „Falls vorhanden: Benutzername & Passwort für Amazon, Lieferanten-Portale, etc."
- [ ] Hinweis: „Bitte Meeting vereinbaren für die gemeinsame Portalanbindung"
- [ ] Button „Meeting vereinbaren" mit Link: `https://cal.meetergo.com/pkindlmayr/15-min-meeting-onboarding-belegerfassung`

### US-5: Team-Vertrauen aufbauen
Als neuer Mandant möchte ich sehen, dass ein echtes Team hinter dem Service steht, damit ich Vertrauen in die Dienstleistung habe.

**Acceptance Criteria:**
- [ ] Unterhalb der Checkliste (oder als letzter Abschnitt) eine „Du bist in guten Händen"-Sektion
- [ ] Teamfoto wird angezeigt (Bild-Datei aus `/public/team/`)
- [ ] Text: „Unser Team kümmert sich persönlich um dein Anliegen."
- [ ] Meeting-Link als CTA-Button: „Jetzt 15-Min-Meeting buchen" → `https://cal.meetergo.com/pkindlmayr/15-min-meeting-onboarding-belegerfassung`

### US-6: Checkliste für bestehende Mandanten ausgeblendet
Als bestehender Mandant, der das Onboarding bereits abgeschlossen hat, möchte ich die Checkliste nicht mehr sehen, damit das Dashboard übersichtlich bleibt.

**Acceptance Criteria:**
- [ ] Wenn `onboarding_dismissed = true` in der DB: Checkliste wird nicht gerendert
- [ ] Wenn `mandant` schon vor PROJ-21-Deployment existierte: Checkliste wird nicht angezeigt (Opt-in, nicht Opt-out)
- [ ] Neuer Mandant = Erstlogin nach Deployment von PROJ-21

---

## Edge Cases

- **Mandant schließt Browser mitten im Abhaken:** Fortschritt ist in DB gespeichert, beim nächsten Login ist der Stand wiederhergestellt
- **Mandant versucht, Checkliste bei < 100% zu schließen:** „Schließen"-Button ist disabled, mit Tooltip: „Bitte alle Schritte abschließen"
- **Teamfoto nicht verfügbar:** Fallback auf Placeholder-Avatar oder Text-Only-Sektion
- **Hilfe-Center (PROJ-22) noch nicht deployed:** Links zeigen auf `/help` (404 bis PROJ-22 live), Fallback-Text statt Link
- **Mandant auf Mobile:** Checkliste ist responsive, Accordion-Layout auf kleinen Screens
- **Mehrere User eines Mandanten:** Onboarding-Status ist mandanten-weit, nicht pro User (ein User hakt ab → alle sehen es erledigt)

---

## Technical Requirements
- **Storage:** Neue Tabelle `onboarding_progress` mit `mandant_id`, `step_key` (enum), `completed_at`, `dismissed_at`
- **RLS:** `mandant_id`-basiert, kein Datenleck zwischen Mandanten
- **Performance:** Laden des Onboarding-Status < 200ms (eigener API-Call beim Dashboard-Load)
- **Accessibility:** Alle Schritte per Keyboard navigierbar, Fortschrittsbalken mit `aria-valuenow`

---

## Tech Design (Solution Architect)

### Component Structure (Visual Tree)

```
DashboardPage (Server Component – src/app/(app)/dashboard/page.tsx)
  ├── OnboardingCheckliste (Client Component) [NUR wenn progress-Eintrag existiert UND nicht dismissed]
  │     ├── Einleitungstext-Card
  │     ├── Progress-Bar (shadcn/ui <Progress> + aria-valuenow)
  │     ├── Accordion (shadcn/ui <Accordion>) – 5 Steps
  │     │     ├── Step 1 – E-Mail-Adresse für Belege (Checkbox + Beschreibung)
  │     │     ├── Step 2 – E-Mail-Postfach anbinden (3 Provider-Buttons → Help-Center)
  │     │     ├── Step 3 – Firmendaten (Checkbox + Beschreibung)
  │     │     ├── Step 4 – WhatsApp-Nummer (Checkbox + klickbarer wa.me-Link)
  │     │     └── Step 5 – Portalanbindungen (Checkbox + Badge + Meeting-Button)
  │     ├── „Checkliste schließen"-Button (disabled solange < 100%)
  │     └── TeamSektion
  │           ├── Teamfoto (<img> aus /public/team/ oder Avatar-Fallback)
  │           ├── Text: „Unser Team kümmert sich persönlich um dein Anliegen."
  │           └── CTA-Button „Jetzt 15-Min-Meeting buchen" (externer Link)
  └── TicketsUebersicht (bestehend, unverändert)
```

### Data Model (plain language)

**Tabelle: `onboarding_progress`** (eine Zeile pro Mandant)

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid (PK) | Auto-generiert |
| `mandant_id` | uuid (FK → mandanten, UNIQUE) | Ein Eintrag pro Mandant |
| `email_address_done` | boolean (default false) | Schritt 1 abgehakt |
| `email_connection_done` | boolean (default false) | Schritt 2 abgehakt |
| `company_data_done` | boolean (default false) | Schritt 3 abgehakt |
| `whatsapp_done` | boolean (default false) | Schritt 4 abgehakt |
| `portal_connections_done` | boolean (default false) | Schritt 5 abgehakt |
| `dismissed_at` | timestamptz (nullable) | Gesetzt beim manuellen Schließen |
| `created_at` | timestamptz | Auto-generiert |

**Warum eine Zeile pro Mandant (nicht eine pro Schritt):**
Einfacherer Single-Query-Zugriff, atomic updates, und `dismissed_at` gehört logisch zum Mandant, nicht zu einem einzelnen Schritt. Performance < 200ms garantiert.

**Opt-in-Mechanismus:**
Ein `onboarding_progress`-Eintrag wird **nur** beim erfolgreichen POST auf `/api/onboarding` (Mandant-Anlage) miterstellt. Bestehende Mandanten ohne Eintrag → Checkliste unsichtbar.

### API Design

| Methode | Route | Zweck |
|---|---|---|
| `GET` | `/api/onboarding/progress` | Aktuellen Fortschritt laden (mandant_id aus Session) |
| `PATCH` | `/api/onboarding/progress` | Schritt abhaken (`step_key`) ODER Checkliste schließen (`action: "dismiss"`) |

**Bestehende Route `/api/onboarding` (POST):** Wird erweitert um das Anlegen des `onboarding_progress`-Eintrags am Ende der Mandant-Erstellung. Kein Breaking Change.

### Tech Decisions (justified)

| Entscheidung | Warum |
|---|---|
| shadcn `<Accordion>` für Steps | Mobile-freundlich, keyboard-navigierbar, kein Custom-Code nötig |
| shadcn `<Progress>` für Fortschritt | Inkl. `aria-valuenow` für Accessibility, passt CI-Palette |
| shadcn `<Badge>` für „+5€ netto" | Bereits installiert, kein Extra-Aufwand |
| shadcn `<Checkbox>` für Abhaken | Konsistent mit dem Rest der App |
| Einzel-Zeile pro Mandant (keine Multi-Row) | Atomic, ein JOIN, kein Aggregat nötig |
| Client Component für Checkliste | Optimistisches UI-Update beim Abhaken ohne Page-Reload |
| RLS auf mandant_id | Konsistent mit allen anderen Tabellen; kein Datenleck |

### Dependencies

Keine neuen npm-Pakete erforderlich – alle benötigten shadcn/ui-Komponenten sind bereits installiert:
- `<Accordion>`, `<Progress>`, `<Badge>`, `<Checkbox>`, `<Button>`, `<Card>`, `<Tooltip>` ✓

### Database Migration

Neue Datei: `supabase/migrations/20260415000000_onboarding_progress.sql`
- Tabelle `onboarding_progress` anlegen
- Enum für step_key (als check constraint oder direkte boolean-Spalten)
- RLS aktivieren (SELECT / INSERT / UPDATE nur für eigenen Mandanten)
- Composite-Index auf `mandant_id`

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
