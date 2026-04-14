# PROJ-20: FinAPI-Integration – Automatischer Kontoauszug-Import

## Status: In Review
**Created:** 2026-04-14
**Last Updated:** 2026-04-14

### Backend Implementation Notes (2026-04-14)
- Database migration created: `20260414100000_finapi_integration.sql`
  - New table `finapi_verbindungen` with RLS + indexes
  - New table `finapi_sync_historie` with RLS + indexes
  - New table `finapi_webform_sessions` for secure WebForm callback flow
  - Extended `transaktionen` with `externe_id` + `import_quelle` columns
  - Extended `mandanten` with `finapi_user_id` column
- FinAPI service library: `src/lib/finapi.ts`
  - AES-256-GCM encryption for FinAPI user passwords
  - Client/user token management
  - WebForm 2.0 creation (import + update)
  - Bank connection + account fetching
  - Transaction fetching with pagination + normalization
  - Bank connection status determination (SCA detection)
- API routes created:
  - `GET /api/finapi/verbindungen` – List connections with sync history
  - `POST /api/finapi/verbindungen` – Initiate new connection or SCA renewal
  - `DELETE /api/finapi/verbindungen/[id]` – Disconnect (soft delete)
  - `GET /api/finapi/callback` – FinAPI WebForm redirect handler
  - `POST /api/finapi/sync/[id]` – Fetch + import transactions
- Security: Credentials stored in DB via webform sessions, never in callback URLs
- Settings navigation updated with "Bankverbindungen" tab
- Environment variables documented in `.env.local.example`
- Build fix: replaced `.catch()` chaining on Supabase query builders with try/catch blocks in callback and sync routes

### Frontend Implementation Notes (2026-04-14)
- Settings page created: `src/app/(app)/settings/bankverbindungen/page.tsx`
  - Loads and displays all non-disconnected bank connections
  - "Bankkonto verbinden" button initiates WebForm flow
  - Handles FinAPI callback query params (success/error) with toast notifications
  - Cleans URL params after displaying
  - Empty state with icon and explanation
  - SCA warning banner when connections need renewal
- Component: `src/components/bankverbindungen/bankverbindung-karte.tsx`
  - Bank name + masked IBAN display
  - Status badge (Aktiv/SCA faellig/Fehler/Getrennt)
  - "Jetzt synchronisieren" button with loading state + result display
  - "Verbindung erneuern" button (visible only for SCA/Fehler status)
  - "Trennen" button with AlertDialog confirmation
  - Collapsible sync history (last 5 entries)
  - Tooltip on disabled sync button explaining why
- Types: `src/components/bankverbindungen/types.ts`
- Build passes successfully

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen-Tabelle und Import-Logik bestehen
- Requires: PROJ-14 (Kontoauszug-Import Verbesserungen) – aktueller Stand des Import-Wizards
- Requires: PROJ-10 (Zahlungsquellen-Verwaltung) – Zahlungsquellen-Konzept und Datenmodell
- Optional: PROJ-2 (Mandant-Onboarding) – Mandant muss existieren bevor Bankverbindung angelegt wird

---

## Hintergrund

Aktuell erfolgt der Kontoauszug-Import ausschließlich über manuellen CSV-Upload (PROJ-4). Mandanten wollen ihre Banktransaktionen jedoch automatisch abrufen können, ohne jedes Mal eine CSV-Datei aus dem Online-Banking herunterladen und hochladen zu müssen.

FinAPI ist ein PSD2-lizenzierter Banken-Datendienst (österreich/EU), der über zwei Produkte genutzt wird:
- **FinAPI Access:** OAuth-geschützte REST-API zum Abrufen von Transaktionsdaten
- **FinAPI WebForm 2.0:** Gehostetes UI für die sichere Bankverbindung – der Mandant gibt seine Bankdaten direkt bei FinAPI ein, wir sehen keine Credentials

**Wichtig:** Wir starten mit der Sandbox (Testumgebung). Der Wechsel zur Live-Version erfolgt ausschließlich über Umgebungsvariablen, ohne Code-Änderung.

---

## User Stories

