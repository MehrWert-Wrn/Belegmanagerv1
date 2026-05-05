# PROJ-32: Natives Mandanten-Postfach (IMAP + Gmail OAuth2)

## Status: In Progress
**Created:** 2026-05-05
**Last Updated:** 2026-05-05

---

## Übersicht

Mandanten können ihr eigenes E-Mail-Postfach direkt im Belegmanager anbinden – vollständig self-service, ohne Admin-Eingriff. Die App pollt das Postfach automatisch alle 15 Minuten, verarbeitet Anhänge (PDF/JPG/PNG) via OCR und legt Belege in der normalen Belegliste an.

**Wichtig: Die App nimmt keine Änderungen am Postfach vor.** Mails werden nicht als gelesen markiert, nicht verschoben, nicht gelöscht. Die Deduplizierung erfolgt rein über unsere eigene Datenbank (Message-ID).

**Bekannte Einschränkung (Polling):** Wenn ein Mandant eine Mail mit Beleganhang löscht oder aus dem überwachten Ordner verschiebt, bevor der Cron läuft, kann die App diese Mail nicht mehr verarbeiten – sie ist schlicht nicht mehr abrufbar. Das Polling-Intervall (5 Minuten) minimiert dieses Zeitfenster, eliminiert es aber nicht vollständig. Für Gmail wäre Google Pub/Sub (Echtzeit-Push) die langfristige Lösung → im Scope von PROJ-33/Future.

**Zwei Verbindungsarten:**
- **IMAP** (empfohlen, Standard): Funktioniert universell – Gmail, GMX, web.de, Outlook.com, eigene Mailserver, alle IMAP-fähigen Postfächer
- **Gmail OAuth2**: Native Google-Anbindung ohne Passwort – sicherer, da kein App-Passwort nötig

**Microsoft Graph (Microsoft 365)** kommt in einem späteren Schritt (PROJ-33) und wird im UI als "Demnächst verfügbar" angezeigt.

### Abgrenzung zu bestehenden Features

| Feature | Was es macht | Ändert sich? |
|---------|-------------|--------------|
| **PROJ-24** | Mandant übermittelt Credentials sicher an Admin → Admin richtet N8N ein → Credentials werden gelöscht | **Nein – bleibt unverändert** |
| **PROJ-30** | Shared Postfach `testphase@belegmanager.at` via Postmark Webhook | **Nein – bleibt unverändert** |
| **PROJ-32** | Jeder Mandant verbindet sein eigenes Postfach, App pollt direkt | Neu |

---

## Dependencies

- Requires: PROJ-1 (Authentifizierung) – eingeloggter Mandant
- Requires: PROJ-2 (Mandant-Onboarding) – `mandant_id` vorhanden
- Requires: PROJ-3 (Belegverwaltung) – `belege`-Tabelle und Storage-Infrastruktur
- Requires: PROJ-15 (OCR-Erkennung) – `performOcr()` Lib-Funktion
- Requires: PROJ-30 (E-Mail-Belegeingang) – `belege.quelle` Spalte erweitern auf `'mailbox'`

---

## User Stories

### Mandant – IMAP verbinden

1. **Als Mandant** möchte ich mein IMAP-Postfach in den Einstellungen anbinden, damit Belege automatisch aus meinem E-Mail-Eingang importiert werden.

2. **Als Mandant** möchte ich vor dem Speichern meine IMAP-Verbindung testen können, damit ich sofort Feedback bekomme, ob die Zugangsdaten korrekt sind.

3. **Als Mandant** möchte ich sehen, wann das Postfach zuletzt geprüft wurde und ob Fehler aufgetreten sind, damit ich die Verbindung im Blick habe.

4. **Als Mandant** möchte ich meine Postfach-Verbindung jederzeit trennen oder die Zugangsdaten aktualisieren können, damit ich flexibel auf Passwortänderungen reagieren kann.

### Mandant – Gmail OAuth2 verbinden

5. **Als Mandant** möchte ich mein Gmail-Konto mit einem Klick verbinden (ohne mein Passwort einzugeben), damit die Verbindung sicher und passwortlos ist.

6. **Als Mandant** möchte ich nach dem Verbinden sehen, welches Google-Konto verbunden ist, damit ich sicher bin, dass das richtige Konto ausgewählt wurde.

7. **Als Mandant** möchte ich bei Verbindungsfehlern (z.B. Zugriff widerrufen) eine klare Meldung sehen mit der Aufforderung, mich erneut zu verbinden.

### Mandant – Allgemein

8. **Als Mandant** möchte ich, dass nur E-Mails mit PDF/JPG/PNG-Anhängen verarbeitet werden, damit keine irrelevanten Mails importiert werden.

9. **Als Mandant** möchte ich, dass mein Postfach unverändert bleibt – keine automatisch-als-gelesen-markierten Mails, keine Verschiebungen – damit ich meinen Eingang normal weiterverwenden kann.

10. **Als Mandant** möchte ich, dass importierte Belege in der normalen Belegliste erscheinen (mit erkennbarem Mail-Icon), damit ich sie wie gewohnt reviewen kann.

---

## Acceptance Criteria

### AC-1: Settings-Seite `/settings/email-postfach`

- [ ] Neue Seite `/settings/email-postfach` in der Sidebar unter Einstellungen
- [ ] Sidebar-Eintrag "E-Mail-Postfach" mit passendem Icon (Inbox oder Mail)
- [ ] Seite zeigt drei Verbindungsoptionen als Karten:
  - **IMAP** – Badge "Empfohlen" in Teal, Beschreibung: "Funktioniert mit Gmail, GMX, web.de und jedem IMAP-fähigen Postfach"
  - **Gmail OAuth2** – Beschreibung: "Sicher ohne Passwort – direkte Google-Verbindung"
  - **Microsoft 365** – Badge "Demnächst" (ausgegraut, nicht anklickbar)
- [ ] Wenn keine Verbindung aktiv: IMAP und Gmail anklickbar, Microsoft 365 deaktiviert
- [ ] Wenn eine Verbindung aktiv: Status-Card zeigt Provider, Status (aktiv/Fehler), letzter Poll-Zeitpunkt, Fehlermeldung falls vorhanden
- [ ] Button "Verbindung trennen" in der Status-Card (mit Bestätigungs-Dialog)

### AC-2: IMAP – Verbindung anlegen

