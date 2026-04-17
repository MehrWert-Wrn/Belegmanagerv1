# PROJ-3: Belegverwaltung

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-04-17

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren

## User Stories
- As a user, I want to upload invoice documents (PDF, JPG, PNG) so that they are stored digitally
- As a user, I want to preview an uploaded document without downloading it so that I can verify its contents quickly
- As a user, I want to enter metadata for each document (Rechnungsname, Rechnungsnummer, Rechnungstyp, Lieferant, UID Lieferant, IBAN Lieferant, Betrag, Datum, Fälligkeit, Beschreibung) so that it can be matched with transactions
- As a user, I want to see a list of all uploaded documents with clearly structured columns (Rechnungsname, Rechnungsdatum, Lieferant, Betrag netto, Betrag brutto, Rechnungstyp, Dokument-Link, Status) so that I have a complete overview
- As a user, I want to filter and search documents by any visible column (Rechnungsname, Rechnungsdatum, Lieferant, Betrag, Rechnungstyp, Status) so that I can find specific invoices quickly
- As a user, I want to select multiple documents and delete them at once so that I can clean up efficiently
- As a user, I want to see invoice details (UID Lieferant, IBAN Lieferant, Rechnungsnummer, Beschreibung, Steuersatz, Fälligkeitsdatum) in the detail panel so that I have all information in one place
- As a user, I want to view the PDF in a large preview within the detail panel so that I can read the invoice content without straining
- As a user, I want belege that were imported via n8n to appear automatically in the Belegverwaltung so that I don't need to upload them manually

## Acceptance Criteria

### Übersichtstabelle
- [ ] Tabelle zeigt diese Spalten: Rechnungsname | Rechnungsdatum | Lieferant | Betrag netto | Betrag brutto | Rechnungstyp | Dokument | Status
- [ ] Spalte "Dokument" enthält einen Button/Link der das PDF direkt öffnet (Signed URL, neuer Tab oder Side-Preview)
- [ ] Status-Badge zeigt: offen (amber) / zugeordnet (grün)
- [ ] Rechnungstyp-Badge zeigt: Eingangsrechnung / Ausgangsrechnung / Gutschrift / Sonstiges

### Belegdetails (Side-Sheet)
- [ ] Detail-Panel zeigt alle Übersichtsfelder PLUS: UID Lieferant, IBAN Lieferant, Rechnungsnummer, Beschreibung, Steuersatz (MwSt-Satz), Fälligkeitsdatum
- [ ] Beschreibungsfeld ist auf 100 Zeichen begrenzt (Client- und Server-seitig validiert)
- [ ] PDF-Vorschau im Detail-Panel ist groß dargestellt (min. 600px Höhe, volle Panel-Breite)
- [ ] PDF-Vorschau lädt via Signed URL inline (kein Download-Zwang)

### Upload & Metadaten
- [ ] User kann PDF, JPG, PNG hochladen (max. 10 MB)
- [ ] Upload-Formular enthält alle Felder: Rechnungsname, Rechnungsnummer, Rechnungstyp (Dropdown), Lieferant, UID Lieferant, IBAN Lieferant, Bruttobetrag, Nettobetrag, MwSt-Satz, Rechnungsdatum, Fälligkeitsdatum, Beschreibung (max. 100 Zeichen)
- [ ] Rechnungstyp ist Pflichtfeld mit Optionen: Eingangsrechnung, Ausgangsrechnung, Gutschrift, Sonstiges
- [ ] Metadata wird in der `belege`-Tabelle mit `mandant_id` gespeichert

