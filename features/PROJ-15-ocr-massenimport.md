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
_To be added by /qa_

## Deployment
_To be added by /deploy_
