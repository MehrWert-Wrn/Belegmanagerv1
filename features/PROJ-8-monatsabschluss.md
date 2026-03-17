# PROJ-8: Monatsabschluss-Workflow

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Implementation Notes (Frontend)
- Overview page at `/monatsabschluss` with year selector and all 12 months as cards
- Detail page at `/monatsabschluss/[jahr]/[monat]` with completeness check and close/reopen actions
- Components: MonatsKarte, VollstaendigkeitsPruefung, AbschlussDialog, WiedereroeffnenDialog
- Double-confirm checkbox for > 10 open transactions
- DATEV export warning on reopen if export exists
- Responsive design with mobile matching progress bar
- Loading skeletons, error states, empty states implemented
- All UI uses shadcn/ui primitives (Card, Badge, Dialog, Progress, Checkbox, etc.)
- Types defined in `/src/lib/monatsabschluss-types.ts`

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen importiert sein
- Requires: PROJ-5 (Matching-Engine) – Ampel-Status muss vorliegen
- Requires: PROJ-6 (Manuelle Zuordnung) – Manuelle Korrekturen müssen abgeschlossen sein
- Requires: PROJ-7 (Kassabuch) – Kassabuch ist Teil des Abschlusses

## User Stories
- As a user, I want to close a month so that the data is locked and no further changes are made
- As a user, I want to see a completeness check before closing so that I know what is still outstanding
- As a user, I want to see which transactions are unmatched before closing so that I can resolve them first
- As a user, I want closed months to be visually locked so that data integrity is guaranteed
- As a user, I want to reopen a closed month (with confirmation) in case of corrections so that I can fix mistakes

## Acceptance Criteria
- [ ] Monatsabschluss-view shows all months with their status: Offen / In Bearbeitung / Abgeschlossen
- [ ] Before closing, system runs completeness check:
  - Count of rote Transaktionen (unmatched) per active Zahlungsquelle
  - Kassabuch: Balance verified
  - All active Zahlungsquellen must have at least one import for the month
- [ ] Completeness check result shown as checklist with pass/fail per item
- [ ] User can close the month even with open red transactions (warning shown, explicit confirmation required)
- [ ] On close: month status set to "Abgeschlossen", all transactions for that month are locked (no edits)
- [ ] Locked transactions: edit/delete buttons hidden, match actions disabled
- [ ] Closed month shows a lock icon in the month overview
- [ ] User can click "Wiedereröffnen" → confirmation dialog → month unlocked, status back to "In Bearbeitung"
- [ ] Reopen logged with timestamp and user
- [ ] DATEV-Export (PROJ-9) only available for closed months

## Edge Cases
- Month has zero transactions (no imports) → warning in completeness check, user can still force-close
- User closes month with 50+ red transactions → very explicit warning ("X offene Positionen"), double-confirmation
- User tries to edit a transaction in a closed month → blocked with message "Monat ist abgeschlossen"
- Concurrent close attempt by two users → last-write-wins with optimistic locking, or simply allow since MVP is single-user
- Reopening a month that already has a DATEV export → warning "Export existiert bereits, Wiedereröffnung kann Export ungültig machen"

## Technical Requirements
- Month locking: `monat_status` field on a `monatsabschluesse` table (mandant_id, jahr, monat, status, closed_at, closed_by)
- Locking enforced at API layer (not just UI)
- RLS: only transactions of own mandant_id accessible

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/monatsabschluss/
├── MonatsÜbersicht                     ← Liste aller Monate
│   └── MonatsKarte (×n)
│       ├── StatusBadge                 ← Offen / In Bearbeitung / Abgeschlossen 🔒
│       ├── MatchingQuote               ← "94% gematcht (3 offen)"
│       ├── AbschliessenButton          ← Nur bei offenen Monaten
│       ├── ExportButton                ← Nur bei abgeschlossenen (→ PROJ-9)
│       └── WiedereröffnenButton        ← Nur bei abgeschlossenen
│
└── /monatsabschluss/[jahr]/[monat]     ← Detail-Ansicht
    ├── VollständigkeitsPrüfung         ← Checklist
    │   ├── CheckItem: je Zahlungsquelle ← ✓ Import vorhanden / ✗ Kein Import
    │   ├── CheckItem: Offene Posten    ← Anzahl roter Transaktionen
    │   └── CheckItem: Kassasaldo       ← ✓ Positiv / ⚠ Negativ
    │
    ├── OffeneTransaktionen             ← Liste der roten TX (Links zu /transaktionen)
    │
    └── AbschlussDialog
        ├── ZusammenfassungText
        ├── DoubleConfirmCheckbox        ← Bei > 10 offenen Positionen
        └── AbschliessenButton (final)

    WiedereröffnenDialog
        └── WarnungText (DATEV-Export ungültig wenn vorhanden)

API:
  GET  /api/monatsabschluss/[jahr]/[monat]           → Status + Vollständigkeitsprüfung
  POST /api/monatsabschluss/[jahr]/[monat]/schliessen
  POST /api/monatsabschluss/[jahr]/[monat]/oeffnen
```

### Datenmodell

```
Neue Tabelle: monatsabschluesse
  - id (UUID)
  - mandant_id (UUID, FK)
  - jahr (Integer), monat (Integer)
  - status (Enum)                       → offen / in_bearbeitung / abgeschlossen
  - abgeschlossen_am, abgeschlossen_von
  - wiedergeoeffnet_am, wiedergeoeffnet_von
  - datev_export_vorhanden (Boolean)
  UNIQUE(mandant_id, jahr, monat)

Locking: API prüft bei jedem Schreib-Request auf transaktionen ob Monat abgeschlossen
         → Wenn ja: 403 Forbidden (nicht nur UI-seitig)
```

### Vollständigkeitsprüfung-Logik

```
Für jede aktive Zahlungsquelle: mind. 1 Transaktion im Monat?
Anzahl match_status = "offen" (ROT)?
Kassasaldo ≥ 0?

Ampel: Alle ✓ + 0 offen → Grün | Offen > 0 → Gelb | Quelle ohne Import → Rot
       Abschluss in allen Fällen möglich, aber mit gestuften Warnungen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Locking | API-Layer (403) | UI-Hiding allein ist unsicher |
| Monat-Record | Lazy (bei erstem Ereignis) | Kein Batch-Job nötig |
| Double-Confirm | Ab 10 offenen Positionen | Schutz vor versehentlichem Abschluss |

### Abhängigkeiten

Keine neuen Packages.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