### Upload-Dialog Verbesserungen (v2)
- [ ] Dialog-Breite auf `max-w-2xl` erhöht – alle 3-spaltigen Gruppen ohne horizontales Scrollen sichtbar
- [ ] Dateiname in der Vorschauzeile: `truncate`, Tooltip mit vollem Namen beim Hover
- [ ] Datei im Upload-Dialog (Step 2) ist klickbar → öffnet in neuem Tab (lokale Datei via `createObjectURL`, gespeicherte via Signed URL)
- [ ] In der Belegtabelle (Spalte „Dokument") öffnet Klick den Beleg ebenfalls in neuem Tab

### Betragszeilen & Auto-Berechnung (v2)
- [ ] Mehrere Steuerzeilen möglich: „+ Zeile hinzufügen"-Button; jede Zeile hat Nettobetrag, MwSt-Satz, Bruttobetrag; max. 5 Zeilen; mindestens 1 Zeile bleibt bestehen
- [ ] Jede Zeile hat einen Entfernen-Button (Mülleimer-Icon)
- [ ] Auto-Berechnung pro Zeile: Netto + MwSt-Satz → Brutto automatisch (`netto × (1 + mwst/100)`, 2 Dezimalstellen); ebenso Brutto + MwSt-Satz → Netto; bei MwSt-Satzänderung: Netto (falls vorhanden) → Brutto neu; MwSt = 0% → Netto = Brutto
- [ ] Summenzeile erscheint ab 2 Steuerzeilen: „Gesamt: Netto [Summe] | Brutto [Summe]", fett, grau hinterlegt, automatisch aktualisiert
- [ ] Beim Speichern: `bruttobetrag` = Summe aller Bruttobeträge, `nettobetrag` = Summe aller Nettobeträge, `mwst_satz` = MwSt-Satz der ersten Zeile (Datenbankschema bleibt unverändert)

### Suche & Filter
- [ ] Suche/Filter für: Rechnungsname (Text, Teilsuche), Rechnungsdatum (Datumsbereich), Lieferant (Text, Teilsuche), Betrag netto (von–bis), Betrag brutto (von–bis), Rechnungstyp (Dropdown), Status (Dropdown)
- [ ] Alle Filter können kombiniert werden
- [ ] "Filter zurücksetzen"-Button setzt alle Felder zurück

### Löschen
- [ ] Einzelne Zeile kann per Aktionsmenü gelöscht werden (Soft Delete, Bestätigungsdialog)
- [ ] Mehrere Zeilen können per Checkbox-Auswahl selektiert und gemeinsam gelöscht werden
- [ ] Bulk-Delete zeigt einen Bestätigungsdialog mit Anzahl der ausgewählten Belege
- [ ] Beim Löschen von zugeordneten Belegen: Warnung + automatische Aufhebung der Zuordnung an der Transaktion

### n8n-Import (automatischer Belegimport via Supabase)
- [ ] Pro Mandant existiert eine Staging-Tabelle in Supabase, benannt nach dem Firmennamen (Sonderzeichen zu Unterstrichen, z.B. `belege_import_mehr_wert_gruppe_gmbh`)
- [ ] Die Staging-Tabelle enthält alle Beleg-Attribute: rechnungsname, rechnungsnummer, rechnungstyp, lieferant, uid_lieferant, lieferant_iban, bruttobetrag, nettobetrag, mwst_satz, rechnungsdatum, faelligkeitsdatum, beschreibung, storage_path (Verweis auf PDF im Supabase Storage)
- [ ] n8n kann via Supabase Node (Create a Row) Zeilen in die Staging-Tabelle einfügen
- [ ] Ein Supabase-Datenbank-Trigger auf der Staging-Tabelle kopiert neue Zeilen automatisch in die zentrale `belege`-Tabelle (inkl. mandant_id-Mapping)
- [ ] n8n lädt die PDF-Datei in den Supabase Storage Bucket `belege` hoch und speichert den `storage_path` in der Staging-Zeile
- [ ] Importierte Belege erscheinen sofort in der Belegverwaltung und können wie manuell hochgeladene Belege angezeigt, gefiltert und gelöscht werden
- [ ] Die PDF des importierten Belegs ist in den Belegdetails via Signed URL einsehbar

### Sicherheit & RLS
- [ ] User kann nur Belege des eigenen Mandanten sehen und bearbeiten
- [ ] Staging-Tabelle ist durch RLS auf den jeweiligen Mandanten beschränkt (INSERT via n8n Service-Role-Key, SELECT/DELETE via mandant_id)
- [ ] Signed URLs werden nur server-seitig generiert (60 Minuten Gültigkeit)

### Allgemein (bestehend)
- [ ] User kann PDF, JPG, PNG hochladen (max. 10 MB per Datei)
- [ ] Datei wird in Supabase Storage gespeichert (Pfad: `belege/{mandant_id}/{uuid}.{ext}`)
- [ ] Gelöschte Belege sind in der Liste nicht sichtbar

## Edge Cases
- File larger than 10 MB → clear error before upload attempt
- Unsupported file type → validation error, upload blocked
- Duplicate file upload (same filename) → allowed, stored separately with UUID
- Metadata saved without matching transaction → status shows "offen"
- Document deleted while already matched to a transaction → warn user, unlink match, update transaction status to "offen"
- Network error during upload → show retry option, no partial records saved
- Beschreibung exceeds 100 characters → client-side counter + error; server rejects with 400
- Bulk-Delete: user selects 0 rows → delete button disabled
- Bulk-Delete: mix of matched and unmatched belege selected → single warning covers all matched ones, all transactions get unlinked
- n8n inserts row without storage_path → Beleg is imported but no PDF preview available; detail panel shows "Kein Dokument vorhanden"
- n8n inserts row with invalid storage_path (file not in Storage) → Signed URL generation fails; detail panel shows "Dokument nicht verfügbar" (no crash)
- n8n tries to insert into wrong mandant's staging table → RLS blocks the insert; n8n receives 403 error
- Firmenname contains special characters or very long name → staging table name is sanitized (lowercase, only a-z, 0-9, underscore, max 63 chars per PostgreSQL limit)
- Two mandanten have the same sanitized Firmenname → second mandant's staging table gets suffix `_{mandant_id_prefix}` to avoid collision
- Staging table trigger fires but `belege` insert fails (e.g. constraint violation) → trigger rolls back; staging row remains for retry; error logged
- Rechnungstyp is missing in manual upload form → form validation blocks submission with clear error

## Technical Requirements
- Storage: Supabase Storage, bucket scoped per mandant (`belege/{mandant_id}/{uuid}.pdf`)
- Security: Signed URLs for preview (not publicly accessible), 60-minute expiry
- Performance: List loads in < 1s for up to 500 documents
- Browser Support: Chrome, Firefox, Safari (inline PDF via native browser viewer)
- Staging-Tabelle wird beim Mandant-Onboarding (PROJ-2) automatisch angelegt
- Staging-Tabelle Name: `belege_import_` + sanitized Firmenname (lowercase, a-z/0-9/underscore, max 63 chars)
- Trigger-Funktion ist mandantenübergreifend (ein Trigger pro Staging-Tabelle, mappt auf mandant_id)
- n8n-Zugriff auf Staging-Tabelle via Supabase Service-Role-Key (nur für n8n, nicht im Frontend)

---

## Erweiterung v3: "Direkt bezahlt" (2026-04-17)

### Kontext
EAR-Mandanten haben oft Belege für Ausgaben, die bar, mit einer privaten Bankomatkarte oder einer anderen nicht verbundenen Karte bezahlt wurden. Diese Belege bleiben dauerhaft "offen", weil keine Transaktion im System existiert, der sie zugeordnet werden können. Die Erweiterung löst dieses Problem ohne Kassabuch-Umweg.

### User Stories
- Als EAR-Mandant möchte ich einen offenen Beleg als "Direkt bezahlt" markieren können, damit er nicht dauerhaft als offen gelistet bleibt.
- Als EAR-Mandant möchte ich beim Direktbezahlen die Zahlungsart und das Datum angeben können, damit der Buchungseintrag korrekte Metadaten hat.
- Als EAR-Mandant möchte ich, dass direkt bezahlte Belege beim Monatsabschluss eine Buchungsnummer erhalten, damit meine EAR lückenlos ist.

### Acceptance Criteria

#### Kontextmenü-Erweiterung (Belege-Tabelle)
- [ ] Im 3-Punkte-Menü der Belege-Tabelle erscheint "Direkt bezahlt" **nur** wenn `zuordnungsstatus = 'offen'`
- [ ] "Direkt bezahlt" steht zwischen "Bearbeiten" und dem Separator vor "Löschen"
- [ ] Neben "Direkt bezahlt" erscheint ein **?-Icon**, das beim Hovern einen Tooltip zeigt:
  > *"Für Ausgaben, die bar, mit privater Karte oder außerhalb deines verbundenen Firmenkontos bezahlt wurden. Erstellt automatisch einen Buchungseintrag."*
- [ ] Separator (Trennlinie) zwischen "Direkt bezahlt" und "Löschen" bleibt erhalten

#### Dialog "Direkt bezahlt"
- [ ] Dialog öffnet sich mit Titel "Direkt bezahlt"
- [ ] Pflichtfeld: **Datum** (Datepicker, vorausgefüllt mit dem Rechnungsdatum des Belegs)
- [ ] Pflichtfeld: **Zahlungsart** (Dropdown):
  - Bar
  - Bankomat (privat)
  - Kreditkarte (privat)
  - Sonstige
- [ ] Optionales Feld: **Notiz** (Freitext, max. 100 Zeichen)
- [ ] Anzeige (read-only): Betrag aus dem Beleg (Bruttobetrag)
- [ ] Buttons: "Abbrechen" + "Bestätigen"

#### Interne Zahlungsquelle "Direkt bezahlt"
- [ ] Pro Mandant existiert maximal eine interne Zahlungsquelle mit Flag `is_system_quelle = true` und Name "Direkt bezahlt"
- [ ] Diese Quelle ist in der Zahlungsquellen-Verwaltung **nicht sichtbar** (ausgeblendet)
- [ ] Sie wird beim ersten Klick auf "Bestätigen" automatisch angelegt (lazy creation), nicht beim Onboarding
- [ ] Kürzel: `DIR` (fix, nicht editierbar)
- [ ] Typ: `sonstige`

#### Nach Bestätigung
- [ ] Eine neue Transaktion wird auf der "Direkt bezahlt"-Quelle erstellt:
  - `datum` = gewähltes Datum
  - `betrag` = Bruttobetrag des Belegs (negativ, da Ausgabe)
  - `beschreibung` = "Direkt bezahlt" + gewählte Zahlungsart + optionale Notiz
  - `match_status` = `bestaetigt`
  - `beleg_id` = ID des Belegs
  - `workflow_status` = `normal`
- [ ] `belege.zuordnungsstatus` → `zugeordnet`
- [ ] Beleg-Status-Badge in der Tabelle aktualisiert sich sofort auf "Zugeordnet"
- [ ] Erfolgsmeldung (Toast): "Beleg als direkt bezahlt markiert"

#### EAR-Monatsabschluss
- [ ] Transaktionen der "Direkt bezahlt"-Quelle nehmen am EAR-Monatsabschluss teil (Buchungsnummer-Vergabe)
- [ ] Kürzel `DIR` erscheint in der Buchungsnummer: z.B. `E_0001_DIR_01_2026`

### Edge Cases
- **Beleg hat keinen Bruttobetrag:** Dialog zeigt "Kein Betrag hinterlegt" – Bestätigen trotzdem erlaubt; Transaktion bekommt `betrag = 0`
- **Beleg wird nach "Direkt bezahlt" gelöscht:** Transaktion auf der DIR-Quelle wird ungelinkt (bestehende Delete-Logik), DIR-Transaktion bleibt erhalten aber ohne Beleg
- **Abgeschlossener Monat:** Monat-Lock greift – "Direkt bezahlt" für Belege aus abgeschlossenen Monaten wird serverseitig blockiert (HTTP 403)
- **DOPPELT-Mandant:** "Direkt bezahlt" erscheint im Menü (nicht EAR-exklusiv, da buchhalterisch auch für doppelte Buchhaltung sinnvoll) – keine Buchungsnummer, da EAR-Feature
- **"Direkt bezahlt" zweimal aufrufen:** Nicht möglich – Option erscheint nur bei `zuordnungsstatus = 'offen'`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Übersicht: Was wird geändert, was ist neu

| Bereich | Datei/Komponente | Änderungstyp |
|---|---|---|
| **Seite** | `src/app/(app)/belege/page.tsx` | Ändern – neue Filter-States, Multi-Select State, Bulk-Delete Handler |
| **Tabelle** | `src/components/belege/beleg-tabelle.tsx` | Ändern – neue Spalten, Checkbox-Spalte, Dokument-Button |
| **Upload-Dialog** | `src/components/belege/beleg-upload-dialog.tsx` | Ändern – neue Felder (Rechnungsname, Rechnungstyp, UID, Beschreibung) |
| **Detail-Sheet** | `src/components/belege/beleg-detail-sheet.tsx` | Ändern – neue Felder, größere PDF-Vorschau |
| **Lösch-Dialog** | `src/components/belege/beleg-loeschen-dialog.tsx` | Ändern – Bulk-Delete Modus (Anzahl + kombinierte Warnung) |
| **Belege API GET** | `src/app/api/belege/route.ts` | Ändern – neue Filterparameter (rechnungsname, rechnungstyp) |
| **Belege API POST** | `src/app/api/belege/route.ts` | Ändern – neue Felder akzeptieren und speichern |
| **Belege API PATCH** | `src/app/api/belege/[id]/route.ts` | Ändern – neue Felder editierbar |
| **Belege API Bulk-Delete** | `src/app/api/belege/route.ts` (DELETE) | Neu – mehrere IDs auf einmal soft-deleten + Transaktionen unlinken |
| **Supabase Types** | `src/lib/supabase/types.ts` | Ändern – neue Felder und ENUMs ergänzen |
| **Migration 1** | `supabase/migrations/…_add_new_belege_columns.sql` | Neu – neue Spalten + ENUMs in `belege` Tabelle |
| **Migration 2** | `supabase/migrations/…_create_belege_import_staging.sql` | Neu – Funktion + Trigger-Vorlage für Staging-Tabellen |
| **Migration 3** | `supabase/migrations/…_create_staging_for_existing_mandanten.sql` | Neu – Staging-Tabellen für bereits existierende Mandanten anlegen |
| **Onboarding API** | `src/app/api/onboarding/route.ts` | Ändern – bei Mandant-Anlage `create_belege_import_table()` aufrufen |

---

### n8n-Import: Ablauf in Klartext

Der n8n-Import ist der Kernmechanismus, der es ermöglicht, dass Belege **ohne manuelle Eingabe durch den User** automatisch in der Belegverwaltung erscheinen.

```
n8n-Workflow (pro Mandant konfiguriert)
│
├── Schritt 1: PDF-Datei bereitstellen
│   Quelle: z.B. E-Mail-Anhang, Google Drive, lokaler Server
│
├── Schritt 2: PDF in Supabase Storage hochladen
│   → Supabase Storage Node: Upload in Bucket "belege"
│   → Pfad: {mandant_id}/{uuid}.pdf  (mandant_id im Workflow fix hinterlegt)
│   → Ergebnis: storage_path wird zurückgegeben
│
├── Schritt 3: Metadaten in Staging-Tabelle schreiben
│   → Supabase Node "Create a Row"
│   → Tabelle: belege_import_mehr_wert_gruppe_gmbh  (pro Mandant fix)
│   → Felder: rechnungsname, rechnungstyp, lieferant, betrag, datum,
│             beschreibung, storage_path (aus Schritt 2), ...
│
└── Schritt 4: Datenbank-Trigger reagiert automatisch
    → Trigger liest die neue Zeile aus der Staging-Tabelle
    → Kopiert alle Felder in die zentrale "belege"-Tabelle
    → Fügt mandant_id und import_quelle = 'n8n_import' hinzu
    → Setzt verarbeitet_am = jetzt
    → Bei Fehler: Rollback → Zeile bleibt in Staging für manuelle Prüfung

User in Belegverwaltung:
    → Beleg erscheint sofort in der Liste
    → PDF ist via Signed URL in den Belegdetails sichtbar
    → Beleg kann wie ein manuell hochgeladener Beleg bearbeitet/gelöscht werden
```

**Warum Staging-Tabelle statt direktes Schreiben in `belege`?**
- n8n-Workflow kennt keine mandant_id in der App-Logik — die Staging-Tabelle übernimmt dieses Mapping server-seitig und sicher
- n8n braucht nur einen einfachen Service-Role-Key + Tabellenname, keine App-API-Kenntnisse
- Staging-Zeilen bleiben als Audit-Log erhalten (`verarbeitet_am` zeigt wann verarbeitet)

---

### Seitenstruktur (Component Tree)

```
app/(app)/
└── belege/                             ← /belege (page.tsx)
    │
    ├── Header-Bereich
    │   ├── PageTitle "Belege"
    │   ├── FilterBar (2-zeilig für Übersichtlichkeit)
    │   │   ├── Zeile 1: Rechnungsname (Text), Lieferant (Text), Rechnungstyp (Dropdown), Status (Dropdown)
    │   │   ├── Zeile 2: Rechnungsdatum von–bis, Betrag netto von–bis, Betrag brutto von–bis
    │   │   └── "Filter zurücksetzen" Button
    │   └── Aktionsleiste
    │       ├── UploadButton             ← Öffnet BelegUploadDialog
    │       └── BulkDeleteButton         ← Erscheint nur wenn ≥1 Checkbox aktiv (rote Farbe + Anzahl)
    │
    ├── BelegeTabelle (beleg-tabelle.tsx — GEÄNDERT)
    │   ├── Header-Zeile
    │   │   ├── Checkbox "Alle auswählen / Alle abwählen"
    │   │   └── Spalten: Rechnungsname | Rechnungsdatum | Lieferant | Netto | Brutto | Typ | Dok. | Status | Aktionen
    │   └── Daten-Zeilen (je Beleg)
    │       ├── Checkbox (Multi-Select)
    │       ├── Rechnungsname (klickbar → öffnet Detail-Sheet)
    │       ├── Rechnungsdatum
    │       ├── Lieferant
    │       ├── Betrag netto (formatiert: € 1.234,56)
    │       ├── Betrag brutto (formatiert: € 1.234,56)
    │       ├── Rechnungstyp-Badge (farbkodiert)
    │       ├── Dokument-Button (Icon: FileText → öffnet PDF in neuem Tab via Signed URL)
    │       ├── Status-Badge (offen: amber / zugeordnet: grün)
    │       └── Aktionen-Menu (Bearbeiten, Löschen)
    │
    ├── EmptyState        ← Wenn keine Belege vorhanden / Filter ergibt keine Treffer
    │
    ├── BelegUploadDialog (beleg-upload-dialog.tsx — GEÄNDERT)
    │   ├── DropZone (Drag & Drop)
    │   ├── Datei-Vorschau (nach Auswahl)
    │   └── Metadaten-Formular (alle Felder, gruppiert)
    │       ├── Gruppe 1 – Beleginfo: Rechnungsname*, Rechnungsnummer, Rechnungstyp* (Dropdown)
    │       ├── Gruppe 2 – Lieferant: Name*, UID Lieferant, IBAN Lieferant
    │       ├── Gruppe 3 – Beträge: Bruttobetrag, Nettobetrag, MwSt-Satz (Dropdown: 20/10/0%)
    │       ├── Gruppe 4 – Datum: Rechnungsdatum, Fälligkeitsdatum
    │       └── Gruppe 5 – Beschreibung (Textarea, Zeichenzähler 0/100)
    │
    ├── BelegDetailSheet (beleg-detail-sheet.tsx — GEÄNDERT)
    │   ├── PDF-Vorschau (GEÄNDERT: min. 600px Höhe, volle Panel-Breite)
    │   │   ├── Bei PDF: iframe mit Signed URL
    │   │   ├── Bei Bild: img mit Signed URL
    │   │   └── Kein Dokument: Hinweistext "Kein Dokument vorhanden"
    │   └── Metadaten-Formular (editierbar, alle Felder inkl. neue)
    │
    ├── BelegLoeschenDialog (beleg-loeschen-dialog.tsx — GEÄNDERT)
    │   ├── Einzel-Modus: "Beleg [Rechnungsname] wirklich löschen?"
    │   ├── Bulk-Modus: "[X] Belege wirklich löschen?" (NEU)
    │   └── Warnung (wenn ≥1 der markierten Belege zugeordnet ist)
    │
    └── [Kein separater BulkDeleteDialog nötig — BelegLoeschenDialog wird erweitert]
```

---

### Datenmodell

```
Tabelle: belege (GEÄNDERT — neue Spalten)
  Bestehende Spalten (unverändert):
  - id, mandant_id, storage_path, original_filename, dateityp
  - rechnungsnummer, lieferant, lieferant_iban (seit Migration 20260318000006)
  - bruttobetrag, nettobetrag, mwst_satz
  - rechnungsdatum, faelligkeitsdatum
  - zuordnungsstatus, geloescht_am, erstellt_am

  Neue Spalten:
  - rechnungsname        (Text, optional)   ← Freitext-Titel; kommt aus n8n-Workflow
  - rechnungstyp         (Enum, NOT NULL)   ← eingangsrechnung | ausgangsrechnung | gutschrift | sonstiges
                                               Default: eingangsrechnung
  - uid_lieferant        (Text, optional)   ← UID-Nummer des Lieferanten (z.B. ATU12345678)
  - beschreibung         (Text, optional)   ← Max. 100 Zeichen; Check-Constraint in DB
  - import_quelle        (Enum)             ← manuell | n8n_import; Default: manuell

Neue Staging-Tabelle pro Mandant (angelegt beim Onboarding):
  Name: belege_import_{sanitized_firmenname}
  Beispiel: belege_import_mehr_wert_gruppe_gmbh

  Felder:
  - id               (UUID, auto-generiert)
  - rechnungsname    (Text)
  - rechnungsnummer  (Text)
  - rechnungstyp     (Text)              ← n8n sendet als String; Trigger validiert
  - lieferant        (Text)
  - uid_lieferant    (Text, optional)
  - lieferant_iban   (Text, optional)
  - bruttobetrag     (Decimal)
  - nettobetrag      (Decimal)
  - mwst_satz        (Decimal)
  - rechnungsdatum   (Date)
  - faelligkeitsdatum (Date, optional)
  - beschreibung     (Text, optional)
  - storage_path     (Text)              ← Pflichtfeld: Pfad im Supabase Storage Bucket "belege"
  - original_filename (Text, optional)
  - erstellt_am      (Timestamp, auto)
  - verarbeitet_am   (Timestamp)         ← NULL solange noch nicht in belege kopiert

  Trigger: AFTER INSERT → kopiert in belege (setzt mandant_id + import_quelle = 'n8n_import')

Supabase Storage:
  Bucket: "belege"
  Pfad: {mandant_id}/{uuid}.{ext}
  Zugriff: Nur via Signed URLs, 60 Minuten Gültigkeit, server-seitig generiert
```

---

### API-Änderungen

| Endpoint | Methode | Änderung |
|---|---|---|
| `/api/belege` | GET | Neue Filterparameter: `rechnungsname` (ilike), `rechnungstyp` (exakt) |
| `/api/belege` | POST | Neue Felder akzeptieren: rechnungsname, rechnungstyp, uid_lieferant, beschreibung, import_quelle |
| `/api/belege` | DELETE | **NEU**: Bulk-Delete via Body `{ ids: UUID[] }` — soft-deletet alle, unlinkt Transaktionen |
| `/api/belege/[id]` | PATCH | Neue Felder editierbar: rechnungsname, rechnungstyp, uid_lieferant, beschreibung |
| `/api/belege/[id]/signed-url` | GET | Unverändert — gibt Signed URL zurück |
| `/api/belege/search` | GET | Neue Felder durchsuchbar (rechnungsname, rechnungstyp) |

---

### Datenbankmigrationen (Reihenfolge)

| # | Dateiname | Was passiert |
|---|---|---|
| 1 | `…_add_new_belege_columns.sql` | 2 neue ENUMs anlegen (`rechnungstyp_enum`, `import_quelle_enum`), 5 neue Spalten in `belege` hinzufügen, Check-Constraint für beschreibung (max 100 Zeichen), Index auf rechnungstyp |
| 2 | `…_create_belege_import_staging_function.sql` | DB-Funktion `create_belege_import_table(p_mandant_id UUID, p_firmenname TEXT)` anlegen, die: Tabellenname sanitiert, Staging-Tabelle erstellt, Trigger + Trigger-Funktion für automatischen Sync anlegt, RLS auf Staging-Tabelle aktiviert |
| 3 | `…_create_staging_for_existing_mandanten.sql` | Für bereits vorhandene Mandanten `create_belege_import_table()` einmalig aufrufen (damit auch der Demo-Mandant eine Staging-Tabelle erhält) |

**Onboarding-Integration (PROJ-2):**
In `src/app/api/onboarding/route.ts` wird nach erfolgreicher Mandant-Anlage die RPC-Funktion `create_belege_import_table(mandant_id, firmenname)` aufgerufen. Damit erhält jeder neue Mandant automatisch seine Staging-Tabelle.

---

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| PDF-Vorschau Größe | min. 600px Höhe, volle Panel-Breite | Benutzer müssen Rechnungsinhalt lesen können — bisherige kleine Vorschau war unzureichend |
| Multi-Select | Checkbox-Spalte + `selectedIds: Set<string>` State in page.tsx | Standard-Pattern, keine neue Library nötig; shadcn Checkbox bereits installiert |
| Bulk-Delete API | Einzelner DELETE-Endpoint mit `ids[]` Array | Verhindert N+1 API-Calls; eine DB-Transaktion für alle Löschungen |
| Dokument-Button in Tabelle | Icon-Button mit eigenem Signed-URL-Fetch | Direkt-Zugriff ohne Detail-Sheet öffnen zu müssen |
| Staging-Tabelle pro Mandant | Dynamisch via SQL-Funktion angelegt | n8n braucht nur Tabellenname + Service-Key; kein App-API-Wissen nötig |
| Trigger vs. Polling | Datenbank-Trigger (AFTER INSERT) | Sofortige Synchronisation; kein Polling-Overhead; 100% server-seitig |
| Filterbar Layout | 2-zeilig (Zeile 1: Text-Filter + Dropdowns; Zeile 2: Datums-/Betragsfelder) | Löst BUG-PROJ3-017 (7 Filter zu viel für eine Zeile); strukturierte Darstellung |

---

### Abhängigkeiten

| Package | Zweck | Status |
|---|---|---|
| `react-dropzone` | Drag & Drop für Datei-Upload | Bereits installiert |
| shadcn `Checkbox` | Multi-Select in Tabelle | Bereits installiert (`src/components/ui/checkbox.tsx`) |
| shadcn `Textarea` | Beschreibungsfeld | Bereits installiert (`src/components/ui/textarea.tsx`) |
| shadcn `Badge` | Rechnungstyp-Badge | Bereits installiert (`src/components/ui/badge.tsx`) |

## QA Test Results

**Tested:** 2026-03-18 (Round 3)
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification + security audit
**Build Status:** PASS (Next.js production build compiles successfully)

### Round 2 Bug Fix Verification

| Bug ID | Description | Status |
|--------|-------------|--------|
| BUG-PROJ3-004 | file_size column missing from DB | FIXED -- API now destructures `file_size` out before insert: `const { file_size: _, ...belegData } = parsed.data` (route.ts line 71). Server-side Zod still validates size but it is not persisted. |
| BUG-PROJ3-005 | No storage bucket policy in migrations | FIXED -- New migration `20260318000004_create_belege_storage_bucket.sql` creates the `belege` bucket with 10 MB limit, allowed MIME types, and INSERT/SELECT storage policies scoped to `get_mandant_id()`. |
| BUG-PROJ3-006 | Mandant lookup fails for invited users | FIXED -- POST /api/belege now uses `getMandantId(supabase)` which calls the `get_mandant_id()` RPC function (route.ts line 67). |
| BUG-PROJ3-007 | CSP blocks PDF preview in iframe | FIXED -- `middleware.ts` now includes `frame-src ${supabaseUrl}` in the CSP policy (line 13). |
| BUG-PROJ3-008 | CSP blocks image preview from signed URLs | FIXED -- `middleware.ts` now includes Supabase URL in `img-src` directive (line 10). |
| BUG-PROJ3-009 | Betrag filter missing from UI | FIXED -- `belege/page.tsx` now includes `betragVon`/`betragBis` state variables and number input fields in the filter bar (lines 32-33, 167-197). |
| BUG-PROJ3-010 | Deleting matched document does not unlink transaction | FIXED -- DELETE handler in `[id]/route.ts` now updates related transactions when `zuordnungsstatus === 'zugeordnet'`, setting `beleg_id: null, match_status: 'offen'` and clearing match fields (lines 74-87). |
| BUG-PROJ3-011 | Orphaned storage files on metadata save failure | FIXED -- `beleg-upload-dialog.tsx` now calls `supabase.storage.from('belege').remove([storagePath])` when the POST /api/belege call fails (line 202). |

### Acceptance Criteria Status

#### AC-1: User can upload PDF, JPG, PNG files (max. 10 MB per file)
- [x] Upload dialog component exists (`beleg-upload-dialog.tsx`) with react-dropzone
- [x] Client-side file type restriction via `ACCEPTED_TYPES` (PDF, JPEG, PNG)
- [x] Client-side size check: `selected.size > MAX_FILE_SIZE` with toast error
- [x] react-dropzone configured with `maxSize: MAX_FILE_SIZE` (10 MB)
- [x] API validates `dateityp` enum: pdf, jpg, jpeg, png
- [x] API validates `file_size` with Zod but strips it before DB insert (line 71)
- [x] Supabase Storage bucket configured with `file_size_limit: 10485760` and `allowed_mime_types` as third enforcement layer
- **PASS**

#### AC-2: File stored in Supabase Storage under mandant folder
- [x] Storage path pattern: `{mandant_id}/{uuid}.{ext}` generated client-side
- [x] Upload uses `supabase.storage.from('belege').upload(storagePath, file)`
- [x] `upsert: false` prevents overwriting existing files
- [x] Storage bucket created via migration with INSERT/SELECT policies scoped by `get_mandant_id()`
- **PASS**

#### AC-3: After upload, user can enter metadata
- [x] Form fields present: lieferant, rechnungsnummer, bruttobetrag, nettobetrag, mwst_satz, rechnungsdatum, faelligkeitsdatum
- [x] All fields optional (metadata can be saved later)
- [x] Austrian MwSt rates offered: 20%, 10%, 0%
- [x] Date inputs use native `type="date"` for browser date picker
- **PASS**

#### AC-4: Metadata saved to belege table with mandant_id
- [x] POST /api/belege uses `getMandantId(supabase)` which calls `get_mandant_id()` RPC
- [x] Inserts with `mandant_id: mandantId` from the RPC result
- [x] Works for both mandant owners and invited users (Buchhalter)
- **PASS**

#### AC-5: Document list shows required columns
- [x] Table displays: Lieferant, Rechnungsnr., Betrag, Datum, Status (zugeordnet/offen)
- [x] Empty state with helpful message shown when no documents exist
- [x] Loading skeleton during data fetch
- [x] Responsive: Rechnungsnr. hidden below `sm`, Datum hidden below `md`
- **PASS**

#### AC-6: PDF preview renders inline (no download)
- [x] `beleg-detail-sheet.tsx` renders PDF in `<iframe>` with signed URL
- [x] GET /api/belege/[id]/signed-url generates 60-minute signed URL (3600 seconds)
- [x] CSP `frame-src` now includes the Supabase URL
- **PASS**

#### AC-7: Image files show inline preview
- [x] `beleg-detail-sheet.tsx` renders `<img>` with signed URL for JPG/PNG
- [x] CSP `img-src` now includes the Supabase URL
- **PASS**

#### AC-8: Filter by Lieferant, Datum, Betrag, Zuordnungsstatus
- [x] API supports query params: lieferant, status, datum_von, datum_bis, betrag_von, betrag_bis
- [x] Lieferant uses `ilike` for case-insensitive partial match
- [x] UI has filter bar with Lieferant search, Datum von/bis, Betrag von/bis, Status dropdown
- [x] Betrag inputs are `type="number"` with `step="0.01"` and `min="0"`
- [x] Clear filters button resets all fields including betrag
- **PASS**

#### AC-9: User can delete a document (soft delete)
- [x] DELETE /api/belege/[id] sets `geloescht_am` timestamp (pure soft delete)
- [x] File remains in Supabase Storage for audit trail / recovery
- [x] Confirmation dialog before deletion (`beleg-loeschen-dialog.tsx`)
- [x] Warning shown when deleting a matched document (zuordnungsstatus === 'zugeordnet')
- [x] Delete restricted to admin role via `requireAdmin()` check
- [x] When deleting a matched doc, transaction is properly unlinked (beleg_id = null, match_status = 'offen')
- **PASS**

#### AC-10: Deleted documents not visible in list
- [x] GET /api/belege includes `.is('geloescht_am', null)` filter
- [x] GET /api/belege/search also includes `.is('geloescht_am', null)` filter
- [x] RLS policy `belege_select_own` also filters `geloescht_am IS NULL`
- **PASS**

#### AC-11: RLS -- user can only see own mandant's documents
- [x] RLS enabled on `belege` table
- [x] SELECT policy: `mandant_id = get_mandant_id() AND geloescht_am IS NULL`
- [x] INSERT policy: `mandant_id = get_mandant_id()`
- [x] UPDATE policy: `mandant_id = get_mandant_id()`
- [x] `get_mandant_id()` supports both owners and invited users (migration 20260318000000)
- [x] Storage policies also scope by `get_mandant_id()` (migration 20260318000004)
- **PASS**

### Edge Cases Status

#### EC-1: File larger than 10 MB -- clear error before upload attempt
- [x] Client-side: `react-dropzone` configured with `maxSize: MAX_FILE_SIZE`
- [x] Client-side: explicit `selected.size > MAX_FILE_SIZE` check with toast error
- [x] Server-side: Zod validates `file_size` max value
- [x] Storage bucket enforces `file_size_limit: 10485760` as final safety net
- **PASS**

#### EC-2: Unsupported file type -- validation error, upload blocked
- [x] Client-side: `react-dropzone` `accept` prop restricts to PDF/JPEG/PNG
- [x] Server-side: Zod `dateityp` enum validation
- [x] Storage bucket enforces `allowed_mime_types` array
- **PASS**

#### EC-3: Duplicate file upload (same filename) -- allowed, stored separately
- [x] Storage path uses UUID: `{mandant_id}/{uuid}.{ext}` -- unique per upload
- [x] `upsert: false` prevents accidental overwrites
- **PASS**

#### EC-4: Metadata saved without matching transaction -- status shows "offen"
- [x] Default value `zuordnungsstatus NOT NULL DEFAULT 'offen'` in DB schema
- [x] UI badge shows "Offen" with amber styling
- **PASS**

#### EC-5: Document deleted while already matched -- warn user, unlink match
- [x] Delete dialog shows destructive alert when `zuordnungsstatus === 'zugeordnet'`
- [x] DELETE API endpoint now unlinks the transaction (sets beleg_id to null, resets match_status/type/score)
- **PASS**

#### EC-6: Network error during upload -- show retry option, no partial records
- [x] Upload error shows toast error message
- [x] If metadata save fails after successful storage upload, orphaned file is cleaned up via `supabase.storage.from('belege').remove([storagePath])`
- **PASS**

### Security Audit Results

#### Authentication
- [x] All API routes check `supabase.auth.getUser()` and return 401 if not authenticated
- [x] App layout redirects to `/login` if no user session
- [x] Middleware enforces auth for all non-public routes

#### Authorization (Multi-Tenant Isolation)
- [x] RLS policies scope all queries to `get_mandant_id()`
- [x] DELETE requires admin role via `requireAdmin()` check
- [x] PATCH does not enforce admin role -- any authenticated user of the mandant can edit (acceptable per spec)
- [x] Signed URL generation first fetches beleg record (scoped by RLS), preventing cross-tenant URL generation
- [x] Storage policies enforce mandant isolation at the file level

#### Input Validation
- [x] All POST/PATCH bodies validated with Zod schemas
- [x] File type restricted at client, server (Zod), and storage bucket level (triple enforcement)
- [ ] FINDING (Low): `lieferant` filter in GET /api/belege uses `ilike('%${lieferant}%')` -- SQL LIKE wildcards (`%`, `_`) in user input are not escaped. Not exploitable for injection (Supabase JS client parameterizes queries), but can cause unexpected filter behavior if user enters `%` or `_`. Same applies to `/api/belege/search` route `q` parameter in `.or()` with `ilike.%${q}%`. (see BUG-PROJ3-012)

#### Content Security Policy
- [x] CSP `frame-src` now includes the Supabase URL -- PDF iframe preview unblocked
- [x] CSP `img-src` now includes the Supabase URL -- image previews unblocked
- [x] CSP uses nonce for scripts -- good practice
- [x] `frame-ancestors 'none'` prevents clickjacking

#### Signed URL Security
- [x] Signed URLs generated server-side only
- [x] 60-minute expiry (3600s)
- [x] Auth required before URL generation
- [x] RLS prevents generating URLs for other mandants' documents
- [ ] FINDING (Low): Signed URL endpoint does not check `geloescht_am` -- a user who knows a soft-deleted document's ID could still generate a preview URL for it. The RLS policy filters out soft-deleted docs, so this is effectively blocked at the DB level. However, if RLS policy is ever changed, this could become a data leak. (see BUG-PROJ3-013)

#### Security Headers
- [x] X-Frame-Options: DENY (set in `next.config.ts` `headers()`)
- [x] X-Content-Type-Options: nosniff (set in `next.config.ts` `headers()`)
- [x] Strict-Transport-Security: max-age=63072000; includeSubDomains; preload (set in `next.config.ts`)
- [x] Referrer-Policy: strict-origin-when-cross-origin (set in `next.config.ts`)
- [x] Permissions-Policy: camera=(), microphone=(), geolocation=() (set in `next.config.ts`)
- [x] X-DNS-Prefetch-Control: on (set in `next.config.ts`)
- [x] CSP with nonce set per-request in `middleware.ts` (separate from static headers)

#### Rate Limiting
- [ ] FINDING (Medium): No rate limiting on any belege API endpoints. An attacker could flood the upload endpoint or repeatedly request signed URLs. Supabase has some built-in rate limiting, but application-level controls are absent. (see BUG-PROJ3-015)

#### Storage DELETE Policy
- [ ] FINDING (Low): No storage DELETE policy exists (by design -- soft delete only). However, the `beleg-upload-dialog.tsx` cleanup code at line 202 calls `supabase.storage.from('belege').remove([storagePath])` when metadata save fails. Without a DELETE storage policy, this cleanup call will fail silently, and orphaned files will remain. This partially negates the BUG-PROJ3-011 fix. (see BUG-PROJ3-016)

### Cross-Browser and Responsive Testing

#### Cross-Browser (code review based)
- Chrome: PDF iframe preview supported natively. CSP now correctly configured.
- Firefox: PDF iframe preview supported natively. CSP now correctly configured.
- Safari: PDF iframe rendering may have quirks (Safari sometimes requires `application/pdf` content-type header to render inline). Signed URLs from Supabase Storage should include the correct content type from the upload.
- All browsers: `react-dropzone` has broad compatibility
- All browsers: `Intl.NumberFormat('de-AT')` and `Intl.DateTimeFormat('de-AT')` well-supported

#### Responsive Design
- 375px (Mobile): Table columns Rechnungsnr. and Datum hidden via `hidden sm:table-cell` / `hidden md:table-cell`. Upload dialog `max-w-lg` may be tight. Filter bar stacks vertically (`flex-col`). Filter bar now has 7 elements stacked -- may feel crowded on very small screens.
- 768px (Tablet): Rechnungsnr. visible, Datum still hidden. Filter bar starts to flex horizontally. Betrag inputs `sm:w-28` provide compact layout.
- 1440px (Desktop): All columns visible. Sheet detail panel `sm:max-w-xl` -- adequate. All filter elements visible in a single row.
- [ ] FINDING (Low): At 375px, the filter bar with 7 controls (Lieferant, Datum von, Datum bis, Betrag von, Betrag bis, Status, Clear button) may overflow or require excessive scrolling. Consider collapsible filter panel for mobile. (see BUG-PROJ3-017)

### Bugs Found (New in Round 3)

#### BUG-PROJ3-012: LIKE Wildcards Not Escaped in Filter Inputs (Low)
- **Severity:** Low
- **Description:** User input containing `%` or `_` characters in the Lieferant search or the search API `q` parameter will be interpreted as SQL LIKE wildcards, causing unexpected broad or narrow matches. For example, searching for `100%` would match any lieferant containing `100` followed by any character. Not a security vulnerability (queries are parameterized), but a UX issue.
- **Location:** `src/app/api/belege/route.ts` line 42, `src/app/api/belege/search/route.ts` line 27
- **Priority:** Nice to have

#### BUG-PROJ3-013: Signed URL Endpoint Does Not Check Soft Delete Status (Low)
- **Severity:** Low
- **Description:** GET /api/belege/[id]/signed-url fetches the beleg by ID without checking `geloescht_am`. Currently protected by RLS policy (`geloescht_am IS NULL` in SELECT policy), so soft-deleted docs cannot be fetched. But if RLS policy is ever relaxed, this could leak deleted document contents.
- **Location:** `src/app/api/belege/[id]/signed-url/route.ts` line 15-19
- **Priority:** Nice to have (defense in depth)

#### BUG-PROJ3-015: No Rate Limiting on Belege API Endpoints (Medium)
- **Severity:** Medium
- **Description:** No application-level rate limiting exists on `/api/belege`, `/api/belege/[id]`, `/api/belege/[id]/signed-url`, or `/api/belege/search`. An attacker could:
  - Flood the upload endpoint to exhaust storage quota
  - Repeatedly request signed URLs (each valid for 60 minutes)
  - Run large-scale data enumeration via the search endpoint
- **Priority:** Should fix before production deployment

#### BUG-PROJ3-016: Storage Cleanup Fails Silently Due to Missing DELETE Policy (Low)
- **Severity:** Low
- **Description:** The orphaned file cleanup in `beleg-upload-dialog.tsx` (line 202) calls `supabase.storage.from('belege').remove()` when metadata save fails. However, the storage policies only define INSERT and SELECT -- no DELETE policy exists. The remove call will fail silently due to insufficient permissions, leaving the orphaned file in storage anyway.
- **Location:** `supabase/migrations/20260318000004_create_belege_storage_bucket.sql` (no DELETE policy), `src/components/belege/beleg-upload-dialog.tsx` line 202
- **Priority:** Nice to have
- **Fix:** Either add a storage DELETE policy scoped to `get_mandant_id()`, or move the cleanup to a server-side API route that uses the service role key.

#### BUG-PROJ3-017: Filter Bar Crowded on Mobile (Low)
- **Severity:** Low
- **Description:** With the addition of Betrag von/bis filters, the filter bar now contains 7 elements that all stack vertically at 375px. This creates a very tall filter section that pushes the document table far below the fold on mobile devices.
- **Priority:** Nice to have
- **Fix:** Consider a collapsible/expandable filter panel or a filter dialog for mobile viewports.

### Summary
- **Acceptance Criteria:** 11/11 passed
- **Edge Cases:** 6/6 passed
- **Previous Bugs (Round 2):** 8/8 fixed and verified
- **New Bugs Found (Round 3):** 5 total (0 critical, 0 high, 1 medium, 4 low)
- **Security Findings:** 4 (1 medium, 3 low -- no critical or high-severity vulnerabilities)
- **Build Status:** PASS
- **Production Ready:** CONDITIONAL YES
- **Recommendation:** All core functionality works correctly. The 1 medium-severity issue (BUG-PROJ3-015: rate limiting) should be addressed before production deployment. The 4 low-severity issues are nice-to-have improvements that can be deferred to a future sprint.

### Round 4 QA Test Results

**Tested:** 2026-03-18 (Round 4)
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification + security audit
**Scope:** New acceptance criteria (Uebersichtstabelle, Belegdetails, Upload, Filter, Bulk Delete, n8n Import)
**Build Status:** PASS (Next.js production build compiles successfully)
**Lint Status:** SKIP (ESLint 9 / .eslintrc.json config mismatch -- pre-existing project issue, not PROJ-3 related)

#### New AC: Uebersichtstabelle

- [x] **Columns**: Table shows Rechnungsname, Rechnungsdatum, Lieferant, Netto, Brutto, Typ, Dok., Status, Aktionen (`beleg-tabelle.tsx` lines 147-157)
- [x] **Rechnungstyp-Badge**: Color-coded badges for all 4 types (Eingangsrechnung=blue, Ausgangsrechnung=purple, Gutschrift=orange, Sonstiges=gray) (`beleg-tabelle.tsx` lines 53-76)
- [x] **Dokument button**: FileText icon button fetches signed URL and opens in new tab; graceful fallback when `storage_path` is null (shows dash) (`beleg-tabelle.tsx` lines 78-94, 193-209)
- [x] **Status badge**: offen=amber, zugeordnet=green (`beleg-tabelle.tsx` lines 211-220)
- **PASS**

#### New AC: Belegdetails (Side-Sheet)

- [x] **All fields visible and editable**: rechnungsname, rechnungstyp, lieferant, rechnungsnummer, uid_lieferant, lieferant_iban, bruttobetrag, nettobetrag, mwst_satz, rechnungsdatum, faelligkeitsdatum, beschreibung (`beleg-detail-sheet.tsx` lines 257-486)
- [x] **Beschreibung 100-char limit**: Client-side `maxLength={100}` on textarea + Zod `.max(100)` + character counter (`beleg-detail-sheet.tsx` lines 52, 470-483)
- [x] **PDF preview min 600px height**: `min-h-[600px]` class on iframe (`beleg-detail-sheet.tsx` line 233)
- [x] **PDF via signed URL inline**: iframe with signed URL, no download forced (`beleg-detail-sheet.tsx` lines 230-234)
- [x] **Missing document fallback**: Shows "Kein Dokument vorhanden" with FileQuestion icon when `storage_path` is null (`beleg-detail-sheet.tsx` lines 212-217)
- [x] **Broken document fallback**: Shows "Dokument nicht verfuegbar" when signed URL fetch fails (`beleg-detail-sheet.tsx` lines 221-227)
- **PASS**

#### New AC: Upload & Metadaten

- [x] **Rechnungstyp required**: Zod enum validation in upload schema, required field with asterisk in UI, default value 'eingangsrechnung' (`beleg-upload-dialog.tsx` lines 48, 349-350)
- [x] **Beschreibung 100-char limit**: Client `maxLength={100}` + Zod `.max(100)` + character counter (`beleg-upload-dialog.tsx` lines 57, 559, 565-567)
- [x] **All new fields in upload form**: rechnungsname, rechnungsnummer, rechnungstyp, lieferant, uid_lieferant, lieferant_iban, bruttobetrag, nettobetrag, mwst_satz, rechnungsdatum, faelligkeitsdatum, beschreibung -- all present and grouped logically (`beleg-upload-dialog.tsx` lines 310-572)
- [x] **Beschreibung 100-char server-side**: Server Zod schema has `.max(100)` (`route.ts` POST line 20); DB check constraint `belege_beschreibung_max_length` (migration 000008 line 21)
- [x] **All new fields saved**: POST body includes rechnungsname, rechnungstyp, uid_lieferant, beschreibung, import_quelle in Zod schema (`route.ts` lines 17-21)
- **PASS**

#### New AC: Filter (Suche & Filter)

- [x] **Rechnungsname filter**: Text input with ilike search in API (`page.tsx` line 56, `route.ts` line 56)
- [x] **Rechnungstyp filter**: Dropdown with exact match in API (`page.tsx` line 58, `route.ts` line 57)
- [x] **Combined filters**: All params passed to API simultaneously, Supabase chains them (`route.ts` lines 55-62)
- [x] **Filter reset button**: Clears all 10 filter fields including netto/brutto (`page.tsx` lines 146-157)
- [x] **Netto filter processed by API** -- BUG-PROJ3-018 FIXED
- **PASS**

#### New AC: Bulk Delete

- [x] **Checkbox select-all**: Header checkbox with indeterminate state (`beleg-tabelle.tsx` lines 132-133, 140-145)
- [x] **Bulk delete button appears**: Shown when `selectedIds.size > 0` (`page.tsx` lines 182-189)
- [x] **Correct API call**: DELETE /api/belege with `{ ids: [...] }` body, Zod-validated (`beleg-loeschen-dialog.tsx` lines 54-59, `route.ts` lines 29-31)
- [x] **Transactions unlinked**: Bulk delete updates transaktionen with null beleg_id (`route.ts` lines 128-138)
- [x] **Matched-beleg warning**: `hasMatchedBelege` prop shown in bulk dialog (`page.tsx` lines 142-144, `beleg-loeschen-dialog.tsx` lines 93-94, 117-118)
- [x] **Bulk delete requires admin role**: `requireAdmin(supabase)` check at line 108 (`route.ts`)
- [x] **Bulk delete checks Monats-Lock** -- BUG-PROJ3-019 FIXED
- **PASS**

#### New AC: n8n Import

- [x] **Staging table migration correct**: All required columns present (id, rechnungsname, rechnungsnummer, rechnungstyp, lieferant, uid_lieferant, lieferant_iban, bruttobetrag, nettobetrag, mwst_satz, rechnungsdatum, faelligkeitsdatum, beschreibung, storage_path, original_filename, erstellt_am, verarbeitet_am) (migration 000009 lines 40-58)
- [x] **Trigger logic**: BEFORE INSERT trigger copies to belege with mandant_id mapping, sets import_quelle='n8n_import', marks staging row verarbeitet_am (migration 000009 lines 63-117)
- [x] **RLS on staging table**: Enabled with INSERT policy (WITH CHECK true for service_role), SELECT/UPDATE scoped to get_mandant_id() (migration 000009 lines 132-157)
- [x] **Onboarding calls create function**: POST /api/onboarding calls `adminClient.rpc('create_belege_import_table')` after mandant creation (`onboarding/route.ts` lines 71-85)
- [x] **Table name sanitization**: lowercase, non-alphanumeric to underscore, collapse multiples, max 50 chars before prefix, collision handling with mandant_id prefix (migration 000009 lines 16-33)
- [x] **Existing mandanten migration**: Loop creates staging tables for all existing mandanten (migration 000010)
- **PASS**

#### New AC: Sicherheit & RLS (for new features)

- [x] **Staging table RLS correct**: INSERT open (for service_role bypass), SELECT/UPDATE scoped to mandant_id
- [x] **Bulk DELETE requires admin**: `requireAdmin()` check present
- [x] **Bulk DELETE scopes to mandant_id explicitly** -- BUG-PROJ3-020 FIXED
- **PASS**

### Bugs Found (New in Round 4)

#### BUG-PROJ3-018: Netto Filter Parameters Ignored by API (Medium)
- **Severity:** Medium
- **Description:** The frontend sends `betrag_netto_von` and `betrag_netto_bis` query parameters when the user enters values in the "Netto von" / "Netto bis" filter inputs (`page.tsx` lines 62-63). However, the GET /api/belege handler only reads `betrag_von` and `betrag_bis` parameters (which the frontend maps to the brutto filters at lines 64-65). The API has no code to read or apply `betrag_netto_von` / `betrag_netto_bis`, so netto filtering silently does nothing.
- **Steps to reproduce:** Enter a value in "Netto von" filter. Observe the URL parameters include `betrag_netto_von=X`. Note that the API ignores this parameter and returns all results regardless of netto amount.
- **Location:** `src/app/api/belege/route.ts` lines 39-62 (missing `betrag_netto_von`/`betrag_netto_bis` handling), `src/app/(app)/belege/page.tsx` lines 62-63 (sends the params)
- **Priority:** Must fix before production

#### BUG-PROJ3-019: Bulk Delete Skips Monats-Lock Check (High)
- **Severity:** High
- **Description:** The single DELETE endpoint at `/api/belege/[id]` correctly checks `isMonatGesperrt()` before allowing deletion of a beleg linked to a transaction in a closed month (lines 90-108). However, the bulk DELETE endpoint at `/api/belege` (DELETE handler, lines 103-146) has no Monats-Lock check at all. An admin could bulk-delete belege that belong to closed months, unlinking their transactions and corrupting closed-month data integrity.
- **Steps to reproduce:** Close a month that has matched belege. Select those belege via checkboxes. Click bulk delete. The deletion succeeds without any lock check.
- **Location:** `src/app/api/belege/route.ts` DELETE handler (lines 103-146)
- **Priority:** Must fix before production

#### BUG-PROJ3-020: Bulk Delete Does Not Explicitly Scope to Mandant (Medium)
- **Severity:** Medium
- **Description:** The bulk DELETE endpoint at `/api/belege` performs `.in('id', ids)` on the belege table without explicitly adding a `.eq('mandant_id', ...)` filter. It relies entirely on RLS to prevent cross-tenant deletion. While RLS should block it, defense-in-depth dictates that the application layer should also enforce mandant scoping, especially for destructive operations. If RLS is misconfigured or temporarily disabled (e.g., during migration), this could allow deleting another mandant's belege. The single DELETE endpoint has the same pattern but is somewhat mitigated by the prior `.select()` which is RLS-scoped.
- **Location:** `src/app/api/belege/route.ts` lines 120-124
- **Priority:** Should fix before production

#### BUG-PROJ3-021: PATCH API Missing lieferant_iban Field (Medium)
- **Severity:** Medium
- **Description:** The PATCH /api/belege/[id] Zod update schema includes fields rechnungsname, rechnungstyp, uid_lieferant, beschreibung, etc., but does NOT include `lieferant_iban`. The detail sheet form (`beleg-detail-sheet.tsx` line 345-356) renders an editable "IBAN Lieferant" input and the `cleanFormValues` function sends it in the PATCH body (line 64). However, since `lieferant_iban` is not in the Zod schema, it gets stripped during validation and any user edits to the IBAN field are silently discarded.
- **Steps to reproduce:** Open a beleg's detail sheet. Edit the "IBAN Lieferant" field. Click Save. Reopen the detail sheet. The IBAN reverts to the previous value.
- **Location:** `src/app/api/belege/[id]/route.ts` lines 7-19 (missing `lieferant_iban` in updateSchema)
- **Priority:** Must fix before production

#### BUG-PROJ3-022: Staging Table INSERT Policy Allows Any Authenticated User (Low)
- **Severity:** Low
- **Description:** The staging table INSERT policy uses `WITH CHECK (true)`, meaning any authenticated user (not just service_role) can insert rows into any mandant's staging table. The intent is for n8n to use the service_role key (which bypasses RLS anyway), so this open INSERT policy is redundant for n8n but creates a theoretical vector where an authenticated user of Mandant A could insert fake belege into Mandant B's staging table. The trigger would then copy them into Mandant B's belege table with the hardcoded mandant_id.
- **Location:** `supabase/migrations/20260318000009_create_belege_import_staging_function.sql` lines 137-142
- **Priority:** Should fix (tighten to service_role only or restrict via mandant check)

#### BUG-PROJ3-023: Detail Sheet Brutto/Nettobetrag onChange Sends String Instead of Number (Low)
- **Severity:** Low
- **Description:** In `beleg-detail-sheet.tsx`, the bruttobetrag and nettobetrag input fields use `onChange={(e) => field.onChange(e.target.value)}` (lines 372, 391), which passes a string to react-hook-form. The upload dialog correctly uses `parseFloat(e.target.value)` to convert to a number. The Zod schema allows `z.union([z.number(), z.literal('')])` which will fail validation for non-empty string values like "123.45" (a string, not a number). The PATCH then sends a string to the API, where the server-side Zod schema expects `z.number()`. This can cause the save to fail with a validation error.
- **Location:** `src/components/belege/beleg-detail-sheet.tsx` lines 372, 391
- **Priority:** Must fix before production

### Round 4 Summary
- **New Acceptance Criteria Tested:** 7 areas (Uebersichtstabelle, Belegdetails, Upload, Filter, Bulk Delete, n8n Import, Security)
- **Fully Passed:** 7/7 (all areas pass after bug fixes)
- **Bugs Found:** 6 total (0 critical, 1 high, 3 medium, 2 low) -- all 6 FIXED
- **Build Status:** PASS
- **Production Ready:** CONDITIONAL YES (pending final QA verification of fixes)

**Bug Priority Summary:**
| Bug ID | Severity | Priority | Summary |
|--------|----------|----------|---------|
| BUG-PROJ3-018 | Medium | Must fix | Netto filter params ignored by API | FIXED |
| BUG-PROJ3-019 | High | Must fix | Bulk delete skips Monats-Lock check | FIXED |
| BUG-PROJ3-020 | Medium | Should fix | Bulk delete no explicit mandant_id scope | FIXED |
| BUG-PROJ3-021 | Medium | Must fix | PATCH missing lieferant_iban in Zod schema | FIXED |
| BUG-PROJ3-022 | Low | Should fix | Staging INSERT policy too permissive | FIXED |
| BUG-PROJ3-023 | Low | Must fix | Detail sheet sends string instead of number for betrag fields | FIXED |

**Recommendation:** All 6 Round 4 bugs have been fixed. Production-ready pending final QA verification.

### Round 4 Bug Fix Verification

**Fixed:** 2026-03-18
**Build Status:** PASS (Next.js production build compiles successfully)

| Bug ID | Fix Description | File(s) Changed |
|--------|----------------|-----------------|
| BUG-PROJ3-018 | Added `betrag_netto_von` and `betrag_netto_bis` params to GET handler, applying `.gte()` / `.lte()` filters on the `nettobetrag` column | `src/app/api/belege/route.ts` |
| BUG-PROJ3-019 | Added `isMonatGesperrt()` check to bulk DELETE handler. Fetches all belege being deleted, checks linked transactions for locked months, returns 409 with list of blocked beleg IDs if any belong to closed months | `src/app/api/belege/route.ts` |
| BUG-PROJ3-020 | Added `getMandantId()` call and `.eq('mandant_id', mandantId)` to all bulk DELETE queries (fetch, soft-delete, and transaction unlink) for defense-in-depth | `src/app/api/belege/route.ts` |
| BUG-PROJ3-021 | Added `lieferant_iban: z.string().optional()` to the PATCH updateSchema so IBAN edits are no longer stripped during validation | `src/app/api/belege/[id]/route.ts` |
| BUG-PROJ3-022 | Removed the permissive `WITH CHECK (true)` INSERT policy for authenticated users. Since service_role bypasses RLS, no explicit INSERT policy is needed. Authenticated users are now denied INSERT by default (RLS enabled, no matching policy) | `supabase/migrations/20260318000009_create_belege_import_staging_function.sql` |
| BUG-PROJ3-023 | Changed both bruttobetrag and nettobetrag `onChange` handlers from `field.onChange(e.target.value)` to `field.onChange(parseFloat(e.target.value) \|\| 0)` to send numbers instead of strings | `src/components/belege/beleg-detail-sheet.tsx` |

## QA Test Results -- v3 "Direkt bezahlt"

**Tested:** 2026-04-17
**Tester:** QA Engineer (AI)
**Method:** Static code review + build verification + security audit
**Scope:** Erweiterung v3 "Direkt bezahlt" acceptance criteria, edge cases, security
**Build Status:** PASS (Next.js production build compiles successfully)

### Acceptance Criteria Status

#### AC-v3-1: Kontextmenue-Erweiterung (Belege-Tabelle)
- [x] "Direkt bezahlt" appears in 3-Punkte-Menu only when `zuordnungsstatus === 'offen'` (`beleg-tabelle.tsx` line 333: conditional render on `beleg.zuordnungsstatus === 'offen' && onDirektBezahlt`)
- [x] "Direkt bezahlt" appears after "Bearbeiten" (line 337, after "Bearbeiten" at line 329)
- [x] Separator before "Loschen" is present (line 367: `DropdownMenuSeparator` before delete item)
- [x] HelpCircle icon (?) is shown next to the label (line 340: `<HelpCircle>` icon)
- [x] Tooltip with correct text appears on hover (lines 343-347: TooltipContent with explanation text)
- [ ] **BUG-PROJ3-024:** Tooltip inside DropdownMenuItem may not display correctly. Radix Tooltip wrapped around a DropdownMenuItem has known issues where the tooltip does not appear because the DropdownMenu portal steals pointer events. The `TooltipProvider` wraps the entire menu item inside the dropdown content portal, which may cause the tooltip to render behind or be clipped by the dropdown. **Severity: Low** -- the ?-icon is visible, tooltip may not appear on hover.
- **CONDITIONAL PASS** (tooltip may have UX issue)

#### AC-v3-2: Dialog "Direkt bezahlt"
- [x] Dialog opens with title "Direkt bezahlt" (`direkt-bezahlt-dialog.tsx` line 115)
- [x] Beschreibung text explains the action (lines 116-117)
- [ ] **BUG-PROJ3-025 (High):** Datum field NOT pre-filled with Rechnungsdatum. The form reset logic is in `handleOpenChange` (line 60-65) which wraps `onOpenChange`. However, Radix Dialog only calls `onOpenChange` on user-initiated close actions (Escape, overlay click), NOT when the parent sets `open={true}` programmatically. As a result, `datum` stays as `''` (its initial useState value) when the dialog opens. The user must manually enter the date. The Bestätigen button is correctly disabled when `!datum`, so no data corruption occurs, but the AC "vorausgefüllt mit dem Rechnungsdatum des Belegs" is violated.
- [x] Zahlungsart dropdown with 4 options: Bar, Bankomat (privat), Kreditkarte (privat), Sonstige (lines 34-38)
- [x] Optional Notiz field with 100-char limit: client-side `maxLength={100}` + character counter (lines 166-180)
- [x] Read-only Bruttobetrag display (lines 121-130)
- [x] Buttons: "Abbrechen" + "Bestätigen" (lines 186-198)
- **FAIL** (datum not pre-filled)

#### AC-v3-3: Interne Zahlungsquelle "Direkt bezahlt"
- [x] Lazy creation: find-or-create pattern in API (route.ts lines 75-117)
- [x] `is_system_quelle = true` set on insert (route.ts line 91)
- [x] Kuerzel = `DIR` (route.ts line 90)
- [x] Typ = `sonstige` (route.ts line 89)
- [x] UNIQUE constraint prevents duplicates per mandant (migration line 9-11: partial unique index `WHERE is_system_quelle = true`)
- [x] Race condition handling: catches error code 23505 and retries lookup (route.ts lines 99-110)
- [ ] **BUG-PROJ3-026 (Medium):** System source visible in Zahlungsquellen settings page. The settings page fetches `?alle=true` (zahlungsquellen/page.tsx line 23), which bypasses the `is_system_quelle=false` filter (zahlungsquellen/route.ts lines 36-38). The DIR source will appear alongside user-created sources. AC states: "Diese Quelle ist in der Zahlungsquellen-Verwaltung nicht sichtbar (ausgeblendet)".
- **FAIL** (visible in settings)

#### AC-v3-4: Nach Bestaetigung
- [ ] **BUG-PROJ3-027 (Critical):** Zahlungsart enum mismatch between frontend and backend. The dialog sends lowercase/underscore values (`bar`, `bankomat_privat`, `kreditkarte_privat`, `sonstige`) from the Select component (direkt-bezahlt-dialog.tsx lines 34-38). The API Zod schema expects display-format values (`Bar`, `Bankomat (privat)`, `Kreditkarte (privat)`, `Sonstige`) (route.ts line 9). Every submission will fail with a 400 validation error. The feature is completely non-functional.
- [x] Transaktion created with correct fields: `datum`, `betrag = -(bruttobetrag ?? 0)`, `match_status = 'bestaetigt'`, `beleg_id`, `workflow_status = 'normal'`, `quelle_id` (route.ts lines 127-137) -- code is correct assuming validation passes
- [x] Beschreibung format: "Direkt bezahlt -- {zahlungsart}" + optional notiz (route.ts lines 120-123)
- [x] Beleg updated to `zuordnungsstatus = 'zugeordnet'` (route.ts lines 143-149)
- [x] Success toast: "Beleg als direkt bezahlt markiert" (direkt-bezahlt-dialog.tsx line 97)
- [x] Table refreshes on success via `onSuccess={fetchBelege}` (belege/page.tsx line 515)
- **FAIL** (validation error blocks all submissions)

#### AC-v3-5: EAR-Monatsabschluss
- [x] The `earMonatsabschluss` function fetches all qualifying transaktionen including those on the DIR source (ear-buchungsnummern.ts lines 157-166). It then fetches kuerzel from zahlungsquellen for all relevant quelle_ids (lines 177-186). Since the DIR source has kuerzel='DIR', the buchungsnummer will correctly use it: e.g., `E_0001_DIR_01_2026`.
- [x] No special-case code needed -- the generic system already handles DIR kuerzel correctly via the kuerzelMap lookup.
- **PASS**

### Edge Cases Status

#### EC-v3-1: Beleg without Bruttobetrag
- [x] Dialog shows formatted currency of `null` as `-` via `formatCurrency(beleg.bruttobetrag)` (direkt-bezahlt-dialog.tsx lines 40-45, 124). However, spec says should show "Kein Betrag hinterlegt" -- minor deviation.
- [x] API uses `-(beleg.bruttobetrag ?? 0)` which correctly defaults to 0 (route.ts line 131)
- **PASS** (functional, minor label deviation)

#### EC-v3-2: Locked month (Monats-Lock)
- [x] Server-side check: `isMonatGesperrt(supabase, mandantId, datum)` returns 403 when the target month is locked (route.ts lines 64-69)
- [x] Lock check uses the user-selected datum, not the beleg's rechnungsdatum -- correct behavior
- **PASS**

#### EC-v3-3: Duplicate DIR source prevention
- [x] UNIQUE partial index `uq_zahlungsquellen_system_per_mandant ON zahlungsquellen (mandant_id) WHERE is_system_quelle = true` (migration line 9-11)
- [x] Race condition: catches 23505 error and retries (route.ts lines 99-110)
- **PASS**

#### EC-v3-4: "Direkt bezahlt" not shown when zuordnungsstatus is not 'offen'
- [x] Conditional render: `beleg.zuordnungsstatus === 'offen' && onDirektBezahlt` (beleg-tabelle.tsx line 333)
- **PASS**

#### EC-v3-5: DOPPELT-Mandant (non-EAR)
- [x] No EAR-specific guard on the menu item or API -- "Direkt bezahlt" is available to all mandant types (as specified)
- **PASS**

### Security Audit (v3)

#### Authentication
- [x] API checks `supabase.auth.getUser()` and returns 401 if not authenticated (route.ts line 18-19)

#### Authorization (Multi-Tenant Isolation)
- [x] Beleg fetch uses RLS-scoped query (route.ts lines 45-50)
- [x] Beleg must belong to current mandant (RLS enforces this)
- [x] MandantId fetched via `getMandantId()` for zahlungsquelle and transaktion creation

#### Input Validation
- [x] Zod schema validates datum format (YYYY-MM-DD regex), zahlungsart enum, notiz max 100 chars (route.ts lines 7-11)
- [x] Request body parse error handled (route.ts lines 25-29)
- [ ] FINDING (see BUG-PROJ3-027): Zod enum values do not match frontend values -- validation always fails

#### Injection Protection
- [x] All database operations use Supabase JS client with parameterized queries
- [x] No string interpolation in SQL

#### Rate Limiting
- [ ] FINDING (Low): No rate limiting on the direkt-bezahlt endpoint. An attacker could rapidly create many DIR transactions. Mitigated by the fact that each beleg can only be marked once (zuordnungsstatus check), but a mandant with many open belege could be exploited. Consistent with existing BUG-PROJ3-015 for all belege endpoints.

#### Data Integrity
- [x] Monat-Lock prevents changes to closed months
- [x] Beleg must be in 'offen' status
- [x] Beleg must not be soft-deleted

### Bugs Found (v3)

#### BUG-PROJ3-024: Tooltip Inside DropdownMenuItem May Not Display (Low)
- **Severity:** Low
- **Description:** The TooltipProvider/Tooltip wraps a DropdownMenuItem inside a DropdownMenuContent portal. Radix UI Tooltip and DropdownMenu use separate portals and event handling. The tooltip may not appear on hover because the DropdownMenu captures pointer events within its content area. This is a known Radix UI limitation when nesting Tooltip inside DropdownMenu.
- **Steps to reproduce:** Open the 3-Punkte-Menu on an open beleg. Hover over the ? icon next to "Direkt bezahlt". The tooltip may not appear.
- **Location:** `src/components/belege/beleg-tabelle.tsx` lines 334-349
- **Priority:** Nice to have (cosmetic, the ?-icon is still visible as a hint)
- **Suggested fix:** Use a custom title attribute on the menu item instead, or restructure to use DropdownMenuLabel with a separate info popover.

#### BUG-PROJ3-025: Datum Not Pre-filled When Dialog Opens (High)
- **Severity:** High
- **Description:** The form reset logic that pre-fills `datum` with `beleg.rechnungsdatum` is inside the `handleOpenChange` callback (lines 60-65). This function wraps `onOpenChange`, which Radix Dialog only calls on user-initiated close actions (Escape, overlay click, X button), NOT when the parent programmatically sets `open={true}`. As a result, when the user clicks "Direkt bezahlt" in the menu, the dialog opens but the datum field is empty (initial `useState('')` value). The user must manually enter a date, violating the AC "vorausgefüllt mit dem Rechnungsdatum des Belegs".
- **Steps to reproduce:** Click the 3-Punkte-Menu on an open beleg with a Rechnungsdatum set. Click "Direkt bezahlt". The datum field is empty instead of pre-filled.
- **Location:** `src/components/belege/direkt-bezahlt-dialog.tsx` lines 54, 60-65
- **Priority:** Must fix before production
- **Suggested fix:** Add a `useEffect` that watches `open` and `beleg` props to reset form state:
  ```tsx
  useEffect(() => {
    if (open && beleg) {
      setDatum(beleg.rechnungsdatum ?? new Date().toISOString().slice(0, 10))
      setZahlungsart('')
      setNotiz('')
    }
  }, [open, beleg])
  ```

#### BUG-PROJ3-026: System Source Visible in Zahlungsquellen Settings (Medium)
- **Severity:** Medium
- **Description:** The Zahlungsquellen settings page fetches sources with `?alle=true` (`zahlungsquellen/page.tsx` line 23), which bypasses the `is_system_quelle=false` filter in the API (`zahlungsquellen/route.ts` lines 36-38). After a user creates their first "Direkt bezahlt" entry, the DIR system source will appear as a card in the settings page alongside user-created sources. Users could potentially edit, deactivate, or delete it. The AC states: "Diese Quelle ist in der Zahlungsquellen-Verwaltung nicht sichtbar (ausgeblendet)".
- **Steps to reproduce:** Mark a beleg as "Direkt bezahlt". Navigate to Settings > Zahlungsquellen. The "Direkt bezahlt" source card is visible.
- **Location:** `src/app/api/zahlungsquellen/route.ts` lines 36-38 (missing filter when `alle=true`), `src/app/(app)/settings/zahlungsquellen/page.tsx` line 23
- **Priority:** Must fix before production
- **Suggested fix:** Always exclude system sources in the API: `query = query.eq('is_system_quelle', false)` regardless of the `alle` parameter. Or add client-side filtering: `quellen.filter(q => !q.is_system_quelle)`.

#### BUG-PROJ3-027: Zahlungsart Enum Mismatch -- Feature Non-Functional (Critical)
- **Severity:** Critical
- **Description:** The frontend dialog sends zahlungsart values as lowercase/underscore identifiers (`bar`, `bankomat_privat`, `kreditkarte_privat`, `sonstige`) from the Select component's `value` props (direkt-bezahlt-dialog.tsx lines 34-38). The backend Zod schema expects display-label format values (`Bar`, `Bankomat (privat)`, `Kreditkarte (privat)`, `Sonstige`) (route.ts line 9). Because the Zod `.enum()` performs strict equality matching, EVERY submission will fail with a 400 validation error. The entire "Direkt bezahlt" feature is completely non-functional.
- **Steps to reproduce:** Open the "Direkt bezahlt" dialog. Select any Zahlungsart. Fill in datum. Click "Bestätigen". The request fails with a validation error.
- **Location:**
  - Frontend: `src/components/belege/direkt-bezahlt-dialog.tsx` lines 34-38 (sends `bar`, `bankomat_privat`, etc.)
  - Backend: `src/app/api/belege/[id]/direkt-bezahlt/route.ts` line 9 (expects `Bar`, `Bankomat (privat)`, etc.)
- **Priority:** Must fix immediately (blocking)
- **Suggested fix:** Align the Zod enum with the frontend values. Change line 9 of route.ts to:
  ```ts
  zahlungsart: z.enum(['bar', 'bankomat_privat', 'kreditkarte_privat', 'sonstige']),
  ```
  Then update the `beschreibung` construction (line 120) to map internal values to display labels, e.g.:
  ```ts
  const zahlungsartLabels: Record<string, string> = {
    bar: 'Bar',
    bankomat_privat: 'Bankomat (privat)',
    kreditkarte_privat: 'Kreditkarte (privat)',
    sonstige: 'Sonstige',
  }
  let beschreibung = `Direkt bezahlt – ${zahlungsartLabels[zahlungsart] ?? zahlungsart}`
  ```

### v3 Summary
- **Acceptance Criteria:** 2/5 passed, 2 failed (AC-v3-2, AC-v3-4), 1 conditional pass (AC-v3-1)
- **Edge Cases:** 5/5 passed
- **Bugs Found:** 4 total (1 critical, 1 high, 1 medium, 1 low)
- **Security Findings:** Enum mismatch causes all requests to fail; no further exploitable vulnerabilities found
- **Build Status:** PASS
- **Production Ready:** NO (bugs fixed immediately after QA)

### v3 Bug Fix Verification

**Fixed:** 2026-04-17
**Build Status:** PASS (Next.js production build compiles successfully)

| Bug ID | Severity | Fix | Files Changed |
|--------|----------|-----|---------------|
| BUG-PROJ3-027 | Critical | Changed `zahlungsartOptions` values in frontend to match API enum exactly: `'Bar'`, `'Bankomat (privat)'`, `'Kreditkarte (privat)'`, `'Sonstige'` | `src/components/belege/direkt-bezahlt-dialog.tsx` |
| BUG-PROJ3-025 | High | Replaced `handleOpenChange` reset logic with `useEffect` watching `open` and `beleg` – reliably fires when parent sets `open={true}` | `src/components/belege/direkt-bezahlt-dialog.tsx` |
| BUG-PROJ3-026 | Medium | Moved `is_system_quelle=false` filter outside the `if (!alle)` block – system sources are always excluded regardless of `?alle=true` | `src/app/api/zahlungsquellen/route.ts` |
| BUG-PROJ3-024 | Low | Replaced Radix Tooltip (unreliable inside DropdownMenu portal) with native HTML `title` attribute on a wrapping `<span>` | `src/components/belege/beleg-tabelle.tsx` |

**Bug Priority Summary:**
| Bug ID | Severity | Priority | Summary |
|--------|----------|----------|---------|
| BUG-PROJ3-024 | Low | Nice to have | Tooltip may not display inside DropdownMenu |
| BUG-PROJ3-025 | High | Must fix | Datum not pre-filled (useEffect needed) |
| BUG-PROJ3-026 | Medium | Must fix | DIR source visible in settings page |
| BUG-PROJ3-027 | Critical | Must fix immediately | Zahlungsart enum mismatch -- feature non-functional |

**Recommendation:** The v3 "Direkt bezahlt" feature has 1 critical bug (BUG-PROJ3-027) that makes the entire feature non-functional. No submission can succeed due to the Zod validation mismatch between frontend and backend. Additionally, 1 high-severity bug (BUG-PROJ3-025) means the datum field is never pre-filled. Both must be fixed before the feature can be tested end-to-end. After fixing those, the medium-severity BUG-PROJ3-026 (system source visible in settings) should also be addressed.

## Deployment

**Deployed (v1.3.0):** 2026-03-18
**Production URL:** https://belegmanagerv1.vercel.app
**Platform:** Vercel (Frontend) + Supabase EU Frankfurt (Backend)
**Git Tag:** v1.3.0-PROJ-3
**Migrations applied (v1):** 20260318000000 – 20260318000010 (11 migrations)

**v3 "Direkt bezahlt" – In Review (2026-04-17)**
**Pending migration:** `20260417000005_add_is_system_quelle.sql`
**New files:** `src/components/belege/direkt-bezahlt-dialog.tsx`, `src/app/api/belege/[id]/direkt-bezahlt/route.ts`

### GitHub Auto-Deploy
Für automatisches Deployment bei jedem `git push`:
→ vercel.com → Project belegmanagerv1 → Settings → Git → GitHub Repository verbinden
