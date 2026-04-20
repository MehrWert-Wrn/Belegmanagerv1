# PROJ-30: E-Mail-Belegeingang (testphase@belegmanager.at)

## Status: Deployed
**Created:** 2026-04-20
**Last Updated:** 2026-04-20

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Beleg-Datenmodell und Storage-Infrastruktur
- Requires: PROJ-15 (OCR-Erkennung) – POST /api/belege/ocr Endpunkt mit Claude Haiku Vision
- Requires: PROJ-1 (Authentifizierung) – profiles-Tabelle für Mandant-Lookup via E-Mail

## Übersicht

Mandanten können während der kostenlosen Testphase Belege als E-Mail-Anhänge an `testphase@belegmanager.at` senden. Das System erkennt anhand der Absender-E-Mail den zugehörigen Mandanten, verarbeitet die Anhänge via OCR und legt die Belege automatisch in der Belegliste des Mandanten an.

Zielgruppe: Testphase-Nutzer, die noch kein eigenes Beleg-Postfach haben (dieses wird nur für zahlende Mandanten nach der Testphase freigeschaltet).

## User Stories

- Als Mandant möchte ich Belege per E-Mail an testphase@belegmanager.at senden, damit ich keine Dateien manuell im Browser hochladen muss.
- Als Mandant möchte ich, dass die Belege automatisch per OCR ausgelesen und benannt werden, damit ich keine Metadaten manuell eingeben muss.
- Als Mandant möchte ich, dass nur Belege von meiner registrierten E-Mail-Adresse akzeptiert werden, damit keine Fremddaten in meinem Konto landen.
- Als Mandant möchte ich eine Bounce-Mail erhalten, wenn meine E-Mail-Adresse nicht im System registriert ist, damit ich weiß, dass etwas nicht stimmt.
- Als Mandant möchte ich die per E-Mail importierten Belege in der App im Review-Modus prüfen und korrigieren können, genau wie beim Massenimport.

## Acceptance Criteria

### E-Mail-Empfang & Routing
- [ ] Postmark Inbound ist für `testphase@belegmanager.at` konfiguriert (MX-Record auf Postmark gesetzt)
- [ ] Eingehende E-Mails werden als Webhook (`POST /api/email-inbound`) an die App weitergeleitet
- [ ] Der Webhook-Endpunkt ist durch einen Postmark-Webhook-Token gesichert (Header-Validierung)
- [ ] Nur Anhänge vom Typ PDF, JPG, PNG werden verarbeitet (andere werden ignoriert)
- [ ] Maximale Dateigröße pro Anhang: 10 MB (größere Anhänge werden mit Hinweis in Bounce-Mail erwähnt)
- [ ] Bis zu 10 Anhänge pro E-Mail werden verarbeitet; weitere werden ignoriert

### Mandant-Identifikation
- [ ] Absender-E-Mail (FROM) wird gegen `profiles.email` in Supabase geprüft
- [ ] Bei mehreren Benutzern mit derselben E-Mail: der erste Treffer wird verwendet (sollte durch Unique-Constraint nicht vorkommen)
- [ ] Mandant wird über `profiles.mandant_id` ermittelt

### Unbekannter Absender
- [ ] Wenn keine Übereinstimmung gefunden wird: automatische Bounce-Mail an Absender über Postmark Outbound
- [ ] Bounce-Mail-Text: „Ihre E-Mail-Adresse ({{from}}) ist nicht in Belegmanager registriert. Bitte melden Sie sich an unter belegmanager.at und verwenden Sie die dort hinterlegte E-Mail-Adresse."
- [ ] Kein Beleg wird angelegt, keine weiteren Verarbeitungsschritte

### OCR-Verarbeitung
- [ ] Jeder gültige Anhang wird sequentiell an `POST /api/belege/ocr` gesendet (bestehender Endpunkt)
- [ ] OCR-Ergebnisse (Lieferant, Rechnungsnummer, Datum, Beträge, MwSt) werden als Beleg-Metadaten gespeichert
- [ ] Dateiname wird nach der OCR-Konvention benannt: `JJJJ-MM-TT_Lieferant_Betrag.pdf` (wenn OCR erfolgreich), sonst Originaldateiname
- [ ] OCR-Fehler blockieren nicht den Import der anderen Anhänge – fehlerhafte Dateien werden trotzdem als Beleg angelegt (mit `rechnungsname = NULL`)
- [ ] Datei wird in Supabase Storage unter dem Mandanten-Bucket gespeichert

### Beleg-Anlage in der App
- [ ] Pro Anhang wird ein Beleg-Eintrag in der `belege`-Tabelle mit der korrekten `mandant_id` angelegt
- [ ] Belege, bei denen OCR erfolgreich war, erhalten `rechnungsname` gesetzt
- [ ] Belege ohne OCR-Ergebnis erhalten `rechnungsname = NULL` (signalisiert: noch nicht reviewed, wie beim Massenimport)
- [ ] Quelle des Belegs wird als `quelle = 'email'` gespeichert (neues Feld in `belege`)
- [ ] In der Belegliste sind E-Mail-importierte Belege durch ein E-Mail-Icon erkennbar
- [ ] Nicht-reviewte E-Mail-Belege können über den bestehenden Massenimport-Review-Modus (PROJ-15) geprüft werden

