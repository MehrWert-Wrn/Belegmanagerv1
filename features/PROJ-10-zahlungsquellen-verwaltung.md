# PROJ-10: Zahlungsquellen-Verwaltung (v2)

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-2 (Mandant-Onboarding) – mandant_id muss existieren
- Requires: PROJ-4 (Kontoauszug-Import) – Import-Logik wird wiederverwendet
- Requires: PROJ-5 (Matching-Engine) – Matching muss quellen-agnostisch sein
- Enhances: PROJ-8 (Monatsabschluss) – neue Quellen werden in Vollständigkeitsprüfung aufgenommen

## User Stories
- As a user, I want to add custom payment sources (e.g. company credit card, PayPal Business, fuel card DKV) so that all payment channels are tracked in one place
- As a user, I want to configure each payment source with its name, type, and import format so that CSV imports work correctly
- As a user, I want to activate or deactivate payment sources so that inactive sources don't affect monthly closing
- As a user, I want each payment source to have its own transaction list and matching workflow so that data is clearly separated

## Acceptance Criteria
- [ ] User can create a new Zahlungsquelle: Name (Freitext), Typ (Bank, Kreditkarte, PayPal, Kassa, Sonstige), IBAN/Konto (optional)
- [ ] User can configure CSV import column mapping per source (reuses PROJ-4 mapping logic)
- [ ] User can activate/deactivate a Zahlungsquelle
- [ ] Active sources appear in the main transaction view (filterable by source)
- [ ] Inactive sources are hidden from monthly closing completeness check
- [ ] Matching engine runs identically for all sources
- [ ] User can edit source name/settings after creation
- [ ] User can delete a source (only if it has no transactions; otherwise deactivate)
- [ ] Maximum 10 active payment sources per mandant (MVP limit)
- [ ] RLS: sources scoped to mandant_id

## Edge Cases
- User tries to delete a source with existing transactions → blocked, only deactivation allowed
- Two sources with the same name → allowed (user's responsibility)
- User imports a CSV to the wrong source → transactions appear under wrong source; user must delete and re-import
- Source deactivated mid-month → existing transactions remain, just excluded from future completeness checks
- PayPal source: special PAYPAL_ID_MATCH logic in matching engine triggered by source type

## Technical Requirements
- `zahlungsquellen` table: id, mandant_id, name, typ, iban, csv_mapping (JSONB), aktiv, created_at
- Default sources (Kontoauszug, Kassabuch) created automatically during onboarding
- RLS enforced on zahlungsquellen table

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/settings/zahlungsquellen/
├── ZahlungsquellenHeader
│   ├── AktivLimit                  ← "7 / 10 aktive Quellen"
│   └── NeueQuelleButton
│
├── ZahlungsquellenListe
│   └── QuelleKarte (×n)
│       ├── QuelleIcon + Name + Typ
│       ├── IBAN (optional)
│       ├── StatusToggle            ← Aktiv / Inaktiv (Switch)
│       ├── ImportButton            ← Direkt zur Import-Seite dieser Quelle
│       └── AktionenMenu            ← Bearbeiten / Löschen (nur ohne TX)
│
└── QuelleErstellenDialog / BearbeitenDialog
    ├── NameFeld / TypSelect / IBANFeld
    └── CSVMappingSection           ← Wiederverwendet aus PROJ-4 Import-Wizard

API:
  GET    /api/zahlungsquellen
  POST   /api/zahlungsquellen
  PATCH  /api/zahlungsquellen/[id]
  DELETE /api/zahlungsquellen/[id]  ← Nur wenn keine TX vorhanden
```

### Datenmodell

```
Tabelle: zahlungsquellen (bereits in PROJ-4 definiert – keine Änderung nötig)
  PROJ-10 fügt nur die Verwaltungs-UI hinzu, keine neuen Felder
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Ort | /settings/zahlungsquellen | Administrations-Bereich, nicht im Tagesgeschäft |
| CSV-Mapping UI | Wiederverwendet aus PROJ-4 | Kein Duplicate Code |
| Löschen blockieren | Wenn TX vorhanden → nur Deaktivierung | Datenverlust verhindern |
| Limit 10 aktiv | API-seitig geprüft | Performance-Schutz im MVP |

### Abhängigkeiten

Keine neuen Packages.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