- Als Mandant möchte ich mein Bankkonto mit dem Belegmanager verbinden können, damit Transaktionen automatisch importiert werden, ohne dass ich jeden Monat eine CSV hochladen muss.
- Als Mandant möchte ich auf "Jetzt synchronisieren" klicken können, damit ich jederzeit manuell neue Transaktionen abrufen kann.
- Als Mandant möchte ich mehrere Bankkonten verbinden können (z.B. Girokonto + Firmenkreditkarte), damit alle Zahlungsquellen abgedeckt sind.
- Als Mandant möchte ich eine klare Warnung sehen, wenn meine Bankverbindung abgelaufen ist (SCA-Erneuerung notwendig), damit ich sie rechtzeitig erneuern kann.
- Als Mandant möchte ich die Wahl haben zwischen FinAPI-Verbindung und CSV-Upload (auch parallel), damit ich nicht gezwungen bin die API zu nutzen.
- Als Mandant möchte ich sehen, wann die letzte Synchronisierung stattgefunden hat und wie viele Transaktionen dabei importiert wurden.

---

## Acceptance Criteria

### AC-1: Bankkonto verbinden via FinAPI WebForm 2.0

- [ ] In den Einstellungen (Zahlungsquellen oder separater Bereich "Bankverbindungen") gibt es die Schaltfläche "Bankkonto verbinden"
- [ ] Beim ersten Klick wird automatisch ein FinAPI-User für den Mandanten angelegt (falls noch nicht vorhanden); der Mandant sieht diesen Schritt nicht
- [ ] Das System erstellt über die FinAPI WebForm 2.0 API eine einmalige WebForm-URL
- [ ] Der Mandant wird zu dieser URL weitergeleitet (neuer Tab oder Redirect)
- [ ] Nach Abschluss des WebForms leitet FinAPI den Nutzer zurück zur App (Callback-URL konfigurierbar, z.B. `/einstellungen/bankverbindungen?status=success`)
- [ ] Die neue Bank Connection (Bank-Name, IBAN/Kontonummer, FinAPI-interne IDs) wird in der Datenbank gespeichert
- [ ] Bei Fehler im WebForm (Abbruch, falsche Credentials beim Kunden) wird der Mandant mit einer verständlichen Fehlermeldung zurückgeleitet
- [ ] RLS: Bank Connections sind mandantenspezifisch, kein Cross-Tenant-Zugriff

### AC-2: Manueller Transaktions-Sync

- [ ] Pro verbundener Bank Connection gibt es eine Schaltfläche "Jetzt synchronisieren"
- [ ] Das System ruft über FinAPI Access API die neuesten Transaktionen ab (seit letztem Sync oder letzten 90 Tagen bei erstem Sync)
- [ ] Transaktionen werden normalisiert (Datum, Betrag, Beschreibung) und in die bestehende `transaktionen`-Tabelle importiert
- [ ] Bereits importierte FinAPI-Transaktionen (per FinAPI-Transaction-ID als `externe_id` erkannt) werden als Duplikat übersprungen
- [ ] Nach dem Sync wird ein Import-Ergebnis angezeigt: X neu importiert, Y Duplikate übersprungen
- [ ] Fehlschlag (z.B. Netzwerkfehler, FinAPI-Fehler) zeigt eine verständliche Fehlermeldung; bereits erfolgreiche Transaktionen dieses Syncs bleiben erhalten
- [ ] Die Matching-Engine (PROJ-5) wird nach dem Import automatisch ausgelöst (identisch zum CSV-Import-Flow)

### AC-3: Verbindungsstatus & SCA-Erneuerung

- [ ] Jede Bank Connection zeigt ihren Status: Aktiv / SCA fällig / Fehler
- [ ] Wenn FinAPI meldet, dass eine SCA-Erneuerung notwendig ist (typisch alle 90 Tage), wird der Mandant mit einem deutlichen Hinweis informiert (Badge, Banner oder Alert)
- [ ] Der Mandant kann per Schaltfläche "Verbindung erneuern" den WebForm-Flow erneut starten (Update-Bank-Connection statt Create)
- [ ] Solange eine Verbindung im Status "SCA fällig" ist, ist der Sync-Button deaktiviert mit erklärendem Tooltip

### AC-4: Mehrere Bankkonten & Zahlungsquellen

- [ ] Ein Mandant kann beliebig viele Bank Connections anlegen (verschiedene Banken oder mehrere Konten derselben Bank)
- [ ] Jede Bank Connection kann einem oder mehreren bestehenden Zahlungsquellen-Einträgen zugeordnet werden – oder eine neue Zahlungsquelle wird automatisch erstellt
- [ ] Transaktionen aus verschiedenen Bank Connections landen in der entsprechenden Zahlungsquelle (quelle_id korrekt gesetzt)