### Sicherheit & DSGVO
- [ ] Webhook-Endpunkt validiert Postmark-Signatur-Header (`X-Postmark-Signature`) – unautorisierte Requests werden mit 401 abgelehnt
- [ ] E-Mail-Inhalte (Body-Text) werden nicht gespeichert, nur Anhänge
- [ ] Supabase RLS stellt sicher, dass Belege nur dem korrekten Mandanten zugeordnet werden können
- [ ] Service Role Key wird nur server-seitig im Webhook-Handler verwendet

## Edge Cases

- **Absender-Domain stimmt nicht überein:** E-Mail von `max@firma.at` während registriert ist `max@privat.at` → Bounce-Mail, kein Import
- **E-Mail ohne Anhang:** Bounce-Mail: „Ihre E-Mail enthielt keine verarbeitbaren Anhänge (PDF, JPG, PNG)."
- **Anhang ist passwortgeschütztes PDF:** OCR schlägt fehl → Beleg wird ohne Metadaten angelegt, `rechnungsname = NULL`
- **Doppelter Beleg (gleiche Datei nochmals gesendet):** Über bestehenden Hash-Check (`/api/belege/check-hash`) erkannt → doppelter Beleg wird übersprungen, Hinweis in Bounce-Mail
- **Postmark-Webhook wird mehrfach gesendet (Retry):** Idempotenz via Postmark-MessageID als Deduplizierungs-Key
- **Mandant hat Monatsabschluss gesperrt:** Belege werden trotzdem importiert (für Folgemonat oder manuelles Handling)
- **Anhang > 10 MB:** Wird übersprungen, in Bounce-Mail erwähnt: „Datei 'rechnung.pdf' (12 MB) wurde übersprungen – Maximum ist 10 MB."
- **Mehr als 10 Anhänge:** Erste 10 werden verarbeitet, Rest ignoriert; Bounce-Mail erwähnt die Begrenzung

## Technical Requirements

- **Webhook-Endpunkt:** `POST /api/email-inbound` (neue API Route)
- **Authentifizierung:** Postmark Webhook-Token (kein Supabase Auth, da externer Service)
- **OCR-Wiederverwendung:** Bestehender `/api/belege/ocr` Endpunkt wird intern aufgerufen
- **E-Mail-Versand (Bounce):** Postmark Outbound API oder bestehender E-Mail-Service
- **Neues DB-Feld:** `belege.quelle` (enum: `'manual' | 'email'`, default `'manual'`)
- **Postmark Plan:** Free Tier (100 E-Mails/Monat) reicht für Testphase; bei Wachstum ~$15/Monat
- **Umgebungsvariablen:** `POSTMARK_INBOUND_TOKEN`, `POSTMARK_SERVER_TOKEN` (für Bounce-Mails)
- **Verarbeitung:** Sequentiell pro Anhang (wie Massenimport), verhindert OCR Rate-Limiting

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Überblick: Wie die Teile zusammenspielen

```
Mandant sendet E-Mail
        │
        ▼
 Postmark Inbound
 (MX-Record für belegmanager.at)
        │  HTTP POST mit geparster E-Mail (JSON)
        ▼
 POST /api/email-inbound          ← neue API Route (kein Supabase Auth,
        │                            stattdessen Postmark-Token-Validierung)
        ├─ Signatur prüfen
        ├─ Absender-E-Mail → Mandant-Lookup (profiles-Tabelle)
        │
        ├─ [Nicht gefunden] → Bounce-Mail via Postmark Outbound → fertig
        │
        └─ [Gefunden] → Verarbeitung
               │
               ├─ Idempotenz-Check: MessageID bereits verarbeitet? → fertig
               │
               ├─ Anhänge filtern (PDF/JPG/PNG, ≤10 MB, max. 10 Stück)
               │
               └─ Pro Anhang (sequentiell):
                     ├─ Hash-Check: Duplikat? → überspringen
                     ├─ Datei → Supabase Storage (Mandanten-Bucket)
                     ├─ OCR via performOcr() (interne Lib-Funktion)
                     ├─ Dateiname aus OCR-Ergebnis generieren
                     └─ Beleg in DB anlegen (quelle = 'email')
```

### Warum `performOcr()` direkt aufrufen (nicht via HTTP)?

Der bestehende `/api/belege/ocr`-Endpunkt erfordert eine eingeloggte Supabase-Session. Der E-Mail-Webhook kommt von Postmark (kein eingeloggter Nutzer). Statt den Auth-Check zu umgehen, rufen wir die zugrunde liegende OCR-Bibliotheksfunktion `performOcr()` aus `src/lib/ocr.ts` direkt auf – dieselbe Funktion, die auch der reguläre Endpunkt verwendet. Kein duplizierter Code, keine Auth-Komplikationen.

### Datenbankänderungen