- [ ] Klick auf IMAP-Karte öffnet Formular (inline oder Dialog):
  - Host (Pflicht, z.B. `imap.gmail.com`)
  - Port (Pflicht, Default: `993`)
  - SSL/TLS (Checkbox, Default: aktiv)
  - E-Mail-Adresse (Pflicht, type="email")
  - Passwort (Pflicht, type="password")
  - Ordner (optional, Default: `INBOX`)
- [ ] Alle Pflichtfelder werden clientseitig validiert
- [ ] Button "Verbindung testen" → API testet IMAP-Login, gibt Erfolg oder Fehlermeldung zurück
- [ ] Nur bei erfolgreichem Test ist "Verbindung speichern" aktiv (oder: Test beim Speichern automatisch)
- [ ] Nach Speichern: Formular schließt, Status-Card erscheint mit Status "Aktiv"
- [ ] Credentials werden AES-256-GCM verschlüsselt gespeichert (selbe `credentials-crypto.ts` wie PROJ-24)

### AC-3: Gmail OAuth2 – Verbindung anlegen

- [ ] Klick auf Gmail-Karte → Weiterleitung zu Google OAuth2 Consent-Screen
- [ ] Nach erfolgreicher Autorisierung: Redirect zurück zu `/settings/email-postfach?status=connected`
- [ ] App tauscht Authorization Code gegen `access_token` + `refresh_token` (serverseitig)
- [ ] `refresh_token` wird AES-256-GCM verschlüsselt gespeichert
- [ ] Status-Card zeigt verbundene E-Mail-Adresse aus Google-Profil
- [ ] Bei fehlendem `refresh_token` in Google-Response (kann bei wiederholtem Consent passieren): automatisch `access_type=offline&prompt=consent` erzwingen

### AC-4: Polling via Vercel Cron

- [ ] Neuer Cron-Endpunkt `POST /api/cron/mailbox-poll` (gesichert via `CRON_SECRET`)
- [ ] Vercel Cron läuft alle 5 Minuten: `*/5 * * * *`
- [ ] Overlap-Schutz: `last_poll_started_at` wird zu Beginn jedes Runs gesetzt. Wenn `last_poll_started_at > now() - 4min`: Run überspringen (vorheriger Run läuft noch oder ist gerade abgeschlossen)
- [ ] Cron lädt alle aktiven Mailbox-Verbindungen aus der DB
- [ ] **Polling-Strategie (kein Eingriff ins Postfach):**
  - IMAP: `UID SEARCH SINCE last_polled_at - 2min` (2-min-Puffer gegen Clock-Skew). Erster Poll: Mails der letzten 30 Tage.
  - Gmail: Query `after:timestamp has:attachment` (kein `is:unread`-Filter). Erster Poll: Mails der letzten 30 Tage.
  - Keine Flags setzen, keine Mails verschieben oder löschen.
- [ ] Verarbeitung pro Anhang (sequentiell, analog PROJ-30):
  1. Idempotenz-Check: Message-ID bereits in `verarbeitete_mailbox_nachrichten`? → überspringen
  2. Typ-Filter: nur PDF/JPG/PNG, max. 10 MB, max. 10 Anhänge pro Mail
  3. Duplikat-Check via SHA-256-Hash (`belege.file_hash`)
  4. Upload nach Supabase Storage (`belege`-Bucket)
  5. OCR via `performOcr()` direkt aus `src/lib/ocr.ts`
  6. `INSERT INTO belege` mit `quelle='mailbox'`, `mandant_id`, OCR-Metadaten
  7. Message-ID in `verarbeitete_mailbox_nachrichten` eintragen
- [ ] Nach jedem Poll: `last_polled_at` + `error_message` in `mailbox_verbindungen` aktualisieren
- [ ] Bei Fehler (Auth, Netzwerk): Status auf `'error'` setzen + Fehlermeldung speichern, nächste Verbindung wird trotzdem verarbeitet
- [ ] Cron-Timeout: `maxDuration = 270s` (4,5 Min – unter dem 5-Min-Intervall, verhindert Overlaps)

### AC-5: Gmail OAuth2 – Token-Verwaltung

- [ ] `access_token` wird nicht persistiert (wird bei jedem Poll frisch via `refresh_token` geholt)
- [ ] Token-Refresh erfolgt serverseitig via `googleapis`-Library vor jedem Poll
- [ ] Wenn `refresh_token` ungültig (widerrufen): Status auf `'error'` setzen mit Meldung "Google-Zugriff widerrufen – bitte neu verbinden"
- [ ] In der Status-Card erscheint bei `status='error'` ein Button "Neu verbinden"

### AC-6: Belegliste – Importierte Belege

- [ ] Belege mit `quelle='mailbox'` zeigen Mail-Icon (analog zu `quelle='email'` in PROJ-30)
- [ ] Tooltip: "Via Postfach-Anbindung importiert"
- [ ] `quelle`-Spalte in `belege`-Tabelle: bestehender CHECK-Constraint wird um `'mailbox'` erweitert (Migration)
- [ ] Nicht-reviewte Belege (`rechnungsname IS NULL`) landen automatisch im bestehenden Review-Modus (PROJ-15)

### AC-7: Sicherheit & DSGVO

- [ ] Credentials (IMAP-Passwort, Gmail refresh_token) werden ausschließlich AES-256-GCM verschlüsselt gespeichert
- [ ] Encryption Key liegt nur als Server-seitiges Environment-Variable (`MAILBOX_ENCRYPTION_KEY`)
- [ ] Kein Klartext-Logging von Credentials oder Tokens
- [ ] RLS: Mandant kann nur eigene Verbindung lesen (nur Status-Felder, nicht encrypted payload)
- [ ] `encrypted_payload`-Spalte via Column-Level REVOKE nicht lesbar für `authenticated`-Rolle
- [ ] OAuth2-Callback validiert `state`-Parameter (CSRF-Schutz)
- [ ] Beim Trennen der Verbindung: Row wird hard-deleted (inkl. `encrypted_payload`)

---

## Datenmodell

