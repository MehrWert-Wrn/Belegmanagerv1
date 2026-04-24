# PROJ-20: BanksAPI-Integration – Automatischer Kontoauszug-Import

## Status: Deployed
**Created:** 2026-04-14
**Last Updated:** 2026-04-23

> **Migration 2026-04-23:** Ursprünglich als FinAPI-Integration gestartet. Nach erfolgreichem Test mit BanksAPI (Tenant `mehrwerttest`) wurde FinAPI vollständig entfernt. BanksAPI ist die einzige PSD2-Quelle.

---

## Implementation Notes

### Backend (2026-04-23)
- Datenbank-Migration: `supabase/migrations/20260423000000_banksapi_integration.sql`
  - Neue Tabelle `banksapi_verbindungen` mit RLS + Indexes
  - Neue Tabelle `banksapi_sync_historie` mit RLS + Indexes
  - Neue Tabelle `banksapi_webform_sessions` für sicheren Hosted-UI Callback-Flow
  - Enum `banksapi_verbindung_status` (`aktiv` / `sca_faellig` / `fehler` / `getrennt`)
  - Enum `import_quelle_typ` um `'banksapi'` erweitert
  - `mandanten` um `banksapi_username` erweitert
- Service-Library: `src/lib/banksapi.ts`
  - AES-256-GCM Verschlüsselung für BanksAPI-User-Passwörter
  - Management-Token + User-Token Management
  - User-Anlage (einmalig pro Mandant)
  - Hosted-UI-Start via 451-Redirect + Location Header
  - Bankzugänge, Konten und Umsätze abrufen
  - Normalisierung der Umsätze in Transaktions-Objekte
- API-Routen unter `src/app/api/banksapi/`:
  - `GET /verbindungen` – Liste aller Verbindungen mit Sync-Historie
  - `POST /verbindungen` – Hosted-UI starten (User anlegen falls neu)
  - `DELETE /verbindungen/[id]` – Soft-Delete (Status `getrennt`)
  - `GET /callback` – Verarbeitet `?session=...&baReentry=ACCOUNT_CREATED`; legt Zahlungsquelle + `banksapi_verbindungen` pro Konto an
  - `POST /sync/[id]` – Umsätze abrufen, deduplizieren via `externe_id` + Cross-Source-Fallback, `executeMatching` auslösen; DB-Rate-Limit: max. 1 Sync pro Verbindung pro 5 Minuten

### Frontend (2026-04-23)
- Settings-Seite: `src/app/(app)/settings/bankverbindungen/page.tsx`
  - Zeigt alle aktiven BanksAPI-Verbindungen
  - "Bankkonto verbinden" startet Hosted-UI-Flow
  - Callback-Parameter `banksapi_success` / `banksapi_error` mit Toast-Benachrichtigungen
  - URL-Params werden nach Anzeige bereinigt
  - Leerzustand mit Erklärung
  - SCA-Warnung-Banner wenn Verbindungen Erneuerung brauchen
- Komponente: `src/components/bankverbindungen/banksapi-verbindung-karte.tsx`
  - Bank-Name + maskierte IBAN
  - Status-Badge (Aktiv / SCA fällig / Fehler / Getrennt)
  - "Jetzt synchronisieren" mit Lade-Zustand + Ergebnis-Anzeige
  - "Verbindung erneuern" (nur bei SCA/Fehler sichtbar)
  - "Trennen" mit AlertDialog-Bestätigung
  - Aufklappbare Sync-Historie (letzte 5 Einträge)
  - Tooltip am deaktivierten Sync-Button
- Types: `src/components/bankverbindungen/banksapi-types.ts`

### FinAPI entfernt (2026-04-23)
Migration `supabase/migrations/20260423100000_drop_finapi.sql` löscht alle FinAPI-Tabellen:
- `DROP TABLE finapi_sync_historie`
- `DROP TABLE finapi_webform_sessions`
- `DROP TABLE finapi_verbindungen`
- `ALTER TABLE mandanten DROP COLUMN finapi_user_id`

Gelöschte Code-Dateien: `src/lib/finapi.ts`, `src/app/api/finapi/` (4 Routen), `src/components/bankverbindungen/bankverbindung-karte.tsx`, `src/components/bankverbindungen/types.ts`

Bestehende Mandanten mit FinAPI-Verbindungen müssen Bankkonten einmalig neu über BanksAPI verbinden. Bereits importierte Transaktionen bleiben erhalten.

---

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen-Tabelle und Import-Logik
- Requires: PROJ-14 (Kontoauszug-Import Verbesserungen)
- Requires: PROJ-10 (Zahlungsquellen-Verwaltung) – Zahlungsquellen-Konzept
- Optional: PROJ-2 (Mandant-Onboarding) – Mandant muss existieren

---

## Hintergrund