**Tabelle `belege` – neues Feld:**
```
quelle: TEXT, default 'manual'
        Mögliche Werte: 'manual' | 'email'
```
Alle bestehenden Belege behalten automatisch `'manual'`. Keine Datenmigration nötig.

**Neue Tabelle `verarbeitete_email_nachrichten`:**
```
id            – automatisch generiert
message_id    – Postmark MessageID (einzigartig)
verarbeitet_am – Zeitstempel
```
Zweck: Verhindert, dass Postmark-Retry-Webhooks denselben Import doppelt auslösen. Wenn eine MessageID bereits in dieser Tabelle steht, wird der Webhook sofort mit 200 OK beantwortet ohne nochmals zu verarbeiten.

### Sicherheitskonzept

| Risiko | Gegenmaßnahme |
|--------|---------------|
| Gefälschter Webhook (kein Postmark) | `X-Postmark-Signature`-Header wird kryptografisch verifiziert |
| Fremder Mandant erhält Belege | Absender-E-Mail muss exakt in `profiles.email` vorhanden sein |
| RLS-Bypass via Service Role | Service Role Key nur im Server-seitigen Webhook-Handler, niemals im Frontend |
| Datenleck zwischen Mandanten | Supabase RLS auf `belege`-Tabelle bleibt unverändert aktiv |
| Spam / Massenangriff | Postmark filtert bereits Spam; max. 10 Anhänge pro E-Mail |

### Frontend-Änderungen (minimal)

Nur eine kleine Ergänzung in der bestehenden Belegliste:
```
Belegliste (bestehendes Component)
└─ Beleg-Zeile
   └─ [NEU] Mail-Icon (✉) wenn quelle = 'email'
      Tooltip: "Via E-Mail importiert"
```

Kein neues Page, kein neuer Dialog. Der Review-Modus für unvollständige OCR-Ergebnisse (`rechnungsname = NULL`) läuft über den bereits bestehenden `BelegReviewModus` aus PROJ-15.

### Benötigte Umgebungsvariablen

| Variable | Zweck |
|----------|-------|
| `POSTMARK_INBOUND_TOKEN` | Verifiziert, dass Webhook wirklich von Postmark kommt |
| `POSTMARK_SERVER_TOKEN` | Zum Versenden von Bounce-Mails via Postmark Outbound API |

Beide nur server-seitig, niemals mit `NEXT_PUBLIC_`-Präfix.

### Neue Abhängigkeit

- **`postmark`** (npm) – offizielles Postmark Node.js SDK; für Webhook-Signatur-Validierung und Bounce-Mail-Versand

### Postmark-Setup (einmalig, außerhalb des Codes)

1. Postmark-Account anlegen → Server erstellen
2. Inbound Domain: `inbound.belegmanager.at` bei Postmark registrieren
3. MX-Record bei DNS-Provider setzen: `belegmanager.at MX → inbound.postmarkapp.com`
4. Webhook-URL in Postmark konfigurieren: `https://belegmanager.at/api/email-inbound`
5. Inbound-Token aus Postmark Dashboard → `POSTMARK_INBOUND_TOKEN` in Vercel setzen

### Technische Entscheidungen

| Entscheidung | Gewählt | Begründung |
|---|---|---|
| E-Mail-Service | Postmark Inbound | Einfachste Integration, zuverlässiges Parsing, EU-Daten möglich |
| OCR-Aufruf | Direkt via `performOcr()` | Kein Auth-Overhead, selber Code-Pfad wie manueller Upload |
| Idempotenz | Separate DB-Tabelle | Sauberer als Felder auf belege, unabhängig von Beleg-Anzahl pro Mail |
| Bounce-Mails | Postmark Outbound API | Selber Anbieter → kein zweites E-Mail-System nötig |
| Verarbeitung | Sequentiell | Verhindert OCR-Rate-Limiting (wie Massenimport in PROJ-15) |
| Frontend | Nur Mail-Icon | Minimaler Scope – Review via bestehendem Massenimport-Flow |

## Backend Implementation Notes

### Neue Dateien

| Pfad | Zweck |
|------|-------|
| `supabase/migrations/20260420000000_email_belegeingang.sql` | Fuegt `belege.quelle` + neue Tabelle `verarbeitete_email_nachrichten` hinzu |
| `src/lib/postmark.ts` | Postmark-Signatur-Validierung, Bounce-Mail-Versand, Helper zum Extrahieren der Absender-E-Mail |
| `src/app/api/email-inbound/route.ts` | Webhook-Handler fuer Postmark Inbound |

### Geaenderte Dateien

