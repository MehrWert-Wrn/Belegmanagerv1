# PROJ-3: Belegverwaltung

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren

## User Stories
- As a user, I want to upload invoice documents (PDF, JPG, PNG) so that they are stored digitally
- As a user, I want to preview an uploaded document without downloading it so that I can verify its contents quickly
- As a user, I want to enter metadata for each document (Rechnungsnummer, Lieferant, Betrag, Datum, Fälligkeit) so that it can be matched with transactions
- As a user, I want to see a list of all uploaded documents with their metadata so that I have an overview
- As a user, I want to filter and search documents by supplier, date range, or amount so that I can find specific invoices quickly
- As a user, I want to delete a document that was uploaded by mistake so that my data stays clean

## Acceptance Criteria
- [ ] User can upload PDF, JPG, PNG files (max. 10 MB per file)
- [ ] File is stored in Supabase Storage under the mandant's folder (scoped by mandant_id)
- [ ] After upload, user can enter metadata: Lieferant (Freitext), Rechnungsnummer, Bruttobetrag, Nettobetrag, MwSt-Satz, Rechnungsdatum, Fälligkeitsdatum
- [ ] Metadata is saved to the `belege` table with `mandant_id`
- [ ] Document list shows: Lieferant, Rechnungsnummer, Betrag, Datum, Zuordnungsstatus (zugeordnet / offen)
- [ ] PDF preview renders inline in the browser (no download required)
- [ ] Image files (JPG/PNG) show inline preview
- [ ] User can filter list by: Lieferant, Datum (von–bis), Betrag (von–bis), Zuordnungsstatus
- [ ] User can delete a document (soft delete preferred; file removed from storage)
- [ ] Deleted documents are no longer visible in the list
- [ ] RLS: User can only see and modify documents belonging to their mandant_id

## Edge Cases
- File larger than 10 MB → clear error before upload attempt
- Unsupported file type → validation error, upload blocked
- Duplicate file upload (same filename) → allowed, stored separately with timestamp
- Metadata saved without matching transaction → status shows "offen"
- Document deleted while already matched to a transaction → warn user, unlink match, update transaction status to "offen"
- Network error during upload → show retry option, no partial records saved

## Technical Requirements
- Storage: Supabase Storage, bucket scoped per mandant (`belege/{mandant_id}/{uuid}.pdf`)
- Security: Signed URLs for preview (not publicly accessible)
- Performance: List loads in < 1s for up to 500 documents
- Browser Support: Chrome, Firefox, Safari (inline PDF via native browser viewer)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/
└── belege/                             ← /belege
    ├── BelegeLayout
    │   ├── BelegeHeader
    │   │   ├── PageTitle               ← "Belege"
    │   │   ├── FilterBar               ← Lieferant, Datum von–bis, Betrag von–bis, Status
    │   │   └── UploadButton            ← Öffnet Upload-Dialog
    │   │
    │   ├── BelegeTabelle               ← Sortierbare Tabelle (shadcn Table)
    │   │   └── BelegZeile (×n)         ← Lieferant | RN | Betrag | Datum | Status-Badge
    │   │       └── AktionenMenu        ← Vorschau / Bearbeiten / Löschen
    │   │
    │   └── EmptyState                  ← Wenn noch keine Belege vorhanden
    │
    ├── BelegUploadDialog               ← Modal: Datei-Drop + Metadaten-Formular
    │   ├── DropZone                    ← Drag & Drop oder Klick zum Hochladen
    │   ├── DateiVorschau               ← Thumbnail nach Auswahl
    │   └── MetadatenFormular           ← Lieferant, RN, Bruttobetr., Netto, MwSt, Datum, Fälligkeit
    │
    ├── BelegDetailSheet                ← Side-Sheet: öffnet bei Klick auf Zeile
    │   ├── DokumentVorschau            ← PDF iframe / img mit Signed URL
    │   └── MetadatenFormular           ← Gleiche Felder, editierbar
    │
    └── BelegLoeschenDialog             ← Confirm-Dialog vor Löschung
        └── WarnungWennZugeordnet       ← Zusatzwarnung wenn Beleg bereits gematcht ist
```

### App-Shell (gilt ab PROJ-3 für alle weiteren Features)

```
app/(app)/
├── layout.tsx               ← App-Shell mit Sidebar
│   ├── Sidebar
│   │   ├── Logo
│   │   ├── Nav-Links        ← Belege / Transaktionen / Monatsabschluss / Einstellungen
│   │   └── UserMenu         ← Name + Logout
│   └── MainContent
│
├── dashboard/               ← PROJ-5
├── belege/                  ← PROJ-3
├── transaktionen/           ← PROJ-4+5+6
├── kassabuch/               ← PROJ-7
├── monatsabschluss/         ← PROJ-8
└── settings/                ← PROJ-2+12
```

### Datenmodell

```
Tabelle: belege
  - id (UUID, Primärschlüssel)
  - mandant_id (UUID, FK → mandanten)
  - storage_path (Text)              → belege/{mandant_id}/{uuid}.{ext}
  - original_filename (Text)
  - dateityp (Text)                  → pdf / jpg / png
  - lieferant (Text)
  - rechnungsnummer (Text)
  - bruttobetrag (Decimal)
  - nettobetrag (Decimal)
  - mwst_satz (Decimal)
  - rechnungsdatum (Date)
  - faelligkeitsdatum (Date, optional)
  - zuordnungsstatus (Enum)          → offen / zugeordnet
  - geloescht_am (Timestamp)         → Soft Delete
  - erstellt_am (Timestamp)

Supabase Storage: Bucket "belege", Pfad: belege/{mandant_id}/{uuid}.{ext}
Zugriff: Nur via Signed URLs (60 Min. Gültigkeit)
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| PDF-Preview | Native Browser iframe + Signed URL | Kein extra Package, Cross-Browser-kompatibel |
| File-Upload | Supabase Storage direkt vom Client | Kein Upload-Endpoint nötig, RLS via Bucket Policies |
| Soft Delete | geloescht_am Timestamp | Audit-Trail, Matching-Rückverfolgung |
| Signed URL | Server-side generiert, 60 Min. | Dokumente nie öffentlich zugänglich |

### Abhängigkeiten

| Package | Zweck |
|---|---|
| `react-dropzone` | Drag & Drop für Datei-Upload |

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