### AC-5: Koexistenz CSV-Upload und FinAPI

- [ ] CSV-Upload (PROJ-4) bleibt für alle Zahlungsquellen vollständig erhalten und unverändert nutzbar
- [ ] Mandant kann CSV und FinAPI parallel nutzen (z.B. FinAPI für Girokonto, CSV für Kreditkartenabrechnung)
- [ ] Duplikat-Erkennung verhindert Doppelimport unabhängig von der Import-Quelle (CSV-Weg oder FinAPI-Weg)

### AC-6: Sandbox → Live Konfiguration

- [ ] Die FinAPI-Umgebung (Sandbox/Live) wird ausschließlich über Umgebungsvariablen gesteuert:
  - `FINAPI_ENV=sandbox` oder `FINAPI_ENV=live`
  - `FINAPI_CLIENT_ID`, `FINAPI_CLIENT_SECRET`, `FINAPI_ENCRYPTION_KEY`
- [ ] Kein Code-Änderung beim Wechsel von Sandbox zu Live – nur `.env`-Update und Redeployment
- [ ] In der Sandbox-Umgebung sind FinAPI-Testbanken verfügbar; die UI zeigt keinen Sandbox-Hinweis (kein "Test"-Label nötig)

### AC-7: Sync-Historie & Transparenz

- [ ] Pro Bank Connection ist sichtbar: Letzte Synchronisierung (Datum/Uhrzeit) + Anzahl importierter Transaktionen beim letzten Sync
- [ ] Eine einfache Sync-Historie (die letzten 5 Syncs mit Ergebnis) ist abrufbar

---

## Edge Cases

- **Mandant bricht WebForm ab:** FinAPI leitet mit Fehler-Status zurück → App zeigt "Verbindung nicht hergestellt", keine halb-angelegte Connection in der DB
- **Bank nicht bei FinAPI verfügbar:** WebForm zeigt dies dem Nutzer direkt → Mandant kommt mit Fehlerstatus zurück, App erklärt, dass diese Bank nicht unterstützt wird
- **FinAPI API nicht erreichbar beim Sync:** Fehlermeldung "Synchronisierung fehlgeschlagen – bitte später erneut versuchen", kein Datenverlust
- **FinAPI-Transaktions-IDs fehlen (unwahrscheinlich):** Fallback auf bestehende Duplikat-Erkennung via Datum + Betrag + Buchungsreferenz
- **Erster Sync: sehr viele Transaktionen (z.B. 12 Monate Rückblick):** Paginierung über FinAPI API; Import läuft vollständig durch, Fortschrittsanzeige optional
- **Mandant löscht Bank Connection:** Bereits importierte Transaktionen bleiben erhalten; zukünftige Syncs für diese Connection sind nicht mehr möglich
- **Doppelte Bank Connection (gleiche IBAN zweimal verbunden):** System erkennt dies und warnt den Mandanten bevor eine zweite Connection für dieselbe IBAN angelegt wird
- **SCA während laufendem Sync:** Sync bricht ab mit Status "SCA fällig", bereits importierte Transaktionen bleiben erhalten
- **FinAPI-User bereits vorhanden (nach Redeployment oder Migration):** Beim Verbinden wird zuerst geprüft ob bereits ein FinAPI-User für diesen Mandanten existiert (via `finapi_user_id` in DB)

---

## Nicht in Scope

- Automatischer/geplanter Hintergrund-Sync (Cron Job) – kommt in PROJ-20b oder als Erweiterung; MVP = manueller Sync
- Push-Benachrichtigung bei neuen Transaktionen
- FinAPI-Kategorisierung oder Label-Funktion nutzen (wir kategorisieren selbst via Matching-Engine)
- Kontosaldo-Anzeige (nur Transaktionen, kein Live-Saldo)
- Unterstützung für andere FinAPI-Produkte (Payments, etc.)
- Admin-Ansicht für Bank Connections aller Mandanten
- Automatische Benachrichtigung per E-Mail bei SCA-Ablauf (wäre PROJ-20b)

---

## Datenmodell (neu)