Kontoauszug-Import erfolgte zunächst nur über manuellen CSV-Upload (PROJ-4). BanksAPI ist ein PSD2-lizenzierter Banken-Datendienst (AT/EU), der über ein Hosted-UI den Mandanten seine Bankverbindung sicher einrichten lässt – die App sieht keine Credentials.

BanksAPI-Tenant: `mehrwerttest`. Umgebungssteuerung ausschließlich über `BANKSAPI_BASE_URL`.

---

## User Stories

- Als Mandant möchte ich mein Bankkonto verbinden, damit Transaktionen automatisch importiert werden ohne monatlichen CSV-Upload.
- Als Mandant möchte ich "Jetzt synchronisieren" klicken, um jederzeit neue Transaktionen abzurufen.
- Als Mandant möchte ich mehrere Bankkonten verbinden (z.B. Girokonto + Firmenkreditkarte).
- Als Mandant möchte ich eine klare Warnung sehen wenn meine Bankverbindung abgelaufen ist (SCA-Erneuerung).
- Als Mandant möchte ich zwischen BanksAPI-Verbindung und CSV-Upload wählen (auch parallel).
- Als Mandant möchte ich sehen, wann die letzte Synchronisierung war und wie viele Transaktionen importiert wurden.

---

## Acceptance Criteria

### AC-1: Bankkonto verbinden via BanksAPI Hosted UI

- [ ] Einstellungen → "Bankverbindungen" → Schaltfläche "Bankkonto verbinden"
- [ ] Beim ersten Klick wird automatisch ein BanksAPI-User für den Mandanten angelegt (einmalig, für Mandanten unsichtbar)
- [ ] System startet BanksAPI Hosted UI (451-Redirect + Location Header)
- [ ] Mandant gibt Bankdaten direkt bei BanksAPI ein – keine Credentials in der App
- [ ] Nach Abschluss leitet BanksAPI zurück zur App (Callback `/api/banksapi/callback?session=...&baReentry=ACCOUNT_CREATED`)
- [ ] Bank-Verbindung (Bank-Name, IBAN, BanksAPI-interne IDs) wird in DB gespeichert; pro Konto wird eine Zahlungsquelle angelegt
- [ ] Fehlerfall (Abbruch, falsche Credentials) → verständliche Fehlermeldung, keine halbfertige Connection in DB
- [ ] RLS: Verbindungen mandantenspezifisch, kein Cross-Tenant-Zugriff

### AC-2: Manueller Transaktions-Sync

- [ ] Pro Verbindung "Jetzt synchronisieren"-Button
- [ ] Umsätze seit letztem Sync (oder 90 Tage bei erstem Sync) werden abgerufen
- [ ] Normalisierung (Datum, Betrag, Beschreibung) → Import in `transaktionen`
- [ ] Bereits importierte Transaktionen (via `externe_id`) werden als Duplikat übersprungen
- [ ] Cross-Source-Duplikat-Fallback: Datum + Betrag + Beschreibung gegen CSV-importierte Transaktionen
- [ ] Import-Ergebnis: X neu importiert, Y Duplikate übersprungen
- [ ] Fehlschlag zeigt verständliche Fehlermeldung; bereits importierte Transaktionen bleiben erhalten
- [ ] Matching-Engine (PROJ-5) wird nach Import automatisch ausgelöst
- [ ] Rate-Limit: max. 1 Sync pro Verbindung pro 5 Minuten (DB-basiert, serverless-sicher)

### AC-3: Verbindungsstatus & SCA-Erneuerung

- [ ] Status-Badge pro Verbindung: Aktiv / SCA fällig / Fehler / Getrennt
- [ ] Banner-Warnung wenn mindestens eine Verbindung SCA-Erneuerung benötigt
- [ ] "Verbindung erneuern"-Button startet erneuten Hosted-UI-Flow
- [ ] Sync-Button deaktiviert bei SCA fällig / Fehler, mit erklärendem Tooltip

### AC-4: Mehrere Bankkonten

- [ ] Beliebig viele Verbindungen pro Mandant
- [ ] Pro verbundenem Konto wird automatisch eine Zahlungsquelle angelegt
- [ ] `quelle_id` auf Transaktionen korrekt gesetzt

### AC-5: Koexistenz CSV-Upload und BanksAPI

- [ ] CSV-Upload bleibt vollständig erhalten
- [ ] Parallel-Nutzung möglich (z.B. BanksAPI für Girokonto, CSV für Kreditkarte)
- [ ] Duplikat-Erkennung quellen-agnostisch (externe_id + Datum/Betrag/Beschreibung)

### AC-6: Konfiguration via Umgebungsvariablen

