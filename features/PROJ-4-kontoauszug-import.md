# PROJ-4: Kontoauszug-Import

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren

## User Stories
- As a user, I want to upload a bank statement CSV file so that my payment transactions are imported into the system
- As a user, I want to see a preview of the parsed transactions before confirming the import so that I can catch errors
- As a user, I want to select the correct CSV column mapping (date, amount, description, IBAN) so that imports from different banks work correctly
- As a user, I want to see a history of all imports (date, file name, number of transactions) so that I can track what has been imported
- As a user, I want duplicate transactions to be detected automatically so that no transaction is imported twice

## Acceptance Criteria
- [ ] User can upload a CSV file (UTF-8 or Latin-1 encoding, semicolon or comma separated)
- [ ] System auto-detects column structure; user can manually adjust column mapping if needed
- [ ] Preview table shows parsed rows (max 10 rows) before final import
- [ ] User confirms import → transactions saved to `transaktionen` table with `mandant_id` and `quelle_id` (Kontoauszug)
- [ ] Each transaction has: Datum, Betrag (negativ = Ausgabe), Beschreibung, IBAN/BIC (wenn vorhanden), Buchungsreferenz
- [ ] Duplicate detection: same Datum + Betrag + Buchungsreferenz within the same mandant → skipped with notice
- [ ] Import summary shown after completion: X imported, Y skipped (duplicates), Z errors
- [ ] Import history stored: Dateiname, Importdatum, Anzahl Transaktionen, Benutzer
- [ ] RLS: transactions scoped to mandant_id

## Edge Cases
- CSV with no header row → user can manually assign column mapping
- CSV with missing required fields (date or amount) → row skipped, counted as error
- Negative vs. positive amounts (bank format varies) → user confirms interpretation during mapping
- Re-importing the same file → duplicates detected and skipped, user informed
- Very large CSV (1000+ rows) → import runs without timeout, progress indicator shown
- Encoding issues (Umlaute) → Latin-1 auto-detected, fallback to manual encoding selection
- CSV from different Austrian banks (Erste, Raiffeisen, BAWAG) → flexible column mapping covers all

## Technical Requirements
- Accepted formats: CSV (UTF-8, Latin-1), separator auto-detection (;, ,)
- Max file size: 5 MB
- Normalization: All amounts stored as decimal (positive = Eingang, negative = Ausgang)
- Performance: 1000 rows parsed and previewed in < 3s

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/
└── transaktionen/
    ├── TransaktionenPage               ← /transaktionen (PROJ-5+6 ergänzen Matching)
    │   └── ImportButton
    │
    └── import/
        └── ImportWizard                ← 3-schrittiger Prozess
            ├── Step 1: Datei hochladen
            │   ├── DropZone
            │   ├── EncodingSelect      ← Auto / UTF-8 / Latin-1
            │   └── TrennzeichenSelect  ← Auto / Semikolon / Komma
            │
            ├── Step 2: Spalten zuordnen
            │   ├── SpaltenmappingTabelle
            │   │   ├── DatumSpalte / BetragSpalte / BeschreibungSpalte
            │   │   ├── IBANSpalte (optional) / ReferenzSpalte (optional)
            │   │   └── BetragVorzeichenToggle
            │   └── VorschauTabelle     ← Erste 10 Zeilen mit gemappten Werten
            │
            └── Step 3: Bestätigen & Importieren
                ├── ImportSummaryPreview
                ├── DuplikatHinweis
                ├── ImportButton
                └── ImportErgebnis      ← X importiert / Y Duplikate / Z Fehler

        └── ImportHistorie              ← Dateiname | Datum | Anzahl | Benutzer
```

### Datenmodell

```
Tabelle: zahlungsquellen
  - id (UUID, Primärschlüssel)
  - mandant_id (UUID, FK → mandanten)
  - name (Text)
  - typ (Enum)                → kontoauszug / kassa / kreditkarte / paypal / sonstige
  - iban (Text, optional)
  - csv_mapping (JSONB)       → gespeichertes Spalten-Mapping für Wiederverwendung
  - aktiv (Boolean)
  - erstellt_am (Timestamp)

Tabelle: transaktionen
  - id (UUID, Primärschlüssel)
  - mandant_id (UUID, FK → mandanten)
  - quelle_id (UUID, FK → zahlungsquellen)
  - datum (Date)
  - betrag (Decimal)          → negativ = Ausgabe, positiv = Eingang
  - beschreibung (Text)
  - iban_gegenseite (Text, optional)
  - bic_gegenseite (Text, optional)
  - buchungsreferenz (Text, optional)
  - match_status (Enum)       → offen / vorgeschlagen / bestaetigt / kein_beleg
  - match_score (Integer)     → 0–100
  - workflow_status (Enum)    → normal / rueckfrage / erledigt
  - erstellt_am (Timestamp)

  UNIQUE Constraint: (mandant_id, quelle_id, datum, betrag, buchungsreferenz)
  → Verhindert Duplikate auf DB-Ebene, auch bei Race Conditions / parallelen Importen
  → Fallback ohne Buchungsreferenz: (mandant_id, quelle_id, datum, betrag, beschreibung)

Tabelle: import_protokolle
  - id, mandant_id, quelle_id, dateiname, importiert_am
  - anzahl_importiert, anzahl_duplikate, anzahl_fehler
  - importiert_von (UUID → auth.users)
```

### Duplikat-Schutz (zweistufig)

```
Schicht 1 – Anwendung: Vor dem Import prüfen ob Kombination existiert
            → Zeigt "Y Duplikate werden übersprungen"

Schicht 2 – Datenbank: UNIQUE Constraint auf Tabelle transaktionen
            → Harte Ablehnung auch bei Race Conditions, API-Retry, 2 Browser-Tabs

Sonderfall: Keine Buchungsreferenz im CSV → Constraint auf datum+betrag+beschreibung
            → UI warnt bei "verdächtigen Duplikaten" (z.B. 2× selber Betrag am selben Tag)
```

### CSV-Parsing-Strategie

```
Client-seitiges Parsing (papaparse) → sofortige Vorschau ohne Server-Roundtrip
Auto-Detect: Encoding (BOM/Byte-Pattern) + Trennzeichen
Bekannte Bankformate (Erste, Raiffeisen, BAWAG) → Auto-Mapping
Unbekannt → manuelle Spalten-Zuordnung durch Benutzer
Server-seitiger Batch-Insert via API Route (Duplikat-Check + DB-Write)
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| CSV-Parsing | Client-seitig (papaparse) | Sofortige Vorschau ohne Server-Roundtrip |
| Import | Server-seitig (API Route) | DB-Zugriff für Duplikat-Check + sicherer Batch-Insert |
| Duplikat-Schutz | DB UNIQUE Constraint + App-Check | Garantierter Schutz auch bei Race Conditions |
| Mapping speichern | zahlungsquellen.csv_mapping (JSONB) | Nächster Import derselben Quelle ohne Re-Mapping |

### Abhängigkeiten

| Package | Zweck |
|---|---|
| `papaparse` | CSV-Parsing im Browser |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