### Tabelle: `mailbox_verbindungen`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | `uuid` (PK) | Auto-generiert |
| `mandant_id` | `uuid` (FK → mandanten, ON DELETE CASCADE) | Mandant |
| `provider` | `text` CHECK (`'imap'` \| `'gmail'` \| `'microsoft'`) | Verbindungsart |
| `status` | `text` CHECK (`'active'` \| `'error'` \| `'paused'`) | Aktueller Status |
| `encrypted_payload` | `text` | AES-256-GCM (IMAP: host/port/ssl/email/password; Gmail: refresh_token/email; Microsoft: refresh_token/email/tenant_id) |
| `ordner_filter` | `text[]` (default `ARRAY['INBOX']`) | Ausgewählte Ordner/Labels zum Überwachen |
| `import_seit` | `date` (default `CURRENT_DATE - 7`) | Startdatum des Imports – konfigurierbar, Standard 7 Tage |
| `ki_klassifizierung_aktiv` | `boolean` (default `true`) | KI-Pre-Screening aktiv (nur echte Rechnungen importieren) |
| `last_polled_at` | `timestamptz` (nullable) | Letzter abgeschlossener Poll-Zeitpunkt |
| `last_successful_poll_at` | `timestamptz` (nullable) | Letzter Poll ohne Fehler |
| `last_poll_started_at` | `timestamptz` (nullable) | Poll-Start-Zeitpunkt (Overlap-Schutz) |
| `consecutive_error_count` | `int` (default `0`) | Anzahl aufeinanderfolgender Fehlschläge |
| `error_message` | `text` (nullable) | Letzte Fehlermeldung |
| `notification_sent_at` | `timestamptz` (nullable) | Zeitpunkt der letzten Fehler-Benachrichtigung |
| `created_at` | `timestamptz` | Anlage-Zeitpunkt |
| `updated_at` | `timestamptz` | Letzte Änderung |

**UNIQUE Constraint:** `(mandant_id)` – pro Mandant genau eine aktive Verbindung

**RLS:**
- Mandant: `SELECT` eigene Row, aber `encrypted_payload` via Column-Level REVOKE nicht lesbar
- Mandant: `INSERT` / `UPDATE` / `DELETE` eigene Row (über API-Routes mit Service Role)
- Service Role: volles Lesen/Schreiben (Cron + API-Routes)

### Tabelle: `verarbeitete_mailbox_nachrichten`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `id` | `uuid` (PK) | Auto-generiert |
| `verbindung_id` | `uuid` (FK → mailbox_verbindungen, ON DELETE CASCADE) | Zugehörige Verbindung |
| `mandant_id` | `uuid` | Mandant (Denormalisierung für einfache RLS) |
| `message_id` | `text` | E-Mail Message-ID Header (Primär-Dedup-Key) |
| `message_id_fallback` | `text` (nullable) | SHA-256(From+Date+Subject) wenn Message-ID fehlt |
| `verarbeitet_am` | `timestamptz` | Zeitstempel |
| `status` | `text` CHECK (`'processed'` \| `'skipped'` \| `'kein_beleg'` \| `'error'`) | Ergebnis |
| `anhang_anzahl` | `int` | Anzahl verarbeiteter Anhänge |
| `ki_klassifizierung` | `text` (nullable) CHECK (`'beleg'` \| `'kein_beleg'` \| `'unsicher'`) | KI-Screening-Ergebnis |

**UNIQUE Constraint:** `(verbindung_id, message_id)` – Idempotenz (Fallback: `(verbindung_id, message_id_fallback)` wenn message_id NULL)

### Änderung an `belege`

- `quelle` CHECK-Constraint: `'manual' | 'email' | 'mailbox'` (bisher `'manual' | 'email'`)
- Migration: `ALTER TABLE belege DROP CONSTRAINT belege_quelle_check; ALTER TABLE belege ADD CONSTRAINT belege_quelle_check CHECK (quelle IN ('manual', 'email', 'mailbox'));`

---

## API-Routen

| Route | Methode | Wer | Beschreibung |
|-------|---------|-----|--------------|
| `/api/mailbox/verbindung` | `GET` | Mandant | Aktuelle Verbindung abrufen (Status-Felder, kein Payload) |
| `/api/mailbox/verbindung` | `POST` | Mandant | IMAP-Verbindung anlegen/aktualisieren |
| `/api/mailbox/verbindung` | `PATCH` | Mandant | Einstellungen updaten (ordner_filter, import_seit, ki_klassifizierung_aktiv) |
| `/api/mailbox/verbindung` | `DELETE` | Mandant | Verbindung trennen (hard delete) |
| `/api/mailbox/test` | `POST` | Mandant | Verbindungstest (Modus A: Body-Credentials; Modus B: DB) |
| `/api/mailbox/ordner` | `GET` | Mandant | Verfügbare Ordner/Labels der verbundenen Mailbox laden |
| `/api/mailbox/gmail/auth` | `GET` | Mandant | Gmail OAuth2-URL + CSRF-State |
| `/api/mailbox/gmail/callback` | `GET` | System | Gmail Code → Tokens tauschen + speichern |
| `/api/mailbox/microsoft/auth` | `GET` | Mandant | Microsoft OAuth2-URL + CSRF-State |
| `/api/mailbox/microsoft/callback` | `GET` | System | Microsoft Code → Tokens tauschen + speichern |
| `/api/cron/mailbox-poll` | `POST` | Vercel Cron | Alle aktiven Postfächer pollen |

---

## Edge Cases

1. **IMAP-Passwort geändert:** Nächster Poll schlägt fehl → `status='error'`, Fehlermeldung "Authentifizierung fehlgeschlagen – bitte Passwort aktualisieren". Mandant aktualisiert Credentials über die Settings-Seite.

2. **Gmail refresh_token widerrufen:** Poll schlägt mit `invalid_grant` fehl → `status='error'`, Meldung "Google-Zugriff widerrufen – bitte neu verbinden". Button "Neu verbinden" startet OAuth2-Flow erneut (mit `prompt=consent`).

3. **Mandant verschiebt oder löscht Mail vor dem Poll:** Wenn die Mail vor dem nächsten 5-Minuten-Cron-Lauf aus dem überwachten Ordner verschoben oder gelöscht wird, kann sie nicht mehr verarbeitet werden – sie ist schlicht nicht mehr abrufbar. Das ist eine fundamentale Einschränkung des Polling-Ansatzes. Mitigationen: (a) 5-Min-Intervall minimiert das Fenster, (b) Mandant kann Beleg manuell hochladen, (c) Gmail Pub/Sub (Echtzeit) als langfristige Lösung in PROJ-33/Future. **Dieses Verhalten ist in der UI klar kommuniziert** (Hinweistext auf der Settings-Seite).