- [ ] `BANKSAPI_BASE_URL` – Basis-URL (z.B. `https://banksapi.io`)
- [ ] `BANKSAPI_TENANT` – Tenant-Name (`mehrwerttest`)
- [ ] `BANKSAPI_AUTHORIZATION` – Basic Auth Header (`Basic <base64>`)
- [ ] `BANKSAPI_ENCRYPTION_KEY` – 64-Zeichen Hex-Key für AES-256-GCM
- [ ] Kein Code-Änderung bei Umgebungswechsel – nur `.env` + Redeployment

### AC-7: Sync-Historie & Transparenz

- [ ] Letzter Sync (Datum/Uhrzeit) + Anzahl importierter Transaktionen sichtbar
- [ ] Letzte 5 Syncs mit Ergebnis abrufbar

---

## Edge Cases

- **Mandant bricht Hosted UI ab:** Kein Callback → keine halbfertige Connection
- **Bank nicht bei BanksAPI:** Hosted UI zeigt Fehlermeldung direkt
- **BanksAPI nicht erreichbar:** Fehlermeldung "Synchronisierung fehlgeschlagen – bitte später versuchen"
- **Rate-Limit getroffen:** HTTP 429 mit Fehlermeldung, DB-basiert (serverless-sicher)
- **Mandant löscht Verbindung:** Bereits importierte Transaktionen bleiben erhalten
- **Erster Sync mit vielen Transaktionen:** Paginierung läuft vollständig durch
- **BanksAPI-User bereits vorhanden:** Beim Verbinden wird `banksapi_username` aus DB geladen statt neu angelegt

---

## Nicht in Scope

- Automatischer Hintergrund-Sync (Cron Job) – MVP = manueller Sync
- Push-Benachrichtigung bei neuen Transaktionen
- BanksAPI-eigene Kategorisierung nutzen (Matching-Engine übernimmt das)
- Kontosaldo-Anzeige
- Admin-Ansicht für Bankverbindungen aller Mandanten

---

## Datenmodell

### Tabelle: `banksapi_verbindungen`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | uuid PK | |
| mandant_id | uuid FK | Multi-Tenancy, RLS |
| zahlungsquelle_id | uuid FK | Verknüpfung zur Zahlungsquelle |
| banksapi_username | text | BanksAPI-User-Name des Mandanten |
| banksapi_access_id | text | BanksAPI-interne Bankzugang-ID |
| banksapi_product_id | text | BanksAPI-interne Produkt-ID |
| bank_name | text | Anzeigename der Bank |
| iban | text | IBAN (nur Anzeige) |
| status | enum | `aktiv` / `sca_faellig` / `fehler` / `getrennt` |
| letzter_sync_at | timestamptz | |
| letzter_sync_anzahl | int | Transaktionen beim letzten Sync |
| created_at | timestamptz | |

### Tabelle: `banksapi_sync_historie`

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | uuid PK | |
| verbindung_id | uuid FK | Referenz auf `banksapi_verbindungen` |
| mandant_id | uuid FK | Multi-Tenancy, RLS |
| synced_at | timestamptz | |
| anzahl_importiert | int | |
| anzahl_duplikate | int | |
| status | text | `success` / `error` |
| fehler_meldung | text | bei status=error |

### Tabelle: `banksapi_webform_sessions`
Temporäre Sessions für den Hosted-UI Callback-Flow. Speichert BanksAPI-User-Passwort AES-256-GCM verschlüsselt.

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | uuid PK | Session-UUID (einziger Parameter in Callback-URL) |
| mandant_id | uuid FK | |
| banksapi_username | text | |
| banksapi_user_password_encrypted | text | AES-256-GCM |
| status | text | `pending` / `completed` / `failed` / `expired` |
| created_at | timestamptz | |
| expires_at | timestamptz | +1 Stunde ab Anlage |

### Erweiterungen bestehender Tabellen

**`transaktionen`** (bereits deployed, PROJ-20 Phase 1):
- `externe_id` (text, nullable) – BanksAPI-Transaktions-ID zur Duplikat-Erkennung
- `import_quelle` (enum `csv` / `banksapi`) – Herkunft für Audit

**`mandanten`**:
- `banksapi_username` (text, nullable) – BanksAPI-User; einmalig beim ersten Verbinden angelegt

---

## Tech Design

### BanksAPI Hosted-UI Flow

```
"Bankkonto verbinden" → POST /api/banksapi/verbindungen
→ BanksAPI-User anlegen falls nicht vorhanden (banksapi_username aus mandanten)
→ Session in banksapi_webform_sessions speichern (verschlüsseltes Passwort)
→ BanksAPI-Hosted-UI starten: POST /api/v1/oauth2/token + POST /api/v1/products/{tenant}/bankAccess
   → 451 Response + Location Header → client-seitig zu dieser URL weiterleiten
→ Mandant gibt Bankdaten direkt bei BanksAPI ein
→ BanksAPI redirectet zu /api/banksapi/callback?session={uuid}&baReentry=ACCOUNT_CREATED
→ Session aus DB laden, Mandant verifizieren
→ Bankzugänge + Konten von BanksAPI API laden
→ Pro Konto: Zahlungsquelle anlegen + banksapi_verbindungen-Eintrag
→ Redirect zu /settings/bankverbindungen?banksapi_success=true
```