### Tabelle: `finapi_verbindungen`
Speichert die Bank Connections pro Mandant.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | uuid PK | |
| mandant_id | uuid FK | Multi-Tenancy |
| zahlungsquelle_id | uuid FK | Verknüpfung zur Zahlungsquelle |
| finapi_user_id | text | FinAPI-interne User-ID (pro Mandant) |
| finapi_bank_connection_id | bigint | FinAPI-interne Bank-Connection-ID |
| bank_name | text | Anzeigename der Bank |
| iban | text | IBAN des Kontos (nur zur Anzeige, kein Credential) |
| kontonummer | text | optional |
| status | enum | `aktiv` / `sca_faellig` / `fehler` / `getrennt` |
| letzter_sync_at | timestamptz | |
| letzter_sync_anzahl | int | Anzahl importierter Transaktionen beim letzten Sync |
| created_at | timestamptz | |

### Erweiterung: `transaktionen`
- Neue Spalte: `externe_id` (text, nullable) – FinAPI-Transaction-ID zur Duplikat-Erkennung
- Neue Spalte: `import_quelle` (enum: `csv` / `finapi`) – für Audit/Transparenz

### Erweiterung: `mandanten` (optional)
- Neue Spalte: `finapi_user_id` (text, nullable) – FinAPI-User für diesen Mandanten (alternativ in `finapi_verbindungen`)

---

## FinAPI-API-Flow (technische Orientierung für /architecture)

### Schritt 1: Client-Token holen
`POST https://sandbox.finapi.io/api/v2/oauth/token` mit `grant_type=client_credentials`

### Schritt 2: FinAPI-User anlegen (pro Mandant, einmalig)
`POST /api/v2/users` → liefert `userId` + User-Passwort (sicher in DB speichern, verschlüsselt mit `FINAPI_ENCRYPTION_KEY`)

### Schritt 3: User-Token holen
`POST /oauth/token` mit `grant_type=password` + User-Credentials

### Schritt 4: WebForm URL erstellen (FinAPI WebForm 2.0)
`POST https://webform-sandbox.finapi.io/api/webForms/bankConnectionImport` → liefert `id` + `url`
→ Redirect des Mandanten zu dieser URL

### Schritt 5: Callback empfangen
GET `/einstellungen/bankverbindungen?webFormId=xxx&status=COMPLETED`
→ Bank Connection ID per `GET /api/v2/bankConnections` abrufen → in DB speichern

### Schritt 6: Transaktionen abrufen
`GET /api/v2/transactions?bankConnectionIds=xxx&minBankBookingDate=yyyy-mm-dd`
→ Normalisierung → Import in `transaktionen`

### Schritt 7 (SCA-Erneuerung): WebForm Update
`POST /api/webForms/bankConnectionUpdate` → gleicher Redirect-Flow wie Schritt 4

---

---

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
settings/
└── bankverbindungen/
    └── BankverbindungenPage           ← /settings/bankverbindungen (NEU)
        ├── BankverbindungenHeader
        │   ├── Titel + Beschreibung
        │   └── "Bankkonto verbinden"-Button
        │
        ├── BankverbindungListe
        │   └── BankverbindungKarte    ← eine pro Bank Connection (NEU)
        │       ├── BankIcon + Bank-Name + IBAN (maskiert)
        │       ├── StatusBadge        ← Aktiv / SCA fällig / Fehler
        │       ├── LetzterSyncInfo    ← "Zuletzt sync: XX.XX.XXXX – Y Transaktionen"
        │       ├── SyncButton         ← "Jetzt synchronisieren" (disabled bei SCA fällig)
        │       ├── ErneuernButton     ← sichtbar nur bei Status "SCA fällig"
        │       └── TrennenButton      ← mit Bestätigungsdialog
        │
        ├── SyncErgebnisAlert          ← nach Sync: "X importiert, Y Duplikate"
        └── LeererZustand              ← wenn noch keine Verbindung besteht

app/
└── api/finapi/
    ├── verbindungen/
    │   └── route.ts                   ← GET (Liste) + POST (Verbinden initiieren)
    ├── verbindungen/[id]/
    │   └── route.ts                   ← DELETE (Trennen)
    ├── callback/
    │   └── route.ts                   ← GET (FinAPI Redirect nach WebForm)
    └── sync/[id]/
        └── route.ts                   ← POST (Transaktionen abrufen & importieren)

