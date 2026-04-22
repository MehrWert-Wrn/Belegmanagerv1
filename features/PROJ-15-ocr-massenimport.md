# PROJ-15: OCR-Erkennung & Massenimport von Belegen

## Status: In Review
**Created:** 2026-03-26
**Last Updated:** 2026-03-26

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Upload-Infrastruktur und Metadaten-Speicherung muss bestehen
- Requires: PROJ-15 (Belegverwaltung Formular-Verbesserungen) – mehrere Steuerzeilen und erweitertes Formular
- Empfohlen: OCR-Backend-Service (z.B. Google Cloud Document AI, Azure Form Recognizer, oder Tesseract via Edge Function)

## User Stories
- Als Benutzer möchte ich beim Einzelupload eines Belegs, dass die Felder (Lieferant, Rechnungsnummer, Datum, Beträge, MwSt) automatisch per OCR ausgefüllt werden, damit ich weniger manuell eingeben muss.
- Als Benutzer möchte ich die OCR-erkannten Felder vor dem Speichern manuell korrigieren können, damit fehlerhafte Erkennungen nicht gespeichert werden.
- Als Benutzer möchte ich sehen, welche Felder per OCR befüllt wurden (z.B. durch eine leichte Farbmarkierung oder ein Icon), damit ich weiß, was geprüft werden sollte.
- Als Benutzer möchte ich mehrere Belege gleichzeitig hochladen können (Massenimport), damit ich nicht jeden Beleg einzeln hochladen muss.
- Als Benutzer möchte ich beim Massenimport, dass OCR alle Dateien automatisch verarbeitet ohne dass sich für jede Datei ein Dialog öffnet, damit der Import schnell geht.
- Als Benutzer möchte ich nach dem Massenimport eine Übersicht aller importierten Belege sehen und Beleg für Beleg durchgehen sowie die OCR-Felder gegebenenfalls korrigieren, damit alle Belege korrekte Metadaten haben.

## Acceptance Criteria