4. **Mandant verschiebt bereits verarbeitete Mail zurück in den Ordner:** Message-ID ist in `verarbeitete_mailbox_nachrichten` → wird beim nächsten Poll übersprungen. Kein Duplikat.

5. **Mandant verbindet zweites Mal (gleicher Provider):** Bestehende Row wird überschrieben (UPSERT), alter Payload wird gelöscht.

6. **Mandant wechselt Provider (IMAP → Gmail):** Alte Row wird gelöscht (DELETE), neue angelegt (INSERT). Keine zwei parallelen Verbindungen möglich.

7. **Keine neuen Mails beim Poll:** Kein Fehler, `last_polled_at` wird aktualisiert, keine Belege angelegt.

8. **Doppelter Beleg (gleicher SHA-256-Hash):** Überspringen, kein Duplikat anlegen.

9. **IMAP-Server temporär nicht erreichbar (Netzwerkfehler):** `status='error'`, `error_message` gesetzt, beim nächsten Cron-Lauf neuer Versuch. Kein dauerhafter Schaden.

10. **Erster Poll (kein `last_polled_at`):** Mails der letzten 30 Tage werden gescannt. Danach nur noch Mails seit `last_polled_at - 5min`.

11. **OAuth2-State mismatch (CSRF-Angriff):** Callback prüft `state` gegen Session-gespeicherten Wert → 400 bei Abweichung, kein Token-Austausch.

12. **Gmail mit IMAP nutzen (App-Passwort):** Mandanten mit Gmail können alternativ auch IMAP mit einem Google App-Passwort nutzen. Bewusst ermöglicht – IMAP ist universell.

13. **IMAP-Ordner nicht gefunden:** Verbindungstest schlägt fehl mit Meldung "Ordner 'XYZ' nicht gefunden". Kein Fallback – Mandant muss Ordnernamen korrigieren.

14. **Monatsabschluss gesperrt:** Belege werden trotzdem importiert (für Folgemonat oder manuelles Handling), analog zu PROJ-30.

15. **Mandant löscht Konto:** `ON DELETE CASCADE` auf `mailbox_verbindungen.mandant_id` löscht Verbindung + Log-Einträge automatisch.

16. **Viele Mails beim Erst-Poll (30 Tage History, 500+ Mails):** Cron verarbeitet nur Mails MIT Anhang (IMAP: `SEARCH SINCE x HAS_ATTACHMENT`, Gmail: `has:attachment after:timestamp`). OCR läuft sequentiell, Cron hat 300s Timeout. Bei Überschreitung: abgebrochene Mails werden beim nächsten Poll neu gefunden (Message-ID noch nicht in DB).

---

## UI-Skizze: `/settings/email-postfach`

```
E-Mail-Postfach anbinden
──────────────────────────────────────────────────────

Verbinde dein E-Mail-Postfach, damit Belege automatisch
aus deinem Eingang importiert werden. Dein Postfach
bleibt dabei unverändert – keine Mails werden markiert
oder verschoben.

┌─ IMAP ──────────────────────┐  ┌─ Gmail ─────────────────┐  ┌─ Microsoft 365 ──────────┐
│ [Empfohlen]                 │  │                         │  │                          │
│                             │  │  G                      │  │  M                       │
│ Funktioniert mit Gmail,     │  │  Sicher ohne Passwort   │  │  Microsoft 365           │
│ GMX, web.de und jedem       │  │  – direkte Google-      │  │  & Outlook               │
│ IMAP-fähigen Postfach.      │  │  Verbindung.            │  │                          │
│                             │  │                         │  │                          │
│ [Verbinden →]               │  │ [Mit Google verbinden]  │  │ [Mit Microsoft verbinden]│
└─────────────────────────────┘  └─────────────────────────┘  └──────────────────────────┘

--- WENN VERBINDUNG AKTIV ---

┌─ Verbundenes Postfach ──────────────────────────────────────────────────────────────┐
│  ✅  IMAP – max.mustermann@gmail.com                                                │
│      Zuletzt geprüft: vor 8 Minuten                                                │
│      [Verbindung testen]                                      [Verbindung trennen]  │
└─────────────────────────────────────────────────────────────────────────────────────┘

--- WENN FEHLER ---

┌─ Verbundenes Postfach ──────────────────────────────────────────────────────────────┐
│  ⚠️  IMAP – max.mustermann@gmail.com                                                │
│      Fehler: Authentifizierung fehlgeschlagen – bitte Passwort aktualisieren        │
│      Zuletzt geprüft: vor 2 Stunden                                                │
│      [Verbindung testen]          [Neu verbinden]          [Verbindung trennen]     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Design (Solution Architect)

### Überblick: Wie die Teile zusammenspielen

```
Mandant öffnet /settings/email-postfach
         │
         ├─ IMAP-Karte → Formular
         │       ├─ [Verbindung testen] → POST /api/mailbox/test  (Modus A: Body-Credentials)
         │       └─ [Speichern] → POST /api/mailbox/verbindung
         │
         ├─ Gmail-Karte → GET /api/mailbox/gmail/auth → Google Consent
         │             → GET /api/mailbox/gmail/callback (Code → Tokens speichern)
         │             → /settings/email-postfach?status=connected
         │
         └─ Microsoft-Karte → GET /api/mailbox/microsoft/auth → Microsoft Consent
                           → GET /api/mailbox/microsoft/callback (Code → Tokens speichern)
                           → /settings/email-postfach?status=connected

Wenn Verbindung aktiv (VerbindungsStatusCard):
         └─ [Verbindung testen] → POST /api/mailbox/test  (Modus B: DB-Credentials – jederzeit)

Alle 5 Minuten: Vercel Cron
         │
         ▼