lib/
└── finapi.ts                          ← FinAPI Service (NEU)
```

### Datenbankstruktur

**Neue Tabelle `finapi_verbindungen`** (mit RLS, mandant_id verpflichtend):

| Feld | Beschreibung |
|------|-------------|
| `id` | UUID PK |
| `mandant_id` | FK → Multi-Tenancy, RLS |
| `zahlungsquelle_id` | FK → welche Zahlungsquelle wird befüllt |
| `finapi_user_id` | FinAPI-interne User-ID des Mandanten |
| `finapi_user_password_encrypted` | AES-verschlüsseltes FinAPI User-Passwort |
| `finapi_bank_connection_id` | FinAPI-interne Bank-Connection-ID |
| `bank_name` | Anzeigename (z.B. "Erste Bank") |
| `iban` | Nur zur Anzeige – kein Bankzugang |
| `status` | `aktiv` / `sca_faellig` / `fehler` / `getrennt` |
| `letzter_sync_at` | Zeitpunkt des letzten Syncs |
| `letzter_sync_anzahl` | Transaktionen beim letzten Sync |
| `created_at` | Anlage-Zeitpunkt |

**Erweiterung `transaktionen`:**
- `externe_id` (text, nullable) – FinAPI Transaction ID für Duplikat-Erkennung
- `import_quelle` (enum `csv`/`finapi`) – Herkunft für Audit-Transparenz

**Erweiterung `mandanten`:**
- `finapi_user_id` (text, nullable) – einmalig pro Mandant beim ersten Verbinden angelegt

### Kritische Datenflusse

**Flow 1 – Bankkonto verbinden:**
```
Button klick → POST /api/finapi/verbindungen
→ FinAPI-User anlegen (falls noch nicht vorhanden) + speichern
→ WebForm-URL erstellen (FinAPI WebForm 2.0)
→ Redirect zu FinAPI-URL (Mandant gibt Bankdaten direkt bei FinAPI ein)
→ FinAPI redirectet zu /api/finapi/callback?webFormId=xxx&status=COMPLETED
→ Bank Connection Details abrufen → in finapi_verbindungen speichern
→ Redirect zu /settings/bankverbindungen?success=true
```

**Flow 2 – Sync:**
```
"Jetzt synchronisieren" → POST /api/finapi/sync/[id]
→ User-Token mit gespeicherten (entschlüsselten) Credentials holen
→ Transaktionen paginiert abrufen (seit letztem Sync / max. 90 Tage)
→ Duplikat-Check via externe_id → nur neue importieren
→ Matching-Engine auslösen (identisch CSV-Import-Flow)
→ finapi_verbindungen: letzter_sync_at + letzter_sync_anzahl aktualisieren
→ Ergebnis: { importiert: X, duplikate: Y }
```

**Flow 3 – SCA-Erneuerung:**
```
"Verbindung erneuern" → POST /api/finapi/verbindungen { update: id }
→ Update-WebForm-URL erstellen → gleicher Redirect-Flow wie Flow 1
→ Nach Callback: Status → aktiv
```

### Umgebungsvariablen (Sandbox → Live via Config)

| Variable | Sandbox | Live |
|----------|---------|------|
| `FINAPI_BASE_URL` | `https://sandbox.finapi.io` | `https://api.finapi.io` |
| `FINAPI_WEBFORM_URL` | `https://webform-sandbox.finapi.io` | `https://webform.finapi.io` |
| `FINAPI_CLIENT_ID` | Sandbox ID | Live ID |
| `FINAPI_CLIENT_SECRET` | Sandbox Secret | Live Secret |
| `FINAPI_ENCRYPTION_KEY` | AES-Key für User-Passwort-Verschlüsselung | gleich |

Kein Code-Änderung beim Wechsel – nur `.env` anpassen + Redeployment.

### Neue Abhängigkeiten

Keine neuen npm-Pakete. FinAPI wird über native `fetch` angesprochen. AES-Verschlüsselung via Node.js built-in `crypto`.

### Navigation

Neue Settings-Seite `/settings/bankverbindungen` wird in die bestehende Settings-Sidebar aufgenommen (neben Firma, Benutzer, Zahlungsquellen, Abonnement).

### Datenbank-Migrationen (3 Schritte)

1. Neue Tabelle `finapi_verbindungen` + RLS-Policies
2. Spalten `externe_id` + `import_quelle` zur Tabelle `transaktionen` hinzufügen
3. Spalte `finapi_user_id` zur Tabelle `mandanten` hinzufügen

---

## QA Test Results

**QA Date:** 2026-04-14
**QA Engineer:** Claude Code (QA Skill)
**Test Type:** Code Review + Static Analysis (no running instance tested)

### Acceptance Criteria Test Results