### Sync-Flow

```
"Jetzt synchronisieren" → POST /api/banksapi/sync/[id]
→ Rate-Limit prüfen (letzter Sync < 5 Minuten? → 429)
→ BanksAPI-Token mit gespeicherten Credentials holen
→ Umsätze seit letztem Sync paginiert abrufen
→ Duplikat-Check 1: externe_id (banksapi_<id>)
→ Duplikat-Check 2: datum + betrag + beschreibung gegen CSV-Transaktionen
→ Neue Transaktionen importieren
→ executeMatching() auslösen
→ banksapi_verbindungen + banksapi_sync_historie aktualisieren
→ Ergebnis: { importiert: X, duplikate: Y }
```

### Sicherheit

- AES-256-GCM Verschlüsselung des BanksAPI-User-Passworts (Node.js built-in `crypto`)
- Session-UUID in Callback-URL statt Credentials
- Session-Ablauf nach 1 Stunde
- Mandant-Verifizierung im Callback (session.mandant_id vs. aktueller User)
- Authentifizierung auf allen API-Routen via `requireAuth()`
- `requireAdmin()` auf POST + DELETE
- RLS auf allen neuen Tabellen

### Umgebungsvariablen

| Variable | Beschreibung |
|----------|-------------|
| `BANKSAPI_BASE_URL` | `https://banksapi.io` |
| `BANKSAPI_TENANT` | `mehrwerttest` |
| `BANKSAPI_AUTHORIZATION` | `Basic <base64(user:pass)>` |
| `BANKSAPI_ENCRYPTION_KEY` | 64-Zeichen Hex (`openssl rand -hex 32`) |

---

## QA

### FinAPI QA (historisch, 2026-04-14)
Die ursprüngliche FinAPI-Implementation wurde vollständig getestet (29 ACs, 8 Bugs gefunden und gefixt). Mit der Migration zu BanksAPI am 2026-04-23 wurde der FinAPI-Code entfernt – diese QA-Ergebnisse sind nur noch historisch relevant.

### BanksAPI – Production Readiness (2026-04-23)
Code Review der BanksAPI-Implementation:

| Check | Status |
|-------|--------|
| Authentifizierung auf allen Routen | PASS |
| RLS auf allen neuen Tabellen | PASS |
| Mandant-Isolation (mandant_id) | PASS |
| AES-256-GCM Verschlüsselung | PASS |
| Session-Verifizierung im Callback | PASS |
| Rate-Limit DB-basiert (serverless-sicher) | PASS |
| Cross-Source Duplikat-Erkennung | PASS |
| Keine Credentials in Callback-URL | PASS |
| executeMatching() nach Import | PASS |

---

## Deployment

### Phase 1: FinAPI (2026-04-14, veraltet)
- Tag: `v1.20.0-PROJ-20` / `v1.20.1-PROJ-20-bugfix`
- Migration: `20260414100000_finapi_integration` (**nicht mehr aktiv**)

### Phase 2: BanksAPI + FinAPI-Entfernung (2026-04-23)
**Production URL:** https://belegmanagerv1.vercel.app/settings/bankverbindungen

**Migrationen (angewendet):**
- `20260423000000_banksapi_integration` – neue BanksAPI-Tabellen
- `20260423100000_drop_finapi` – FinAPI-Tabellen und -Spalten gelöscht

**Neue Dateien:**
- `src/lib/banksapi.ts`
- `src/app/api/banksapi/` (5 Routen)
- `src/components/bankverbindungen/banksapi-verbindung-karte.tsx`
- `src/components/bankverbindungen/banksapi-types.ts`

**Geänderte Dateien:**
- `src/app/(app)/settings/bankverbindungen/page.tsx` – BanksAPI-only
- `src/components/onboarding/onboarding-checkliste.tsx` – "BanksAPI" statt "FinAPI"
- `.env.local.example` – BanksAPI-Variablen, FinAPI-Variablen entfernt

**Gelöschte Dateien:**
- `src/lib/finapi.ts`
- `src/app/api/finapi/` (4 Routen)
- `src/components/bankverbindungen/bankverbindung-karte.tsx`
- `src/components/bankverbindungen/types.ts`

**Erforderliche Vercel-Umgebungsvariablen:**
- `BANKSAPI_BASE_URL=https://banksapi.io`
- `BANKSAPI_TENANT=mehrwerttest`
- `BANKSAPI_AUTHORIZATION=Basic <base64>`
- `BANKSAPI_ENCRYPTION_KEY=<64-hex>`