POST /api/cron/mailbox-poll
         │
         ├─ Overlap-Check: last_poll_started_at < 4 Min? → überspringen
         ├─ Alle aktiven mailbox_verbindungen laden
         │
         └─ Pro Verbindung (sequentiell):
              ├─ IMAP:      imapflow   → Mails seit last_polled_at - 2min
              │  Gmail:     googleapis → has:attachment after:timestamp
              │  Microsoft: msal-node  → Graph /me/mailFolders/inbox/messages?filter=...
              │
              └─ Pro Mail mit Anhang:
                   ├─ [Schicht 1] Message-ID Dedup → skip wenn schon verarbeitet
                   ├─ Typ-Filter: PDF/JPG/PNG, ≤10MB, max. 10 pro Mail
                   ├─ [Schicht 2] Datei-Hash Dedup (belege.file_hash) → skip bei Duplikat
                   ├─ [Optional] KI-Pre-Screening: BELEG / KEIN_BELEG / UNSICHER
                   │            KEIN_BELEG → skip + loggen; sonst weiter
                   ├─ Upload → Supabase Storage
                   ├─ OCR via performOcr() [src/lib/ocr.ts]
                   ├─ INSERT INTO belege (quelle='mailbox')
                   └─ Eintrag in verarbeitete_mailbox_nachrichten + Status/KI-Ergebnis
```

### "Verbindung testen" – jederzeit verfügbar

`POST /api/mailbox/test` läuft in zwei Modi:

**Modus A – Neue Verbindung (Setup):** Credentials im Request-Body. Test prüft Login ohne Speichern. "Speichern" wird erst nach erfolgreichem Test aktiv.

**Modus B – Bestehende Verbindung (jederzeit):** Kein Body nötig. API lädt gespeicherte Credentials, entschlüsselt, testet Login. Für Gmail/Microsoft: Token-Refresh inklusive. Ergebnis direkt in der VerbindungsStatusCard – nützlich nach einem Fehler um zu prüfen ob das Problem behoben ist, ohne neu verbinden zu müssen.

---

### Komponenten-Struktur (Frontend)

```
/settings/email-postfach (neue Seite)
+-- PageHeader ("E-Mail-Postfach anbinden")
+-- HinweisText
|   "Dein Postfach bleibt unverändert. Mails werden nicht
|    markiert oder verschoben. Hinweis: Falls du eine Mail
|    innerhalb von 5 Min nach Eingang löschst, kann sie
|    nicht mehr verarbeitet werden."
|
+-- [Wenn KEINE Verbindung aktiv]
|   +-- AnbieterKartenGrid (3 Karten nebeneinander)
|       +-- ImapKarte [Badge "Empfohlen" Teal]
|       |   Beschreibung: "Funktioniert mit Gmail, GMX, web.de
|       |    und jedem IMAP-fähigen Postfach"
|       |   Klick → ImapFormular erscheint (inline, kein Dialog)
|       |       +-- Felder: Host, Port, SSL-Checkbox, E-Mail, Passwort, Ordner
|       |       +-- [Verbindung testen] → zeigt Erfolg/Fehlermeldung
|       |       +-- [Verbindung speichern] (aktiv erst nach erfolgreichem Test)
|       |       +-- [Abbrechen]
|       |
|       +-- GmailKarte
|       |   Beschreibung: "Sicher ohne Passwort – direkte Google-Verbindung"
|       |   Klick → Redirect zu Google Consent-Screen
|       |
|       +-- MicrosoftKarte
|           "Microsoft 365 & Outlook"
|           [Mit Microsoft verbinden] → OAuth2-Redirect
|
+-- [Wenn Verbindung AKTIV]
|   +-- VerbindungsStatusCard
|       +-- Provider-Badge (IMAP / Gmail / Microsoft) + E-Mail-Adresse
|       +-- Status: ✅ "Aktiv" | ⚠️ "Verbindungsfehler"
|       +-- "Zuletzt erfolgreich geprüft: vor X Minuten"
|       +-- [wenn Fehler] Fehlermeldungstext (roter Alert)
|       +-- Aktionszeile (immer sichtbar):
|           +-- [Verbindung testen]   ← Modus B, immer anklickbar
|           +-- [Neu verbinden]       ← nur bei status='error'
|           +-- [Verbindung trennen]  → TrennenDialog
|       +-- TrennenDialog
|           [Abbrechen] [Trennen]
|
+-- [Einstellungen-Bereich – sichtbar wenn Verbindung aktiv]
    +-- OrdnerAuswahl
    |   "Welche Ordner sollen überwacht werden?"
    |   [Ordner laden] → GET /api/mailbox/ordner → Checkboxen der verfügbaren Ordner
    |   Default: ☑ INBOX
    |
    +-- StartdatumPicker
    |   "Mails importieren ab:" [Datepicker] (Default: heute - 7 Tage, max: heute - 90 Tage)
    |   Info: "Gilt nur für den ersten Import. Danach werden nur neue Mails verarbeitet."
    |
    +-- KiKlassifizierungToggle
        "Nur echte Rechnungen importieren (KI-Erkennung)"
        [Toggle an/aus] – Default: an
        Info: "Die KI prüft vor dem Import ob ein Anhang eine Rechnung ist."
|
+-- [Belegliste – kleine Änderung in bestehendem Component]
    src/components/belege/beleg-tabelle.tsx (bereits vorhanden)
    +-- BelegZeile
        +-- [NEU] Inbox-Icon wenn quelle='mailbox'
            Tooltip: "Via Postfach-Anbindung importiert"
            (analog zum Mail-Icon für quelle='email' aus PROJ-30)
```

**App-Sidebar** (bestehend, kleine Erweiterung):
```
src/components/app-sidebar.tsx
+-- Einstellungen-Gruppe
    +-- [NEU] "E-Mail-Postfach" (Inbox-Icon) → /settings/email-postfach
    +-- Bankverbindungen (bereits vorhanden)
    +-- Zahlungsquellen (bereits vorhanden)
    +-- ...