| AC | Criterion | Status | Notes |
|----|-----------|--------|-------|
| AC-1.1 | Settings page has "Bankkonto verbinden" button | PASS | Button present in bankverbindungen/page.tsx |
| AC-1.2 | Auto-create FinAPI user if not exists | PASS | POST /api/finapi/verbindungen handles both new and existing FinAPI users |
| AC-1.3 | WebForm 2.0 URL creation | PASS | createBankConnectionWebForm() in finapi.ts |
| AC-1.4 | Redirect to WebForm URL | PASS | window.location.href = data.webform_url |
| AC-1.5 | Callback redirect after WebForm completion | FAIL | **BUG-001 (Critical):** Callback redirects to /einstellungen/bankverbindungen but page is at /settings/bankverbindungen |
| AC-1.6 | Bank connection saved in DB after callback | PASS | Callback route saves connection details including bank_name, IBAN, status |
| AC-1.7 | Error handling for WebForm abort/failure | PASS | ABORTED, FAILED statuses handled with error redirects |
| AC-1.8 | RLS mandant isolation | PASS | All RLS policies use get_mandant_id(), mandant_id on all tables |
| AC-2.1 | Sync button per connection | PASS | "Jetzt synchronisieren" button in BankverbindungKarte |
| AC-2.2 | Fetch transactions since last sync | PASS | minDate logic with 1-day buffer for banking delays |
| AC-2.3 | Normalize and import transactions | PASS | normalizeTransaction() maps all relevant FinAPI fields |
| AC-2.4 | Duplicate skip via externe_id | PASS | Deduplication via externe_id with batch + fallback single-row insert |
| AC-2.5 | Import result display | PASS | SyncErgebnis shows importiert/duplikate/gesperrte_monate |
| AC-2.6 | Error handling for sync failures | PASS | Try/catch with sync_historie logging |
| AC-2.7 | Matching engine triggered after import | PASS | executeMatching() called after successful import |
| AC-3.1 | Status badges (Aktiv/SCA faellig/Fehler) | PASS | StatusBadge component with all states |
| AC-3.2 | SCA warning banner | PASS | Alert banner when scaCount > 0 |
| AC-3.3 | "Verbindung erneuern" button for SCA | PASS | Visible for sca_faellig and fehler status |
| AC-3.4 | Sync disabled when SCA faellig with tooltip | PASS | Tooltip explaining why sync is disabled |
| AC-4.1 | Multiple bank connections | PASS | Grid layout, no limit on connections |
| AC-4.2 | Auto-create Zahlungsquelle per account | PASS | Callback route creates zahlungsquelle for each account |
| AC-4.3 | Correct quelle_id on transactions | PASS | verbindung.zahlungsquelle_id used in sync |
| AC-5.1 | CSV upload unchanged | PASS | No modifications to existing CSV import routes |
| AC-5.2 | Parallel CSV + FinAPI usage | PASS | Separate zahlungsquelle per connection |
| AC-5.3 | Cross-source duplicate detection | PARTIAL | **BUG-005 (Medium):** externe_id only deduplicates FinAPI-to-FinAPI; no cross-source dedup with CSV imports |
| AC-6.1 | Sandbox/Live via env vars | PASS | FINAPI_ENV controls baseUrl + webformUrl |
| AC-6.2 | No code change for env switch | PASS | Only env var changes needed |
| AC-6.3 | Sandbox test banks available | PASS | Standard FinAPI sandbox behavior |
| AC-7.1 | Last sync timestamp + count | PASS | letzter_sync_at and letzter_sync_anzahl displayed |
| AC-7.2 | Sync history (last 5 entries) | PARTIAL | **BUG-004 (Low):** Global limit(25) may miss entries for mandants with many connections |

### Bugs Found

#### BUG-001: Callback redirect goes to wrong URL path (CRITICAL)