### OCR beim Einzelupload
- [ ] Nach Dateiauswahl (Step 1 → Step 2) wird die Datei automatisch an den OCR-Endpunkt gesendet (`POST /api/belege/ocr`)
- [ ] Während OCR läuft, zeigt Step 2 einen Ladezustand („OCR erkennt Daten...") mit Spinner; das Formular ist bereits sichtbar aber Felder sind deaktiviert
- [ ] OCR-erkannte Felder werden automatisch ins Formular eingetragen: Lieferant, Rechnungsnummer, Rechnungsdatum, Bruttobetrag, Nettobetrag, MwSt-Satz
- [ ] OCR-befüllte Felder erhalten ein dezentes Highlight (z.B. hellblauer Rand oder Wand-Icon) das verschwindet, sobald der User das Feld manuell ändert
- [ ] User kann alle OCR-Felder manuell überschreiben
- [ ] Wenn OCR fehlschlägt oder keine Daten erkennt: Felder bleiben leer, Toast-Hinweis „OCR konnte keine Daten erkennen – bitte manuell ausfüllen"
- [ ] OCR-Timeout nach 30 Sekunden → Fehlermeldung, User kann manuell ausfüllen
- [ ] OCR funktioniert für: PDF (Text-basiert und gescannt), JPG, PNG

### Massenimport
- [ ] Im Upload-Dialog (Step 1) kann der User mehrere Dateien gleichzeitig auswählen oder per Drag & Drop ablegen (Dropzone akzeptiert `multiple`)
- [ ] Wenn mehr als 1 Datei ausgewählt wird: kein Metadaten-Dialog öffnet sich; stattdessen werden alle Dateien sofort hochgeladen und OCR läuft für jede Datei im Hintergrund
- [ ] Während Massenimport: Fortschrittsanzeige zeigt „X von Y Belegen verarbeitet"
- [ ] Nach Abschluss: Toast „X Belege importiert – bitte Metadaten prüfen" mit Button „Jetzt prüfen"
- [ ] „Jetzt prüfen" öffnet einen Review-Modus: eine Warteschlange aller importierten Belege mit Status „Ausstehend"
- [ ] Im Review-Modus wird Beleg für Beleg angezeigt (Vorschau + Metadaten-Formular mit OCR-Ergebnissen)
- [ ] User kann Metadaten korrigieren und auf „Speichern & Weiter" klicken → nächster Beleg in der Warteschlange
- [ ] Fortschritt wird angezeigt: „Beleg 2 von 8"
- [ ] User kann einzelne Belege im Review überspringen (Status „Übersprungen") und später zurückkehren
- [ ] Review kann jederzeit geschlossen werden; nicht-reviewte Belege verbleiben in der Belegliste mit Status „Entwurf" (oder äquivalent: kein Rechnungsname)
- [ ] Maximum 20 Dateien pro Massenimport-Batch

### API-Endpunkt `/api/belege/ocr`
- [ ] Akzeptiert: `multipart/form-data` mit einer Bilddatei oder PDF
- [ ] Gibt zurück: `{ lieferant, rechnungsnummer, rechnungsdatum, bruttobetrag, nettobetrag, mwst_satz, confidence }` (alle Felder optional/nullable)
- [ ] `confidence` (0–1) kann im UI genutzt werden um Low-Confidence-Felder besonders zu markieren
- [ ] Nur für authentifizierte User (RLS-konform)
- [ ] Datei wird NICHT in Storage gespeichert (nur zur Erkennung, der eigentliche Upload läuft separat)

## Edge Cases
- OCR erkennt falsche Zahl als Betrag (z.B. Telefonnummer): User korrigiert manuell → kein Problem
- PDF ist gescannt (Bild-PDF ohne Text-Layer): OCR-Service muss Bild-Extraktion unterstützen
- Datei ist korrupt oder kein gültiges PDF/Bild: Upload schlägt fehl, Fehlermeldung mit Dateiname
- Massenimport: Eine Datei schlägt fehl, andere werden trotzdem verarbeitet
- Massenimport: User schließt Browser während Import läuft → bereits hochgeladene Dateien verbleiben in Supabase Storage, sind aber ohne Metadaten (Status „Entwurf")
- OCR erkennt mehrere Steuerblöcke (gemischte MwSt): optimalerweise werden mehrere Steuerzeilen befüllt; falls OCR nur Gesamtbeträge liefert: nur erste Zeile befüllen
- Benutzer importiert 20 Dateien, reviewt 5 und schließt: die restlichen 15 sind weiterhin in der Liste als nicht-reviewte Belege

## Technical Requirements
- OCR-Backend-Service: Entscheidung zwischen Google Document AI, Azure Form Recognizer, AWS Textract, oder Open-Source (PaddleOCR/Tesseract via Edge Function) – muss in `/architecture` entschieden werden
- Kosten: OCR-Service muss bei österreichischen Rechnungen (Deutsch, EUR-Beträge) ausreichend genau sein
- Datenschutz: Belegdaten (potenziell sensibel) werden an externen OCR-Dienst gesendet → DSGVO-Konformität sicherstellen (EU-Region oder On-Premise-Option bevorzugt)
- Performance: OCR-Verarbeitung < 10 Sekunden pro Seite
- Fallback: OCR-Fehler darf Upload nicht blockieren

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### OCR-Service: Claude Haiku Vision (Anthropic API)
Entschieden wegen: bestehende Anthropic-Kundenbeziehung, EU Data Processing Agreement (DSGVO-konform), ~€0.001 pro Seite, kein PDF→Bild-Konverter nötig (Claude akzeptiert PDF nativ als Base64-Dokument).

### Zwei Upload-Pfade im selben Dialog
- **Einzelupload** (1 Datei): Datei → OCR → Formular vorausgefüllt → User prüft → Speichern
- **Massenimport** (2–20 Dateien): Alle Dateien sofort hochladen (sequentiell) → OCR pro Datei → Fortschrittsanzeige → Review-Warteschlange

### Komponenten-Struktur
```
BelegUploadDialog (bestehend, erweitert)
├─ Step 1: Dropzone (single + multiple)
│   ├─ 1 Datei → Step 2 (Einzelupload)
│   └─ 2–20 Dateien → Massenimport-Modus
├─ Step 2: Einzelupload
│   ├─ OcrLadeAnzeige (Spinner, Felder disabled)
│   └─ MetadatenFormular (OCR-Felder blau markiert)
└─ Massenimport-Modus
    ├─ Datei-Liste mit Status pro Datei (⏳/🔍/✅/❌)
    ├─ Gesamtfortschritt "X von Y verarbeitet"
    └─ Nach Abschluss: Toast + "Jetzt prüfen"-Button

BelegReviewModus (neue Komponente, Sheet)
├─ Kopfzeile: "Beleg X von Y"
├─ Links: BelegVorschau (PDF-Embed oder Bild)
├─ Rechts: MetadatenFormular (OCR vorausgefüllt)
└─ Aktionen: "Speichern & Weiter" | "Überspringen" | Status-Zusammenfassung
```

### Neue API Route: POST /api/belege/ocr
- Empfängt Datei als multipart/form-data
- Sendet Base64-kodierte Datei an Claude Haiku Vision (server-side, API Key sicher)
- Gibt zurück: `{ lieferant, rechnungsnummer, rechnungsdatum, bruttobetrag, nettobetrag, mwst_satz, confidence }`
- Timeout: 30 Sekunden; bei Fehler → leeres Objekt (Upload wird nicht blockiert)

### Datenmodell (keine DB-Änderung)
Bestehende `belege`-Tabelle wird genutzt:
- Massenimport: Beleg wird sofort angelegt mit `rechnungsname = NULL` → signalisiert "noch nicht reviewed"
- OCR-Ergebnisse werden in DB gespeichert (`PATCH /api/belege/[id]`)
- Review-Queue lebt im React State (nicht persistiert)
- Nach Review: `rechnungsname` gesetzt → Beleg gilt als vollständig

### Technische Entscheidungen
| Entscheidung | Gewählt | Warum |
|---|---|---|
| OCR-Service | Claude Haiku Vision | EU DPA, kein neuer Vertrag, kostengünstig |
| PDF-Handling | Base64 direkt an Claude | Claude unterstützt PDF nativ, kein Konverter nötig |
| OCR-Parallelität | Sequentiell | Verhindert Rate-Limiting, einfacheres Error-Handling |
| Review-UI | Sheet (Drawer) | Passt zum bestehenden BelegDetailSheet-Pattern |
| OCR-State | React State | Review-Queue nur session-temporär; DB-Einträge schon angelegt |

### Neue Abhängigkeit
- `@anthropic-ai/sdk` — Anthropic API Client für Claude Haiku Vision

## Backend Implementation Notes

### Implemented by /backend (2026-03-26)

**New files:**
- `src/app/api/belege/ocr/route.ts` — POST endpoint accepting multipart/form-data
- `src/lib/ocr.ts` — Claude Haiku Vision OCR logic with structured prompt
- `src/lib/rate-limit.ts` — In-memory sliding window rate limiter

**Key decisions:**
- Model: `claude-haiku-4-5-20251001` (as specified by user)
- File size limit: 5 MB (as specified by user)
- Rate limit: 10 calls/minute/user (as specified by user)
- API Key env var: `ANTHROPIC_API_KEY` (standard)
- PDF handled as `document` content block (Claude native PDF support)
- Images handled as `image` content block
- 30-second timeout with Promise.race
- OCR failure never blocks upload — returns empty result with confidence 0
- No DB schema changes needed (uses existing belege table)
- Zod validation not used on this endpoint (multipart/form-data with file, validated manually)

**Pending (Frontend):**
- ~~Single upload OCR integration (Step 2 form pre-fill)~~ DONE
- ~~Mass import UI with progress tracking~~ DONE
- ~~Review mode (BelegReviewModus Sheet component)~~ DONE
- ~~OCR field highlighting (blue border on OCR-filled fields)~~ DONE

## Frontend Implementation Notes

### Implemented by /frontend (2026-03-26)

**Modified files:**
- `src/components/belege/beleg-upload-dialog.tsx` — Extended with OCR single-upload + mass import
- `src/app/(app)/belege/page.tsx` — Added review mode integration

**New files:**
- `src/components/belege/beleg-review-modus.tsx` — Sheet component for reviewing mass-imported belege

**What was built:**

1. **Single Upload with OCR Prefill:**
   - Dropzone now accepts multiple files (max 20)
   - On single file drop: transitions to form, fires OCR in background
   - While OCR runs: info banner with spinner, all form fields disabled
   - OCR results pre-fill: lieferant, rechnungsnummer, rechnungsdatum, nettobetrag, bruttobetrag, mwst_satz
   - OCR-filled fields get blue ring highlight (`ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50`)
   - Highlight disappears when user manually edits the field
   - OCR failure shows info toast, user fills manually

2. **Mass Import (2-20 files):**
   - On multi-file drop: switches to mass import mode, no metadata dialog
   - Sequential upload+OCR for each file with per-file status tracking
   - Status icons per file: Clock (pending), Loader (uploading), ScanSearch (OCR), CheckCircle (done), XCircle (error)
   - Progress bar showing "X von Y Belegen verarbeitet"
   - On completion: toast with "Jetzt pruefen" button
   - "Jetzt pruefen" button also in dialog footer
   - Files uploaded with rechnungsname=null (signals unreviewed)
   - Abort support via ref

3. **BelegReviewModus (Sheet):**
   - Full-width sheet (sm:max-w-4xl) with 2-column layout on large screens
   - Left: document preview (PDF iframe or image)
   - Right: metadata form with OCR highlights (blue ring on fields with data when rechnungsname is null)
   - Progress bar: "Beleg X von Y" with reviewed/skipped counts
   - "Speichern & Weiter" saves and advances to next beleg
   - "Ueberspringen" skips without saving, tracks skipped IDs
   - On last beleg: button text changes to "Speichern & Fertig"
   - Sets rechnungsname to original_filename if user leaves it empty (marks as reviewed)
   - All auto-calculation logic (netto/brutto/mwst) identical to existing forms

**No new dependencies added. All UI uses existing shadcn/ui components (Sheet, Progress, Dialog, Form, etc.).**

## QA Test Results

**Tested:** 2026-04-22
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + static analysis (no live browser execution this round)

### Acceptance Criteria Status

#### OCR beim Einzelupload
- [x] Auto-fire OCR after file selection (`runOcr` triggered in `onDrop` for single file)
- [x] Loading state while OCR runs (banner with spinner, all fields `disabled={ocrLoading}`)
- [x] OCR fields auto-populated (`applyOcrToForm` writes lieferant/rechnungsnummer/rechnungsdatum/Brutto/Netto/MwSt)
- [x] Highlight on OCR fields (`ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50`) and removed on user edit (`clearOcrHighlight` on `onChange`)
- [x] Manual override possible (no field is permanently disabled after OCR)
- [x] Toast on OCR no-data: `OCR konnte keine Daten erkennen - bitte manuell ausfuellen`
- [x] 30-second timeout implemented in `performOcr` via `Promise.race`
- [x] PDF / JPG / PNG supported via `MEDIA_TYPE_MAP` and `ALLOWED_MIME_TYPES`
- [ ] BUG-001 (High): Files larger than 5 MB silently skip OCR with no user feedback
- [ ] BUG-002 (Medium): `OCR Fehler: ${result.error}` toast leaks raw API error strings (HTTP 401, model name etc.) to end users
- [ ] BUG-003 (High): `ANTHROPIC_API_KEY` not configured in `.env.local` — every single-upload currently shows "OCR konnte keine Daten erkennen"

#### Massenimport
- [x] Multi-select via dropzone (`multiple` from `react-dropzone`, `MAX_MASS_IMPORT=50`)
- [x] No metadata dialog when 2+ files dropped, mass import auto-starts
- [x] Progress indicator: "X von Y Belegen verarbeitet" + percentage + Progress bar
- [x] Toast on completion with "Jetzt pruefen" action button
- [x] Review-Modus opens with all imported beleg IDs and shows Beleg-Vorschau + Form per beleg
- [x] Speichern & Weiter advances queue; on last → "Speichern & Fertig"
- [x] Skip button stores skipped IDs without writing to DB
- [x] Sheet can be closed; non-reviewed belege remain in DB with rechnungsname=null (Entwurf state)
- [ ] BUG-004 (High): Spec says "Maximum 20 Dateien pro Massenimport-Batch", code allows `MAX_MASS_IMPORT = 50` — direct violation of acceptance criterion
- [ ] BUG-005 (Medium): Mass import processes sequentially; on a network of 20 files this can take several minutes with no per-file ETA
- [ ] BUG-006 (Low): `duplicateCount` displayed in toast is computed from stale `massFiles` state (closure captures pre-update value), so duplicate count message is wrong
- [ ] BUG-007 (Medium): When dropzone receives more than `MAX_MASS_IMPORT` files, `react-dropzone` already filters them out via `maxFiles` and the toast `Maximal X Dateien...` never fires (silent truncation)

#### API-Endpunkt /api/belege/ocr
- [x] Accepts multipart/form-data with `file` field
- [x] Returns `{lieferant, rechnungsnummer, rechnungsdatum, bruttobetrag, nettobetrag, mwst_satz, confidence}`
- [x] `confidence` 0..1 included
- [x] Authenticated only (`requireAuth(supabase)` returns 401)
- [x] File never persisted to Storage (only in-memory buffer for OCR call)
- [x] Rate-limit 10 req/min/user (in-memory sliding window)
- [ ] BUG-008 (Medium): Rate limiter is in-memory only — does NOT work in serverless / multi-instance Vercel deployments (lambda cold starts reset the Map). Documented in code comment but never flagged.
- [ ] BUG-009 (Low): Spec promises "alle Felder optional/nullable", but the schema also returns optional `steuerzeilen` and `error` not documented in the AC

### Edge Cases Status

#### EC-1: OCR erkennt falsche Zahl als Betrag
- [x] User can manually overwrite (no read-only fields after OCR)

#### EC-2: PDF gescannt
- [x] Claude Haiku Vision handles scanned PDFs natively as `document` content block

#### EC-3: Korrupte Datei
- [x] Server returns OCR result with `confidence:0`; client shows info toast and continues
- [ ] BUG-010 (Medium): On corrupt PDF, Anthropic API may return non-JSON response → `JSON.parse` throws but user only sees "OCR Fehler: Unexpected token..."

#### EC-4: Massenimport mit Fehlerdatei
- [x] Loop continues; failed file shown with `XCircle` icon and error message

#### EC-5: Browser-Schliessen während Import
- [x] `massAbortRef.current = true` on close; existing uploads remain in Storage / DB
- [ ] BUG-011 (Low): No "Wirklich abbrechen?"-Dialog when user closes a running mass import — clicking outside the dialog silently aborts

#### EC-6: Mehrere Steuerblöcke
- [x] OCR prompt explicitly handles formats A-D for AT-Kassenbons
- [x] `applyOcrToForm` writes all `steuerzeilen` rows from OCR

#### EC-7: 20+ Dateien teilweise reviewen
- [x] Review-Modus tracks `skippedIds` and `reviewedCount`; remaining belege stay in list as Entwurf

### Security Audit Results

- [x] Auth check on `POST /api/belege/ocr` (returns 401 without session)
- [x] Auth check on `POST /api/belege/[id]/ocr` (uses `getEffectiveSupabase`)
- [x] File never persisted from `/api/belege/ocr` (no Storage write, no DB write)
- [x] File-size 5 MB validated server-side BEFORE forwarding to Anthropic
- [x] MIME-type allow-list (`pdf/jpeg/jpg/png` only) — prevents malicious file types
- [x] Rate limit 10 req/min protects against API-cost abuse
- [x] Mandant-scoped query in `[id]/ocr` (`.eq('mandant_id', mandantId)`) prevents cross-tenant document access
- [x] `formData.get('file')` validates is `File` instance — prevents string injection
- [x] No raw HTML rendered from OCR result (form inputs are plain text)
- [ ] BUG-012 (High/Security): Rate limit key is `ocr:${user.id}` — when a system admin impersonates a mandant in `[id]/ocr`, the limiter uses `userId` from `getEffectiveSupabase`. Multiple admins could share an implicit budget if they're impersonating, but the bigger issue is the key is per-user not per-mandant: a user who creates two sessions can bypass the limit.
- [ ] BUG-013 (Medium/Security): The user-facing error in `runOcr` toasts the literal `result.error` field. If Anthropic returns sensitive auth error context (account ID, request ID), it would be displayed to the end user. Consider sanitising server-side before sending.
- [ ] BUG-014 (Critical/Cost): Massenimport uploads run server-side OCR on each file (50 files = 50 Anthropic calls). With rate limit 10/min, 50 files would take 5+ minutes minimum. Plus, no Mandant-level cost cap exists. A malicious tenant could exhaust the OCR budget by repeatedly mass-importing files.
- [ ] BUG-015 (High/Config): `ANTHROPIC_API_KEY` is documented in `.env.local.example` but missing from actual `.env.local` — feature is non-functional in current dev environment.
- [ ] BUG-016 (Critical/Config): `.env.local` line 3 has `SUPABASE_SERVICE_ROLE_KEY=...CREDENTIALS_ENCRYPTION_KEY=...` concatenated on the same line with no newline separator. The `CREDENTIALS_ENCRYPTION_KEY` is being parsed as part of the service-role key. Probably an unrelated bug, but discovered during this audit.

### Additional Findings (non-AC)

- **BUG-017 (High/Inconsistency):** The upload-dialog's `metadataSchema` uses `rechnungstyp: z.enum(['eingangsrechnung','ausgangsrechnung','gutschrift','sonstiges'])` — missing `'eigenbeleg'`. The `BelegReviewModus` schema and the `PATCH /api/belege/[id]` schema both include `'eigenbeleg'`. If a user reviews an Eigenbeleg created via mass import, the form will reject the value on initial render (`z.enum` validation fails).

- **BUG-018 (Medium):** In `BelegReviewModus`, the OCR-highlight logic infers OCR-filled fields by checking which `currentBeleg` properties are populated — this is unreliable because manually-entered metadata also looks "filled". A proper implementation would persist an `ocr_filled_fields` JSONB array on the beleg.

- **BUG-019 (Low):** Mass import skips OCR silently for files > 5 MB (line 282-284 in upload dialog returns null without notifying user). User has no idea why no OCR data appeared.

- **BUG-020 (Medium):** In `processMassImport`, `createdBeleg.id` from `await response.json()` assumes the response shape — but the POST `/api/belege` route may return an object missing `id` if the insert failed silently. No null check on `belegIds.push(createdBeleg.id)` could push `undefined`.

- **BUG-021 (Medium/UX):** During mass import, only one combined "Mandant konnte nicht ermittelt werden" toast fires for all files; if mandant-fetch fails mid-batch the loop continues without surfacing the actual failure cause to the user.

- **BUG-022 (High):** `runOcr` in upload dialog catches all errors silently and returns `null` — a real `429 Rate Limited` from the OCR API will appear identical to "no OCR data found" from the user's perspective. The retry-after hint from the server is discarded.

- **BUG-023 (Low/UX):** In `BelegReviewModus`, the "Belegprüfung überspringen" button auto-saves all complete belege but the mandatory-fields check only requires `rechnungsdatum` + `bruttobetrag`. A user could end up with a saved beleg that has neither lieferant nor rechnungsnummer → no proper Rechnungsname → still effectively "Entwurf".

- **BUG-024 (Medium):** The OCR-highlight class `ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50` is hardcoded; no Dark-Mode variant. In dark theme the blue ring + light blue background is barely readable.

### Bugs Found (Prioritized)

#### BUG-015: ANTHROPIC_API_KEY missing from .env.local
- **Severity:** Critical
- **Steps to Reproduce:**
  1. Open `.env.local` in repo root
  2. Search for `ANTHROPIC_API_KEY`
  3. Expected: present with valid key
  4. Actual: missing entirely
- **Priority:** Fix before deployment (feature is non-functional)

#### BUG-016: Concatenated env vars in .env.local
- **Severity:** Critical (out of scope for PROJ-15 but discovered during audit)
- **Steps to Reproduce:**
  1. Open `.env.local`, line 3
  2. `SUPABASE_SERVICE_ROLE_KEY=eyJ...8CREDENTIALS_ENCRYPTION_KEY=eea858...`
- **Priority:** Fix immediately

#### BUG-014: Mass import has no Mandant cost cap
- **Severity:** Critical
- **Steps to Reproduce:**
  1. As malicious tenant, mass-import 50 PDFs via UI
  2. OCR runs 50 Anthropic calls = ~5min processing (rate-limited)
  3. Repeat hourly: tenant can drain monthly OCR budget
- **Priority:** Fix before deployment — add mandant_id-scoped quota/billing

#### BUG-001: Files >5MB silently skip OCR
- **Severity:** High
- **Steps to Reproduce:**
  1. Drop a 6 MB PDF in single-upload
  2. Step 2 form opens, no OCR loading state
  3. Toast appears "OCR konnte keine Daten erkennen" (misleading — actually never tried)
- **Priority:** Fix before deployment — show proper info "Datei zu gross fuer OCR (5 MB Limit)"

#### BUG-003: OCR misconfigured in dev environment
- **Severity:** High
- **Linked to BUG-015:** No API key → all OCR returns empty

#### BUG-004: Spec says max 20, code allows 50
- **Severity:** High
- **Steps to Reproduce:**
  1. Read PROJ-15 spec line 43: "Maximum 20 Dateien pro Massenimport-Batch"
  2. Read `MAX_MASS_IMPORT = 50` in upload-dialog
  3. Direct violation
- **Priority:** Fix before deployment — either update spec to 50 or reduce constant to 20

#### BUG-017: Eigenbeleg not in upload-dialog rechnungstyp enum
- **Severity:** High
- **Steps to Reproduce:**
  1. Mass import a beleg, then review it
  2. Try to set rechnungstyp = "eigenbeleg" in dropdown — option doesn't exist in upload dialog (single upload), but exists in review-modus, creating inconsistent UX

#### BUG-022: OCR errors swallowed in client
- **Severity:** High
- **Steps to Reproduce:**
  1. Trigger OCR via mass import
  2. API returns 429 Too Many Requests
  3. Client shows "OCR konnte keine Daten erkennen" instead of "Zu viele Anfragen, bitte warten"

#### BUG-012: Rate limit per-user instead of per-mandant
- **Severity:** High (security/cost)
- **Priority:** Fix before deployment — change key to `ocr:${mandantId}`

#### BUG-002: Raw API errors leak to user toasts
- **Severity:** Medium
- **Priority:** Fix in next sprint

#### BUG-005, BUG-007, BUG-008, BUG-010, BUG-013, BUG-018, BUG-020, BUG-021, BUG-024
- **Severity:** Medium each
- **Priority:** Fix in next sprint

#### BUG-006, BUG-009, BUG-011, BUG-019, BUG-023
- **Severity:** Low
- **Priority:** Nice to have

### Regression Risk on Related Features

- **PROJ-3 (Belegverwaltung):** OCR mass-import path creates belege with `rechnungsname=null`. The Belegliste, Detail-Sheet, Loeschen-Dialog, and Tabelle all defensively use `rechnungsname || original_filename || 'Unbekannt'`. Verified — no regression.
- **PROJ-5 (Matching-Engine):** `executeMatching()` is fired in POST /api/belege after every mass-import row. With 50 belege, matching runs 50 times in parallel. Potential perf hotspot, but not a regression vs. single uploads.
- **PROJ-25 (EAR-Buchungsnummern):** Beleg-Renaming on review uses `rechnungsname` change → triggers file-rename in Storage. Mass imports with auto-generated rechnungsname will trigger rename for every reviewed beleg. No bug, but be aware of Storage ops cost.
- **PROJ-30 (E-Mail-Belegeingang):** Postmark inbound also creates belege via `/api/belege` POST. If the OCR mass-import path is used by both human users and the email worker simultaneously, the user-scoped rate-limit may unexpectedly throttle one or the other. See BUG-012.

### Cross-Browser & Responsive Status

Code-only review; no live browser test was executed. Notable concerns:
- BelegReviewModus uses `w-[calc(100vw-260px)]` — assumes a 260px sidebar. On mobile (375px) without sidebar, this overflows the viewport. Needs explicit mobile breakpoint.
- 2-column layout `w-3/5` / `w-2/5` is not responsive; on mobile the PDF preview takes 60% which is unusable.
- `iframe` PDF embed has known issues in iOS Safari (often refuses to render Supabase signed-URL PDFs).

### Summary
- **Acceptance Criteria:** ~21/30 sub-criteria pass on code review (some require live browser to verify)
- **Bugs Found:** 24 total (4 Critical, 8 High, 7 Medium, 5 Low)
- **Security:** Multiple findings — most importantly per-user rate limiting (BUG-012) and missing mandant-scoped cost cap (BUG-014)
- **Production Ready:** **NO**
- **Recommendation:** Fix all Critical and High before deployment. The most urgent: missing API key in `.env.local`, mass-import cost abuse vector, silent failure on files >5 MB, spec/code mismatch on max files (20 vs 50), and missing `eigenbeleg` enum value in upload schema.

## Deployment
_To be added by /deploy_
