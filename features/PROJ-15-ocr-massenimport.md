# PROJ-15: OCR-Erkennung & Massenimport von Belegen

## Status: Planned
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

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