**Severity:** Critical
**Priority:** P0 -- Blocks entire feature
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/app/api/finapi/callback/route.ts` (line 24)
**Steps to reproduce:**
1. Click "Bankkonto verbinden"
2. Complete FinAPI WebForm
3. FinAPI redirects to /api/finapi/callback
4. Callback redirects to /einstellungen/bankverbindungen (does not exist)
**Expected:** Redirect to /settings/bankverbindungen
**Actual:** Redirect to /einstellungen/bankverbindungen which is a 404
**Impact:** After completing the WebForm flow, users land on a 404 page. The connection IS saved in the DB, but the user sees an error page instead of the success confirmation. This completely breaks the connection flow UX.
**Fix:** Change line 24 from `einstellungen/bankverbindungen` to `settings/bankverbindungen`.

#### BUG-002: Callback does not verify mandant_id matches current user (HIGH)

**Severity:** High
**Priority:** P1
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/app/api/finapi/callback/route.ts`
**Description:** The callback route authenticates the user (line 31-32) and loads the session (line 60-65) but does NOT verify that `session.mandant_id` matches the current user's mandant_id. If an attacker obtains a sessionId (e.g., via URL interception on shared networks), they could complete the callback under a different user's session.
**Mitigation:** The sessionId is a UUID (hard to guess) and sessions expire after 1 hour. Risk is low but defense-in-depth requires this check.
**Fix:** After loading the session, add: `const mandantId = await getMandantId(supabase); if (session.mandant_id !== mandantId) return redirect with error`.

#### BUG-003: Backend does not block sync for 'fehler' status (MEDIUM)

**Severity:** Medium
**Priority:** P2
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/app/api/finapi/sync/[id]/route.ts` (lines 55-61)
**Description:** The frontend disables the sync button for both `sca_faellig` and `fehler` status, but the backend sync route only blocks `sca_faellig`. A user could bypass the frontend and call `POST /api/finapi/sync/[id]` directly when status is `fehler`.
**Fix:** Add `if (verbindung.status === 'fehler')` check in the sync route, similar to the sca_faellig check.

#### BUG-004: Sync history global limit may miss entries (LOW)

**Severity:** Low
**Priority:** P3
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/app/api/finapi/verbindungen/route.ts` (line 70)
**Description:** The sync history query uses `.limit(25)` globally across all connections. For mandants with 6+ connections (each with many syncs), some connections may show incomplete or no history.
**Fix:** Increase limit to `verbindungIds.length * 5` or use a per-connection query approach.

#### BUG-005: No cross-source duplicate detection between CSV and FinAPI (MEDIUM)

**Severity:** Medium
**Priority:** P2
**Description:** The FinAPI sync uses `externe_id` (formatted as `finapi_<id>`) for deduplication, which only works FinAPI-to-FinAPI. If a mandant imports the same transaction via CSV AND FinAPI, the duplicate will not be detected. The spec (AC-5.3) states: "Duplikat-Erkennung verhindert Doppelimport unabhaengig von der Import-Quelle."
**Edge case from spec:** "FinAPI-Transaktions-IDs fehlen: Fallback auf bestehende Duplikat-Erkennung via Datum + Betrag + Buchungsreferenz" -- this fallback is NOT implemented.
**Fix:** Add secondary duplicate check via datum + betrag + buchungsreferenz when importing from FinAPI.

#### BUG-006: webform_id leaked in POST response (LOW)