```

---

### Neue Dateien

#### Frontend
| Datei | Zweck |
|-------|-------|
| `src/app/(app)/settings/email-postfach/page.tsx` | Settings-Seite |
| `src/components/mailbox/anbieter-karten.tsx` | Drei aktive Provider-Karten (IMAP, Gmail, Microsoft) |
| `src/components/mailbox/imap-formular.tsx` | Inline-IMAP-Formular mit Test-Button (Modus A) |
| `src/components/mailbox/verbindungs-status-card.tsx` | Status-Anzeige mit Test-Button (Modus B, immer sichtbar) |
| `src/components/mailbox/einstellungen-panel.tsx` | Ordner-Auswahl, Startdatum-Picker, KI-Toggle |
| `src/components/mailbox/trennen-dialog.tsx` | Bestätigungs-Dialog |

#### Backend – API-Routes
| Datei | Zweck |
|-------|-------|
| `src/app/api/mailbox/verbindung/route.ts` | GET (Status abrufen), POST (IMAP speichern), DELETE (trennen) |
| `src/app/api/mailbox/test/route.ts` | POST – Verbindungstest (Modus A: Body; Modus B: DB) für alle Provider |
| `src/app/api/mailbox/gmail/auth/route.ts` | GET – Google OAuth2-URL + CSRF-State |
| `src/app/api/mailbox/gmail/callback/route.ts` | GET – Google Code → Tokens tauschen + speichern |
| `src/app/api/mailbox/microsoft/auth/route.ts` | GET – Microsoft OAuth2-URL + CSRF-State |
| `src/app/api/mailbox/microsoft/callback/route.ts` | GET – Microsoft Code → Tokens tauschen + speichern |
| `src/app/api/cron/mailbox-poll/route.ts` | POST – 5-Minuten-Cron, alle drei Provider |

#### Backend – Bibliotheken
| Datei | Zweck |
|-------|-------|
| `src/lib/mailbox-imap.ts` | IMAP: Login, Mails suchen, Anhänge extrahieren (imapflow) |
| `src/lib/mailbox-gmail.ts` | Gmail: OAuth2-URL, Token-Refresh, Mails suchen (googleapis) |
| `src/lib/mailbox-microsoft.ts` | Microsoft: OAuth2-URL, Token-Refresh, Graph-API Mails suchen (msal-node) |
| `src/lib/mailbox-processor.ts` | Provider-agnostisch: Filter → Hash-Check → OCR → DB |

#### Datenbank
| Datei | Zweck |
|-------|-------|
| `supabase/migrations/20260505000000_mailbox_verbindungen.sql` | Neue Tabellen + belege.quelle-Erweiterung |

---

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/app-sidebar.tsx` | Neuer Sidebar-Eintrag "E-Mail-Postfach" |
| `src/components/belege/beleg-tabelle.tsx` | Inbox-Icon für `quelle='mailbox'` (2–3 Zeilen, analog PROJ-30) |
| `vercel.json` | Neuen Cron-Eintrag `*/5 * * * *` hinzufügen |
| `.env.local.example` | Neue Variablen dokumentieren |

---

### Warum `mailbox-processor.ts` als gemeinsame Library?

Alle drei Provider (IMAP, Gmail, Microsoft) liefern nach dem Holen der Mails dasselbe: normalisierte Anhänge (Buffer + MIME-Typ + Message-ID). Die Verarbeitungslogik ist für alle drei identisch. Eine gemeinsame Library bedeutet:
- Keine Code-Duplizierung zwischen den drei Providern
- Zukünftige Provider nutzen dieselbe Pipeline ohne Mehraufwand
- Änderungen an OCR oder Hash-Logik gelten automatisch für alle Provider

---

### Technische Entscheidungen

| Entscheidung | Gewählt | Begründung |
|---|---|---|
| IMAP-Library | `imapflow` | Aktiv gewartet, Promise-basiert, `SEARCH SINCE` + `HAS ATTACHMENT` nativ |
| Gmail-Library | `googleapis` | Offizielles Google SDK, automatisches Token-Handling |
| Microsoft-Library | `@azure/msal-node` | Offizielles Microsoft SDK, Multi-Tenant + Token-Refresh |
| Test-Endpunkt | Zwei Modi (A + B) | Selber Endpunkt für Setup und laufende Verbindung – kein Doppelcode |
| OAuth2-State (CSRF) | Kurzlebiger DB-Eintrag (60s TTL) | Zuverlässiger als Cookie über Redirects; automatisch ablaufend |
| Polling: sequentiell | Sequentiell | Mailserver throtteln Parallelverbindungen; OCR hat Anthropic-Rate-Limits |
| Encryption Key | Neuer `MAILBOX_ENCRYPTION_KEY` | Getrennt von PROJ-24's Key – Kompromiss eines Keys gefährdet den anderen nicht |
| Erster Poll | Letzte 30 Tage | Kontext ohne volle History; danach nur Delta |
| Microsoft Scope | `Mail.Read` (Delegated) | Kein Admin-Consent nötig – normaler User-Consent reicht |
| Gmail Scope | `gmail.readonly` | Minimale Berechtigung, kein Schreiben ins Postfach |

---

### Neue Umgebungsvariablen

| Variable | Pflicht | Zweck |
|----------|---------|-------|
| `MAILBOX_ENCRYPTION_KEY` | Ja | AES-256-GCM Key für alle drei Provider |
| `GOOGLE_CLIENT_ID` | Ja | Google Cloud App (einmalig registriert) |
| `GOOGLE_CLIENT_SECRET` | Ja | Google Cloud App Secret |
| `GOOGLE_REDIRECT_URI` | Ja | `https://app.belegmanager.at/api/mailbox/gmail/callback` |
| `MICROSOFT_CLIENT_ID` | Ja | Azure AD App (Multi-Tenant, einmalig registriert) |
| `MICROSOFT_CLIENT_SECRET` | Ja | Azure AD App Secret |
| `MICROSOFT_REDIRECT_URI` | Ja | `https://app.belegmanager.at/api/mailbox/microsoft/callback` |

`CRON_SECRET` und `SUPABASE_SERVICE_ROLE_KEY` bereits vorhanden.

---

### Duplikat-Check – zwei Schichten

**Schicht 1 – Message-ID Dedup** (verhindert doppeltes Verarbeiten derselben E-Mail):
- Key: `(verbindung_id, message_id)` in `verarbeitete_mailbox_nachrichten`
- `message_id` = der `Message-ID`-Header der E-Mail (RFC 2822, global eindeutig)
- Fallback wenn Header fehlt: SHA-256(`From + Date + Subject`) → `message_id_fallback`
- Insert dieser Row erfolgt **am Anfang** der Verarbeitung (nicht am Ende), damit bei Cron-Abbruch mitten in der Verarbeitung kein Re-Import stattfindet
- Race-Condition bei Parallel-Retries: `INSERT ... ON CONFLICT DO NOTHING` + Code `23505` tolerieren

**Schicht 2 – Datei-Hash Dedup** (verhindert identische Beleg-Dateien aus verschiedenen Quellen):
- Key: SHA-256-Hash des Anhang-Inhalts → `belege.file_hash`
- Prüfung: `SELECT id FROM belege WHERE file_hash = ? AND geloescht_am IS NULL AND mandant_id = ?`
- Fängt: gleiche Datei manuell hochgeladen + per Postfach angekommen, oder gleiche Rechnung über zwei Kanäle (testphase-Postfach + eigenes Postfach)