| Pfad | Aenderung |
|------|-----------|
| `src/app/api/belege/route.ts` | Zod-Schema erweitert um `quelle: 'manual' \| 'email'` |
| `src/app/api/belege/[id]/route.ts` | PATCH benennt Storage-Datei um, wenn `rechnungsname` geaendert wird (fuer Review-Modus) |
| `src/components/belege/beleg-review-modus.tsx` | Auto-Rechnungsname aus OCR-Feldern ("DD.MM.YYYY - Lieferant - Rechnungsnummer") |
| `src/components/belege/beleg-upload-dialog.tsx` | Gleiches Auto-Naming-Schema fuer Einzelupload |
| `.env.local.example` | Neue Vars: `POSTMARK_INBOUND_TOKEN`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_BOUNCE_SENDER` |
| `package.json` | Neue Dependency `postmark ^4.0.7` |

### Datenbankaenderungen (Migration `20260420000000_email_belegeingang.sql`)

1. **`belege.quelle TEXT NOT NULL DEFAULT 'manual'`** mit CHECK-Constraint (`'manual'` oder `'email'`). Partial Index `idx_belege_quelle` auf `(mandant_id, quelle) WHERE quelle <> 'manual'` fuer schnelles Filtern der E-Mail-Belege. Bestehende Zeilen erhalten automatisch `'manual'`.
2. **`verarbeitete_email_nachrichten`**-Tabelle mit `message_id` (UNIQUE), `mandant_id`, `from_email`, `anhang_anzahl`, `status` (`'processed' | 'bounced' | 'skipped'`), `fehlermeldung`, `verarbeitet_am`. RLS aktiviert, SELECT-Policy beschraenkt auf eigenen Mandanten; keine INSERT/UPDATE/DELETE-Policies (nur Service Role schreibt). Zwei Indizes: `(mandant_id, verarbeitet_am DESC)` und `(status, verarbeitet_am DESC)` fuer Admin-Analysen.

### API-Endpunkt `POST /api/email-inbound`

- **Runtime:** `nodejs`, `maxDuration = 300s` (OCR fuer 10 Anhaenge kann dauern).
- **Auth:** Postmark-Signatur ueber `verifyPostmarkRequest()` – akzeptiert sowohl HTTP-Basic-Auth (`Authorization: Basic base64(user:token)`) als auch `X-Postmark-Signature` (raw token oder HMAC-SHA256 ueber Body). `crypto.timingSafeEqual` gegen Timing-Attacks. 401 bei Fehlschlag.
- **Idempotenz:** Pre-Check auf `verarbeitete_email_nachrichten.message_id`; bei Treffer sofort `{ok:true, deduplicated:true}` ohne weitere Verarbeitung. Log-Insert-Fehler mit Code `23505` werden toleriert (Race-Condition bei Parallel-Retries).
- **Mandant-Lookup:** Primaer via `profiles.email` (`ilike` fuer Case-Insensitive-Matching) → dann aktive `mandant_users.user_id`-Zuordnung. Fallback fuer eingeladene Benutzer: `mandant_users.email` + `aktiv = true` + `einladung_angenommen_am IS NOT NULL`.
- **Unbekannter Absender:** Bounce-Mail via Postmark Outbound, Log-Eintrag mit `status='bounced'`, kein Beleg-Import.
- **Anhang-Klassifikation:** Pro E-Mail max. 10 Anhaenge, max. 10 MB pro Anhang, erlaubte MIME-Typen `application/pdf`, `image/jpeg`, `image/jpg`, `image/png` (Fallback auf Dateiendung). Uebergroesse/falscher Typ/Ueber-Limit werden im Bounce-Detail-Text gemeldet.
- **Verarbeitung pro Anhang (sequentiell):**
  1. SHA-256-Hash fuer Duplicate-Check (`belege.file_hash`, respektiert `geloescht_am IS NULL`).
  2. Upload nach `belege`-Bucket als `<mandant_id>/<uuid>.<ext>`.
  3. OCR via `performOcr()` direkt aus `src/lib/ocr.ts` (kein HTTP-Roundtrip → kein Auth-Overhead, gleicher Code-Pfad wie manueller Upload). Datei > 5 MB ueberspringen (OCR-Limit).
  4. Rechnungsname aus `rechnungsdatum_lieferant_bruttobetrag` generieren, Storage-Objekt optional umbenennen (Copy + Remove, Fehler tolerieren).
  5. `INSERT INTO belege` mit `quelle='email'`, `rechnungstyp='eingangsrechnung'`, OCR-Metadaten soweit vorhanden. Storage-Objekt wird bei DB-Fehler wieder entfernt (keine Waisen).
- **Post-Processing:** Wenn es uebersprungene, doppelte oder fehlerhafte Anhaenge gibt, wird eine Info-Bounce-Mail mit Detailliste gesendet. Alle Ergebnisse werden in `verarbeitete_email_nachrichten` protokolliert.

### Sicherheits-Garantien

- Service Role Key wird ausschliesslich im Webhook-Handler verwendet (`createAdminClient()`), niemals im Frontend.
- Supabase RLS auf `belege` bleibt unveraendert aktiv – Service Role umgeht sie nur dort, wo explizit `mandant_id` gesetzt wird.
- Postmark-Token-Validierung vor jedem DB-Zugriff. Unautorisierte Requests werden mit 401 abgelehnt, bevor der Body geparst wird.
- Bounce-Mail-Versand via Postmark Outbound schlaegt niemals die Haupt-Verarbeitung (`try/catch` ohne Re-Throw).
- Keine E-Mail-Bodies werden persistiert – nur Anhaenge, Absender, MessageID und Status.

### Umgebungsvariablen

| Variable | Pflicht | Zweck |
|----------|---------|-------|
| `POSTMARK_INBOUND_TOKEN` | Ja | Validiert Postmark-Webhook-Requests |
| `POSTMARK_SERVER_TOKEN` | Ja | Server-Token fuer Postmark Outbound (Bounce-Mails) |
| `POSTMARK_BOUNCE_SENDER` | Nein | Absenderadresse fuer Bounce-Mails, Default `noreply@belegmanager.at` |
| `ANTHROPIC_API_KEY` | Ja | bereits vorhanden, fuer OCR |
| `SUPABASE_SERVICE_ROLE_KEY` | Ja | bereits vorhanden, fuer Admin-Zugriff im Webhook |

### Bewusst nicht implementiert (fuer QA/Deploy)

- **Postmark-Konfiguration (Webhook-URL, MX-Record, DKIM/SPF):** Manuelle Einrichtung durch DevOps, siehe Abschnitt "Postmark-Setup (einmalig, außerhalb des Codes)" im Tech Design.
- **Mail-Icon in Belegliste:** Frontend-Aufgabe (siehe Acceptance Criteria) – noch ausstehend fuer `/frontend`.
- **Rate-Limiting des Webhook-Endpunkts:** Verlassen uns vorerst auf Postmark-interne Spam-Filter + 10-Anhang-Limit pro Mail.

## Frontend Implementation Notes
_To be added by /frontend_

## QA Test Results

**Tested:** 2026-04-20 (Round 2 – Re-Verification nach Backend-/Frontend-Fixes)
**Tester:** QA Engineer (AI) – Static Code Review + Security Audit
**Scope:** Re-Verification der in Round 1 dokumentierten Bugs gegen aktuellen Code: `src/app/api/email-inbound/route.ts`, `src/lib/postmark.ts`, `src/components/belege/beleg-tabelle.tsx`, `src/app/api/belege/route.ts`, Migration `20260420000000_email_belegeingang.sql`. Live-HTTP-Test gegen Postmark nicht moeglich (externer Service). Cross-Browser-/Responsive-Tests siehe Frontend-Absatz unten.

### Round-2-Summary: Was hat sich geaendert?

Round-1-Bugs wurden groesstenteils gefixt:
- BUG-30-001 (MIME/EXT OR-Logik) → **gefixt** (`extOk && mimeOk`, Zeile 326)
- BUG-30-002 (Buffer-Size-Check) → **gefixt** (Zeile 375 `buffer.length > MAX_ATTACHMENT_BYTES`)
- BUG-30-003 (Mail-Icon) → **gefixt** (`beleg-tabelle.tsx` Zeilen 196–203 rendern Mail-Icon bei `quelle === 'email'`)
- BUG-30-004 (Matching-Trigger) → **gefixt** (Zeilen 191–195 rufen `executeMatching` fire-and-forget)
- BUG-30-006 (TIFF-Edge) → **nicht mehr reproduzierbar**, da `classifyAttachments` jetzt Extension erzwingt (`tiff` ist nicht whitelisted → Anhang wird abgelehnt)

Verbleibend offen: BUG-30-005 (Rate-Limiting), BUG-30-007 (`file_size`), BUG-30-008 (Bounce-Noise bei Signaturen), BUG-30-009 (Naming-Spec-Text) – alle Low.

### Acceptance Criteria Status

#### AC-1: E-Mail-Empfang & Routing
- [~] Postmark Inbound fuer `testphase@belegmanager.at` konfiguriert – NICHT verifizierbar in QA (externes DNS/Postmark-Dashboard, lt. Spec „manuelle Einrichtung durch DevOps"). Codeseitig ist der Handler vorbereitet.
- [x] Webhook-Endpunkt `POST /api/email-inbound` existiert (`src/app/api/email-inbound/route.ts`, Zeilen 45–223).
- [x] Webhook-Endpunkt ist durch Postmark-Token gesichert: Basic-Auth ODER `X-Postmark-Signature` via `verifyPostmarkRequest()` (Zeilen 41–73 in `postmark.ts`). 401 bei Fehlschlag.
- [x] Anhangs-Typfilter PDF/JPG/PNG: jetzt `extOk && mimeOk` (Zeile 326) → sowohl Extension als auch MIME muessen passen (MIME-generic `octet-stream`/leer wird akzeptiert, weil das in Postmark-Payloads haeufig ist – Extension bleibt die Anker-Pruefung).
- [x] Max. 10 MB pro Anhang – `MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024` (Zeile 20) plus Re-Check nach base64-Decode (Zeile 375).
- [x] Max. 10 Anhaenge pro E-Mail – `MAX_ATTACHMENTS_PER_EMAIL = 10` (Zeile 23).

#### AC-2: Mandant-Identifikation
- [x] Absender-E-Mail wird gegen `profiles.email` geprueft (Zeile 271) mit Case-Insensitive `ilike`.
- [x] Bei Duplikat wird erster Treffer verwendet (`maybeSingle()` + `limit(1)`).
- [x] Mandant wird ueber `mandant_users.mandant_id` ermittelt (Zeilen 275–284), Fallback fuer eingeladene User Zeilen 289–296.

#### AC-3: Unbekannter Absender
- [x] Bounce-Mail via Postmark Outbound (Zeilen 112–116).
- [x] Bounce-Mail-Text entspricht Spec (Zeilen 114 + 115).
- [x] Kein Beleg wird angelegt – frueher `return` (Zeile 125).

#### AC-4: OCR-Verarbeitung
- [x] Jeder Anhang wird sequentiell via `performOcr()` verarbeitet (direkter Lib-Aufruf, Zeile 431).
- [x] OCR-Metadaten (Lieferant, Rechnungsnummer, Datum, Betraege, MwSt) werden als Beleg gespeichert (Zeilen 469–476).
- [~] Dateiname nach Konvention `JJJJ-MM-TT_Lieferant_Betrag.pdf` – `buildRechnungsname` liefert `YYYY-MM-DD_Lieferant_XX.XX` ohne Extension im DB-Feld (Extension wird am Dateinamen im Storage angehaengt). Siehe BUG-30-009 (Low, Wording der Spec).
- [x] OCR-Fehler blockieren nicht den Import – `try/catch` um `performOcr()` (Zeilen 430–434).
- [x] Datei wird in Supabase Storage unter dem Mandanten-Bucket `<mandantId>/<uuid>.<ext>` gespeichert (Zeile 410).

#### AC-5: Beleg-Anlage in der App
- [x] Pro Anhang ein `belege`-Eintrag mit korrekter `mandant_id` (Zeile 459).
- [x] Erfolgreiche OCR → `rechnungsname` gesetzt (Zeile 476).
- [x] Fehlgeschlagene OCR → `rechnungsname = NULL` (insertPayload ohne `rechnungsname`).
- [x] `quelle = 'email'` wird gesetzt (Zeile 465), Migration fuehrt Spalte mit CHECK-Constraint ein.
- [x] Mail-Icon in der Belegliste: `beleg-tabelle.tsx` Zeilen 196–203 rendern `<Mail />` (`lucide-react`) mit Tooltip „Via E-Mail importiert" wenn `beleg.quelle === 'email'`.
- [~] Nicht-reviewte E-Mail-Belege via bestehenden BelegReviewModus (PROJ-15) – funktioniert technisch (RLS + `rechnungsname IS NULL`-Filter). Nicht separat getestet.

#### AC-6: Sicherheit & DSGVO
- [x] Webhook validiert Signatur mit `crypto.timingSafeEqual`. 401 bei Fehlschlag.
- [x] E-Mail-Body (TextBody/HtmlBody) wird NICHT gespeichert – weder im Payload-Interface (`postmark.ts`, Zeilen 15–22) noch im Handler referenziert.
- [x] Supabase RLS auf `belege` bleibt aktiv. Service-Role umgeht RLS nur mit explizitem `mandant_id`-Feld.
- [x] Service Role Key wird nur server-seitig via `createAdminClient()` verwendet.

### Edge Cases Status

#### EC-1: Absender-Domain stimmt nicht ueberein
- [x] Bounce-Mail wird gesendet, kein Import.

#### EC-2: E-Mail ohne Anhang
- [x] Bounce-Mail „Ihre E-Mail enthielt keine verarbeitbaren Anhaenge" (Zeilen 135–140).

#### EC-3: Passwortgeschuetztes PDF
- [x] OCR wirft, Fehler wird im try/catch geschluckt, Beleg wird trotzdem ohne Metadaten angelegt.

#### EC-4: Doppelter Beleg (gleicher Hash)
- [x] SHA-256-Hash-Check (Zeilen 380–390), bei Treffer `status='duplicate'` und Erwaehnung in Info-Bounce-Mail.

#### EC-5: Postmark-Webhook-Retry
- [x] Idempotenz via `verarbeitete_email_nachrichten.message_id` UNIQUE (Migration Zeile 30) + Pre-Check (Zeilen 81–92).

#### EC-6: Mandant hat Monatsabschluss gesperrt
- [~] Import erfolgt trotzdem (kein Lock-Check im Webhook) – entspricht Spec.

#### EC-7: Anhang > 10 MB
- [x] Via `ContentLength`-Vor-Check (Zeile 331) ODER `buffer.length`-Nach-Check (Zeile 375) als `skipped`/`failed` klassifiziert.

#### EC-8: Mehr als 10 Anhaenge
- [x] Erste 10 akzeptiert, Rest als `over_limit` geskippt, Bounce erwaehnt Limit.

### Security Audit Results

#### Authentifizierung & Autorisierung
- [x] `POSTMARK_INBOUND_TOKEN` fehlt → 500 „Service not configured" (kein silent bypass).
- [x] Ungueltiger/kein Auth-Header → 401, **bevor** JSON geparst wird.
- [x] Timing-Safe Compare via `crypto.timingSafeEqual` → kein Timing-Oracle.
- [x] HMAC-SHA256-Variante korrekt implementiert (`postmark.ts` Zeile 68).
- [x] Supabase Service Role Key wird nicht ans Frontend exponiert.
- [x] RLS-Policy auf `verarbeitete_email_nachrichten` schuetzt vor Cross-Mandant-Leaks (Migration Zeilen 46–49). Keine INSERT/UPDATE/DELETE-Policies → nur Service-Role darf schreiben.

#### Input Injection (XSS / SQL / Path Traversal)
- [x] SQL-Injection: Alle DB-Zugriffe via Supabase parametrisiert.
- [x] Path Traversal Storage: Dateipfad wird aus `mandantId` (UUID) + `crypto.randomUUID()` + Extension gebaut → kein User-Input im Path. Umbenennung verwendet `sanitizeFilename()`, das nur `[a-zA-Z0-9._-]` erlaubt.
- [x] Typ-Whitelist ist jetzt konjunktiv (`extOk && mimeOk`, Zeile 326) – BUG-30-001 gefixt.
- [x] `buffer.length` wird nach base64-Decode gegen `MAX_ATTACHMENT_BYTES` validiert (Zeile 375) – BUG-30-002 gefixt.
- [x] XSS im Bounce-Mail-Body: Sender-E-Mail kommt lowercased in den Plain-Text-Mail – kein XSS-Vektor.

#### DoS / Abuse
- [~] **BUG-30-005 (Low, offen):** Kein Rate-Limiting am Endpunkt. Fuer Testphase akzeptabel, vor Go-Live mit zahlenden Mandanten adressieren.
- [x] `maxDuration = 300` verhindert haengende Requests.
- [x] Einzelner Anhang > 5 MB ueberspringt OCR (Zeile 429) → schuetzt vor Anthropic-Timeouts.

#### DSGVO
- [x] E-Mail-Bodies werden nicht persistiert.
- [x] Absender-E-Mail wird in `verarbeitete_email_nachrichten.from_email` gespeichert – Audit-zwecklich legitim.
- [x] Supabase EU-Region bleibt garantiert.

### Regression Testing (stichprobenartig)

- [x] **PROJ-3 Belegverwaltung:** `POST /api/belege` fuegt Zod-Feld `quelle: 'manual' | 'email'` (optional), Default auf DB-Level `'manual'`. Kein Breaking Change. Beleg-Upload via UI weiterhin moeglich.
- [x] **PROJ-5 Matching:** `quelle`-Feld hat keinen Einfluss auf Matching-Logik; Email-Webhook ruft `executeMatching(supabase, mandantId)` mit derselben Signatur wie `/api/belege` auf.
- [x] **PROJ-15 OCR:** `performOcr()`-Signatur unveraendert; Aufruf mit `(buffer, mimeType)` korrekt.
- [x] **PROJ-4 Kontoauszug-Import:** Belegtabelle um `quelle` erweitert; `SELECT *` bleibt kompatibel.
- [x] **Belegtabelle-Rendering:** `beleg-tabelle.tsx` rendert `Mail`-Icon via `flex items-center gap-1.5` (Zeile 195); bestehende Belegzeilen ohne `quelle='email'` zeigen keinen Icon → kein visuelles Regressionrisiko fuer manuelle Uploads.
- [x] **Migration:** `ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` → idempotent.

### Cross-Browser / Responsive (Frontend Mail-Icon)

- [x] Icon-Groesse `h-3.5 w-3.5` skaliert automatisch; `shrink-0` verhindert Ueberlauf bei langen Rechnungsnamen auf 375px.
- [x] `aria-label="Via E-Mail importiert"` fuer Screenreader vorhanden.
- [x] `text-muted-foreground` verwendet Tailwind-Variable → konsistent in Dark-Mode (verifiziert via Klassengebrauch).
- [~] Live-Rendering in Chrome/Firefox/Safari nicht im Rahmen dieser QA getestet (kein laufender Dev-Server). `lucide-react Mail` ist etabliert in anderen Teilen der App und rendert cross-browser stabil.

### Bugs Found (Round 2)

Alle Medium-Bugs aus Round 1 sind gefixt. Verbleibende Low-Bugs:

#### BUG-30-005: Kein Rate-Limiting am Webhook-Endpunkt (offen)
- **Severity:** Low
- **Location:** `src/app/api/email-inbound/route.ts`
- **Details:** Gueltiges Token + massenhafte parallele Requests koennten Anthropic-Quota verbrennen. Tech Design markiert dies explizit als „bewusst nicht implementiert" fuer Testphase.
- **Priority:** Fix vor Go-Live mit zahlenden Mandanten.

#### BUG-30-007: Fehlende `file_size`-Population nach E-Mail-Import (offen)
- **Severity:** Low
- **Location:** `src/app/api/email-inbound/route.ts`, `insertPayload` Zeilen 458–466
- **Details:** Das Insert-Objekt setzt kein `file_size`-Feld. Manueller Upload (`POST /api/belege`) schliesst es auch aus (siehe Zeile 120 `const { file_size: _, ...belegData } = parsed.data`), daher ist die Inkonsistenz symmetrisch – aber beide Pfade lassen `file_size` unbefuellt. Falls `belege.file_size` spaeter als NOT NULL deklariert wird oder Reports darauf basieren, muss `buffer.length` gesetzt werden.
- **Impact:** Aktuell keiner (Spalte ist nullable), zukuenftig relevant fuer Reports/Filter.
- **Priority:** Fix in next sprint.

#### BUG-30-008: Bounce-Mail-Noise bei Signatur-Anhaengen (offen)
- **Severity:** Low (UX)
- **Location:** `src/app/api/email-inbound/route.ts`, Zeilen 198–214
- **Details:** Wenn eine E-Mail sowohl gueltige Belege als auch Signatur-Anhaenge (z.B. `signature.exe`, vCards) enthaelt, erhalten Benutzer eine Info-Bounce-Mail mit „X Beleg(e) wurden importiert. Einige Anhaenge wurden nicht verarbeitet". Fuer viele Outlook/Apple-Mail-Clients typisch.
- **Expected:** Whitelist fuer offensichtliche Signatur-Mimetypen (`text/vcard`, kleine inline-`image/png` < 50 KB) ohne Bounce.
- **Priority:** Fix in next sprint.

#### BUG-30-009: `rechnungsname`-Konvention weicht von Spec-Text ab (offen)
- **Severity:** Low
- **Location:** `src/app/api/email-inbound/route.ts`, `buildRechnungsname` Zeilen 498–513
- **Details:** Spec-Text: `JJJJ-MM-TT_Lieferant_Betrag.pdf`. Implementierung liefert `YYYY-MM-DD_Lieferant_XX.XX` ohne Extension im DB-Feld. Praktisch konsistent mit PROJ-15 Review-Modus; Spec-Text sollte aktualisiert werden („Extension wird am Storage-Objekt, nicht am DB-Feld, gepflegt").
- **Impact:** Kein funktionaler Impact.
- **Priority:** Fix in next sprint (Spec-Text updaten).

### Summary (Round 2)

- **Acceptance Criteria:** 23 vollstaendig erfuellt, 2 partiell (AC-1 Postmark-Konfiguration extern nicht testbar, AC-4 Spec-Wording-Abweichung bei Rechnungsname → BUG-30-009). **Alle kernfunktionalen AC sind erfuellt, inkl. Mail-Icon.**
- **Bugs Found:** 4 Low offen (alle aus Round 1 uebernommen, nicht neu); 4 Medium aus Round 1 **gefixt**; 1 Low (BUG-30-006 TIFF-Edge) nicht mehr reproduzierbar durch BUG-30-001-Fix.
  - Critical: 0
  - High: 0
  - Medium: 0 (alle gefixt)
  - Low: 4 (BUG-30-005 Rate-Limit, BUG-30-007 file_size, BUG-30-008 Bounce-Noise, BUG-30-009 Naming-Spec-Diff)
- **Security:** Solide. Alle in Round 1 identifizierten Defense-in-Depth-Gaps (MIME-OR, Buffer-Size) geschlossen. Einziges verbleibendes operatives Risiko: fehlendes Rate-Limiting – bewusst fuer Testphase akzeptiert.
- **Regression:** Keine Auswirkungen auf bestehende Features festgestellt. Migration idempotent.
- **Production Ready:** **YES** – Keine Critical/High/Medium-Bugs. Die 4 verbleibenden Low-Bugs koennen im Folge-Sprint adressiert werden. Postmark-DNS-/MX-/Token-Einrichtung muss im Deploy-Schritt verifiziert werden (liegt ausserhalb des Code-Scopes).
- **Recommendation:** **Deploy-ready**. BUG-30-005 (Rate-Limit) vor Go-Live mit zahlenden Mandanten adressieren; BUG-30-007/008/009 als Folge-Tickets planen.

## Deployment

**Deployed:** 2026-04-20
**Commit:** ca3db9b
**Build:** ✅ `npm run build` erfolgreich
**Migration:** ✅ `email_belegeingang` auf Supabase Cloud angewendet

### Offene manuelle Schritte (Postmark-Setup)
Diese Schritte müssen einmalig außerhalb des Codes durchgeführt werden:

1. **Postmark Account** → Server erstellen → Inbound-Domain `inbound.belegmanager.at` registrieren
2. **DNS** beim Provider: MX-Record `belegmanager.at → inbound.postmarkapp.com` (Priorität 10)
3. **Webhook-URL** in Postmark Dashboard: `https://app.belegmanager.at/api/email-inbound`
4. **Vercel Env Vars** setzen:
   - `POSTMARK_INBOUND_TOKEN` → aus Postmark Dashboard (Inbound Settings)
   - `POSTMARK_SERVER_TOKEN` → aus Postmark Dashboard (API Tokens)
   - `POSTMARK_BOUNCE_SENDER` → `noreply@belegmanager.at` (muss als Sender in Postmark verifiziert sein)
5. **DKIM/SPF** für `belegmanager.at` in Postmark verifizieren (für Bounce-Mail-Zustellbarkeit)

### Deferred Bugs (vor zahlenden Mandanten-Go-Live)
- BUG-30-005: Rate-Limiting auf `/api/email-inbound` (Spam-Schutz)