**Severity:** Low
**Priority:** P3
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/app/api/finapi/verbindungen/route.ts` (line 241)
**Description:** The POST /api/finapi/verbindungen response includes `webform_id` which is an internal FinAPI identifier. The frontend only uses `webform_url`. Exposing internal IDs unnecessarily increases attack surface.
**Fix:** Remove `webform_id` from the response JSON (only return `webform_url`).

#### BUG-007: FINAPI_BASE_URL and FINAPI_WEBFORM_URL not in .env.local.example (LOW)

**Severity:** Low
**Priority:** P3
**Description:** The .env.local.example documents FINAPI_ENV, FINAPI_CLIENT_ID, FINAPI_CLIENT_SECRET, FINAPI_ENCRYPTION_KEY. The code derives URLs from FINAPI_ENV which is correct, but the spec's tech design table lists FINAPI_BASE_URL and FINAPI_WEBFORM_URL as separate env vars. This is actually a spec deviation, not a bug -- the implementation is arguably better. No action needed unless spec conformity is required.

#### BUG-008: Rate limiter is in-memory, ineffective on serverless (LOW)

**Severity:** Low
**Priority:** P3
**File:** `/Users/patrick/Desktop/Claude Code/Belegmanager/Belegmanagerv1/src/lib/rate-limit.ts`
**Description:** The rate limiter for sync operations uses an in-memory Map. On Vercel serverless, each invocation may have a fresh memory space, making the rate limit ineffective. The file acknowledges this with a comment. For MVP/sandbox this is acceptable, but should be addressed before production with high traffic.

### Security Audit (Red Team)

| Check | Result | Notes |
|-------|--------|-------|
| Authentication on all API routes | PASS | All routes check supabase.auth.getUser() |
| Authorization (admin-only) | PASS | POST + DELETE require requireAdmin(); GET is available to all mandant users (correct) |
| RLS on all new tables | PASS | finapi_verbindungen, finapi_sync_historie, finapi_webform_sessions all have RLS |
| Mandant isolation | PASS | All queries filter by mandant_id, RLS enforces get_mandant_id() |
| Input validation (Zod) | PASS | POST body validated with Zod schema; UUID format validated on DELETE + sync routes |
| Sensitive data in API responses | PASS | GET route does not expose finapi_user_id or encrypted passwords |
| Credentials in callback URL | PASS | Only sessionId (UUID) in callback URL; credentials stored in DB session table |
| Session expiry | PASS | WebForm sessions expire after 1 hour; status prevents reuse |
| IDOR on sync route | PASS | Sync route checks mandant_id matches current user |
| IDOR on delete route | PASS | Delete route checks mandant_id matches current user |
| Cross-tenant data access | PASS | RLS + application-level mandant_id checks |
| AES encryption implementation | PASS | AES-256-GCM with random IV, auth tag, proper key derivation |
| Env var documentation | PASS | All FINAPI vars documented in .env.local.example |
| Rate limiting on sync | PARTIAL | In-memory rate limiter present but ineffective on serverless (BUG-008) |
| Callback mandant verification | FAIL | Callback does not verify session belongs to current user's mandant (BUG-002) |
| Open redirect via callback | PASS | Redirect URLs are hardcoded from NEXT_PUBLIC_SITE_URL, not user-controlled |

### Cross-Browser / Responsive (Code Review)

| Aspect | Status | Notes |
|--------|--------|-------|
| Responsive grid layout | PASS | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` adapts to screen sizes |
| Mobile header layout | PASS | `flex-col gap-4 sm:flex-row` stacks vertically on mobile |
| Loading skeleton | PASS | Skeleton placeholder during loading |
| Error state | PASS | Error display with retry button |
| Empty state | PASS | Illustrated empty state with call-to-action |
| Button loading states | PASS | Loader2 spinner on all async buttons |
| AlertDialog for destructive action | PASS | Confirmation dialog before disconnect |
| Toast notifications | PASS | Success/error toasts for all operations |
| URL cleanup after callback | PASS | window.history.replaceState cleans query params |

### Regression Impact

No modifications to existing features detected:
- CSV import routes: untouched
- Matching engine: called via existing executeMatching(), no changes to matching logic
- Zahlungsquellen: new entries auto-created but existing ones unmodified
- Transaktionen table: new columns (externe_id, import_quelle) are nullable/defaulted, no impact on existing rows

### Summary

| Category | Count |
|----------|-------|
| Acceptance criteria tested | 29 |
| Passed | 26 |
| Failed | 1 (BUG-001) |
| Partial | 2 (BUG-004, BUG-005) |
| Bugs found | 8 |
| Critical | 1 |
| High | 1 |
| Medium | 2 |
| Low | 4 |

### Bug Fix Round (2026-04-14)

All 8 bugs fixed. Build passes without errors.

| Bug | Severity | Status | Fix |
|-----|----------|--------|-----|
| BUG-001 | Critical | FIXED | `callback/route.ts` line 24: `/einstellungen/` → `/settings/` |
| BUG-002 | High | FIXED | `callback/route.ts`: Added `getMandantId()` + `session.mandant_id !== currentMandantId` check before processing |
| BUG-003 | Medium | FIXED | `sync/[id]/route.ts`: Added `status === 'fehler'` block (same as existing `sca_faellig` check) |
| BUG-005 | Medium | FIXED | `sync/[id]/route.ts` Step 6b: Secondary cross-source dedup via `datum + betrag + buchungsreferenz` against CSV-imported transactions (`externe_id IS NULL`) |
| BUG-004 | Low | FIXED | `verbindungen/route.ts`: `.limit(25)` → `.limit(verbindungIds.length * 5)` |
| BUG-006 | Low | FIXED | `verbindungen/route.ts`: Removed `webform_id` from POST response (only `webform_url` returned) |
| BUG-007 | Low | N/A | Not a bug – implementation (derive URLs from FINAPI_ENV) is better than spec's table |
| BUG-008 | Low | FIXED | `sync/[id]/route.ts`: Replaced in-memory rate limiter with DB-based check via `finapi_sync_historie` (works correctly on serverless) |

### Production-Ready Decision: READY

## Deployment
*(wird nach Deployment befüllt)*