---

### Startdatum & Ordner-Konfiguration

**Startdatum (`import_seit`):**
- Default: `CURRENT_DATE - 7` (7 Tage) – konfigurierbar vom Mandanten
- Gilt nur für den **ersten Poll** (`last_polled_at IS NULL`). Danach: `last_polled_at - 2min`
- UI: Datepicker in den Verbindungseinstellungen, max. 90 Tage in die Vergangenheit (Schutz vor versehentlicher Massenverarbeitung)

**Ordner-Filter (`ordner_filter`):**
- Standard: `['INBOX']`
- Nach erfolgreicher Verbindung kann Mandant verfügbare Ordner laden (`GET /api/mailbox/ordner`) und auswählen
- IMAP: `LIST "" "*"` gibt alle Mailbox-Ordner zurück
- Gmail: Labels via Gmail API (`users.labels.list`)
- Microsoft: Mail-Folder via Graph API (`/me/mailFolders`)
- Gespeichert als `text[]` in `mailbox_verbindungen.ordner_filter` (keine sensiblen Daten → unverschlüsselt)
- Cron pollt jeden konfigurierten Ordner sequentiell

---

### Fehlerbehandlung & Retry-Logik

**Status-Tracking per Poll:**
```
Erfolgreicher Poll:
  → consecutive_error_count = 0
  → last_successful_poll_at = now()
  → last_polled_at = now()
  → error_message = NULL
  → status = 'active'

Fehlgeschlagener Poll:
  → consecutive_error_count += 1
  → error_message = Fehlermeldung
  → last_polled_at = now()
  → status bleibt 'active' bis consecutive_error_count >= 3
  → ab 3 Fehlern: status = 'error'
```

**Retry-Strategie:**
- Kein sofortiger Retry (nächster Cron-Lauf in 5 Min übernimmt)
- Bei transienten Fehlern (Netzwerk, Timeout): nächster Cron versucht es automatisch
- Bei Auth-Fehlern (falsches Passwort, widerrufenes Token): `status = 'error'` sofort (kein Retry sinnvoll)

**Nutzer-Benachrichtigung:**
- Nach `consecutive_error_count >= 3` (= ca. 15 Min Ausfall): E-Mail-Benachrichtigung an Mandant via Resend
- Betreff: `[Belegmanager] Ihre E-Mail-Verbindung ist unterbrochen`
- Inhalt: Provider, E-Mail-Adresse, Fehlermeldung, Link zu `/settings/email-postfach`
- `notification_sent_at` verhindert Spam: nur 1 Benachrichtigung pro 24h je Verbindung
- In-App: Sidebar-Badge / rote Status-Card sobald `status = 'error'`

**Per-Verbindung Timeout:**
- Jede Mailbox-Verbindung hat ein Timeout von 30s
- Verhindert, dass eine hängende Verbindung den gesamten Cron-Lauf blockiert
- Bei Timeout: als transienter Fehler gewertet (`consecutive_error_count++`)

---

### Rate Limits & Throttling

**IMAP:**
- Sequentielle Verarbeitung → maximal 1 offene IMAP-Verbindung pro Mandant zur selben Zeit
- Kein Problem mit Server-seitigen Verbindungslimits (die gelten pro Konto, nicht pro App-Instanz)
- 30s Timeout pro Verbindung verhindert Hänger

**Gmail API:**
- Quota ist **per Nutzer** (per OAuth-Token), nicht global für die App
- 250 Quota-Units/Sekunde pro User → bei sequentieller Verarbeitung und normalem Mailaufkommen weit unter dem Limit
- Bei `429 Too Many Requests`: Exponential Backoff (1s → 2s → 4s, max. 3 Versuche) vor Aufgabe
- Burst-Schutz: Zwischen zwei Gmail-Verbindungen 500ms Pause (im Cron-Loop)

**Microsoft Graph:**
- Throttling via `Retry-After`-Header: Graph gibt bei 429 an wie lange gewartet werden soll
- App respektiert diesen Header (wartet die angegebene Sekunden, max. 30s Wartezeit)
- Bei Überschreitung: Verbindung als transienter Fehler markieren, nächster Cron-Lauf

---

### KI-Klassifizierung (Pre-Screening)

Vor dem vollständigen OCR-Durchlauf klassifiziert ein leichter KI-Call ob ein Anhang tatsächlich eine Rechnung/ein Beleg ist – oder ob es sich um einen Newsletter, Vertrag, Lieferschein ohne Rechnungscharakter etc. handelt.

**Warum?**
- Verhindert Junk in der Belegliste (Newsletters als PDF, AGBs, etc.)
- Spart OCR-Kosten: Kein teurer Claude-Vision-Call für Nicht-Belege
- Konfigurierbar: Mandant kann es deaktivieren wenn er alle PDFs importieren möchte

**Implementierung:**
- Modell: Claude Haiku (schnell, günstig, ~0,001$ pro Klassifizierung)
- Input: Erste Seite des PDFs als Bild (oder direkt das Bild bei JPG/PNG) + kurzer Prompt
- Prompt: "Ist dieses Dokument eine Eingangsrechnung oder ein Beleg für eine Zahlung? Antworte nur: BELEG, KEIN_BELEG oder UNSICHER."
- Ergebnis `'kein_beleg'` → Anhang überspringen, in `verarbeitete_mailbox_nachrichten.ki_klassifizierung = 'kein_beleg'` loggen
- Ergebnis `'beleg'` oder `'unsicher'` → OCR starten (konservativ: lieber zu viel als zu wenig)
- Ergebnis wird nie als hartes Ausschlusskriterium verwendet wenn `ki_klassifizierung_aktiv = false`

**Pipeline mit KI-Klassifizierung:**
```
Pro Anhang:
1. Message-ID Dedup (Schicht 1) → skip wenn schon verarbeitet
2. Typ-Filter: PDF/JPG/PNG, ≤10MB, max. 10 pro Mail
3. Datei-Hash Dedup (Schicht 2) → skip wenn identische Datei schon vorhanden
4. [wenn ki_klassifizierung_aktiv] → Claude Haiku: BELEG / KEIN_BELEG / UNSICHER
   KEIN_BELEG → skip, loggen
   BELEG oder UNSICHER → weiter
5. Upload → Supabase Storage
6. OCR via performOcr() (Claude Haiku Vision)
7. INSERT INTO belege (quelle='mailbox')
8. Message-ID in verarbeitete_mailbox_nachrichten eintragen
```

