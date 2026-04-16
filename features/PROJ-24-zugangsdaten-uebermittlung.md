# PROJ-24: Sichere Zugangsdaten-Übermittlung für E-Mail-Anbindung

## Status: In Progress
**Created:** 2026-04-16
**Last Updated:** 2026-04-16

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

- [ ] Admin-Übersichtsseite zeigt Badge "X neue Zugangsdaten" wenn `acknowledged_at IS NULL AND deleted_at IS NULL`
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
| `deleted_at` | `timestamptz` (nullable) | Zeitpunkt der Löschmarkierung (wird direkt hard-deleted) |

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