---

### Einmaliges Setup außerhalb des Codes

**Google Cloud (Gmail):**
1. Gmail API aktivieren, OAuth2-Credentials (Web Application) erstellen
2. Redirect URIs: Prod + `localhost:3000` für Dev
3. Consent-Screen: Scope `gmail.readonly`

**Azure AD (Microsoft 365 & Outlook):**
1. Azure Portal → App-Registrierungen → Neue App, Typ: Multi-Tenant
2. Redirect URIs konfigurieren (Prod + Dev)
3. API-Berechtigungen: `Mail.Read` (Delegated, Microsoft Graph) → kein Admin-Consent nötig
4. Client Secret generieren → Vercel Env Vars

---

### Neue Dependencies

| Package | Zweck |
|---------|-------|
| `imapflow` | IMAP-Client |
| `googleapis` | Gmail API + Google OAuth2 |
| `@azure/msal-node` | Microsoft OAuth2 + Graph API Token-Management |

---

## Nicht im Scope (PROJ-32)

- Echtzeit-Push via Google Pub/Sub → Future (löst das Problem verschobener/gelöschter Mails für Gmail vollständig)
- IMAP-IDLE (persistente Push-Verbindung) → nicht möglich auf Vercel Serverless
- Interval unter 5 Minuten → möglich auf Vercel Pro mit angepasstem Overlap-Schutz
- Konfigurierbare Filter (nur bestimmte Absender, Betreff-Pattern) → Future
- Mehrere Postfächer pro Mandant → Future
- E-Mail-Benachrichtigung an Mandanten nach Import → Future

---

## Implementation Notes

### Frontend (2026-05-05)

**Status:** Frontend-Implementierung abgeschlossen, wartet auf Backend-Routen.

**Erstellte Dateien:**
- `src/app/(app)/settings/email-postfach/page.tsx` – Settings-Seite mit drei Zustaenden (Loading / keine Verbindung / aktive Verbindung), OAuth-Callback-Handling via Search-Params (`?status=connected`, `?error=...`)
- `src/components/mailbox/mailbox-types.ts` – Geteilte TypeScript-Types (`MailboxVerbindung`, `MailboxProvider`, `ImapFormularDaten`, `MailboxTestErgebnis`, `MailboxOrdnerListe`)
- `src/components/mailbox/anbieter-karten.tsx` – Drei Provider-Karten (IMAP mit Teal-Badge "Empfohlen", Gmail OAuth2, Microsoft 365 mit Badge "Demnaechst" und disabled Button)
- `src/components/mailbox/imap-formular.tsx` – Inline-Formular (Host/Port/SSL/E-Mail/Passwort/Ordner) mit Provider-Presets (Gmail, GMX, web.de, Outlook.com), Test-Button (Modus A) und Speichern-Button (aktiv erst nach erfolgreichem Test)
- `src/components/mailbox/verbindungs-status-card.tsx` – Status-Anzeige (aktiv/error), relative Zeitangabe ("vor X Minuten"), Test-Button (Modus B), "Neu verbinden" (nur bei error), "Verbindung trennen"
- `src/components/mailbox/einstellungen-panel.tsx` – Ordner-Auswahl (Lazy-Load via `GET /api/mailbox/ordner`), Startdatum-Picker (max. 90 Tage), KI-Klassifizierung-Switch
- `src/components/mailbox/trennen-dialog.tsx` – AlertDialog-Wrapper fuer Trennen-Bestaetigung

**Geaenderte Dateien:**
- `src/app/(app)/settings/layout.tsx` – Neuer Tab "E-Mail-Postfach"
- `src/components/belege/beleg-tabelle.tsx` – Inbox-Icon fuer `quelle='mailbox'` (analog zum Mail-Icon fuer `quelle='email'`). Da der bestehende `Beleg`-Type aktuell nur `'manual' | 'email'` kennt, wird `beleg.quelle` per `as string` verglichen – das Type-Update folgt im Backend-Schritt zusammen mit der Migration.

**Bewusste Entscheidungen:**
- Microsoft-Karte ist im UI bereits sichtbar, aber als disabled/`opacity-60` mit Badge "Demnaechst" markiert. Sobald PROJ-33 den Provider implementiert, wird sie aktiv – kein UI-Refactor noetig.
- Native HTML-`<input type="date">` statt eines neuen DayPicker-Components, da das Projekt aktuell keinen DayPicker installiert hat und ein simpler Datepicker ausreicht.
- Fehler-Toasts und Erfolg-Toasts via `sonner` (bereits projektweit etabliert).
- IMAP-Provider-Presets (Gmail/GMX/web.de/Outlook) als Schnellauswahl-Buttons – senkt die Hemmschwelle bei der Einrichtung.

**Erwartete Backend-Endpunkte (zu implementieren in `/backend`):**
- `GET /api/mailbox/verbindung` → 404 wenn keine Verbindung, sonst `MailboxVerbindung` (ohne `encrypted_payload`)
- `POST /api/mailbox/verbindung` → erwartet `{ provider: 'imap', credentials: ImapFormularDaten }` (Body-Schema noch nicht final)
- `PATCH /api/mailbox/verbindung` → `{ ordner_filter, import_seit, ki_klassifizierung_aktiv }`
- `DELETE /api/mailbox/verbindung` → hard delete
- `POST /api/mailbox/test` → Modus A: `{ provider, credentials }` ; Modus B: `{ verbindung_id }` ; liefert `MailboxTestErgebnis`
- `GET /api/mailbox/ordner` → `{ ordner: string[] }`
- `GET /api/mailbox/gmail/auth` → `{ auth_url: string }` (Redirect-URL inkl. CSRF-State)
- `GET /api/mailbox/gmail/callback` → tauscht Code → Tokens, Redirect zu `/settings/email-postfach?status=connected` oder `?error=...`

**Naechste Schritte:**
- `/backend` – Datenbank-Migration, AES-256-Encryption, API-Routes, Cron-Endpunkt, OAuth2-Flows
- `/qa` – Akzeptanzkriterien AC-1 bis AC-7 testen, Sicherheits-Review (RLS, encrypted_payload nicht im Frontend, CSRF-Schutz)
