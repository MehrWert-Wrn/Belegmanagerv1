# PROJ-6: Manuelle Zuordnung

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Belege müssen existieren
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen existieren
- Requires: PROJ-5 (Matching-Engine) – Ampel-Status muss sichtbar sein

## User Stories
- As a user, I want to manually assign an invoice to a transaction (red/yellow status) so that I can resolve unmatched items
- As a user, I want to confirm a suggested match (yellow status) so that it becomes fully confirmed (green)
- As a user, I want to remove an incorrect match from a transaction so that I can reassign it correctly
- As a user, I want to mark a transaction as "kein Beleg erforderlich" (e.g. bank fees) so that it doesn't count as unmatched
- As a user, I want to see all unmatched/yellow transactions in a focused view so that I can work through them efficiently

## Acceptance Criteria
- [ ] From any transaction row, user can open a "Zuordnen"-Dialog
- [ ] Dialog shows: transaction details on the left, searchable list of unmatched belege on the right
- [ ] User can search belege by: Lieferant, Rechnungsnummer, Betrag, Datum
- [ ] Selecting a Beleg and confirming creates a match (status → green, match_type = MANUAL)
- [ ] User can confirm a yellow (suggested) match with one click → status → green
- [ ] User can remove a match from a green transaction → status reverts to red
- [ ] User can mark a transaction as "Kein Beleg" (e.g. Bankgebühren) → special green status, no beleg required
- [ ] Bulk action: select multiple transactions → assign same beleg or mark as "Kein Beleg"
- [ ] Unmatched transactions view: filtered list showing only red + yellow transactions
- [ ] All manual actions are logged (timestamp, user) in the match record

## Edge Cases
- User tries to assign an already-matched beleg to a second transaction → warning shown, user must unlink first
- Transaction amount and beleg amount differ significantly → warning shown, user must explicitly confirm
- User assigns a beleg from a different month → allowed with warning (for cross-month corrections)
- Beleg has no amount entered yet → can still be manually assigned, warning about missing metadata
- Bulk assignment of 50+ transactions → progress shown, no timeout

## Technical Requirements
- Dialog opens without full page reload (modal/drawer)
- Search in beleg list: < 300ms response time for up to 500 documents
- All match events stored with: created_at, created_by (user_id), match_type (MANUAL / confirmed suggestion)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
app/(app)/transaktionen/
└── TransaktionenPage
    ├── FilterBar
    │   └── "Offene Positionen"-Tab     ← Nur ROT + GELB
    │
    ├── TransaktionZeile
    │   ├── [Gelb] BestätigenButton     ← 1-Klick: Vorschlag → GRÜN
    │   ├── [Gelb] AblehnenButton       ← Vorschlag → ROT
    │   ├── [Rot/Grün] ZuordnenButton   ← Öffnet ZuordnungsDialog
    │   ├── [Grün] ZuordnungEntfernen   ← Match löschen → ROT
    │   └── KeinBelegButton             ← Sonder-Grün (z.B. Bankgebühren)
    │
    ├── ZuordnungsDialog                ← Modal (shadcn Dialog)
    │   ├── TransaktionsDetails         ← Links: Datum, Betrag, Beschreibung
    │   └── BelegSuche                  ← Rechts: Suchfeld + Liste
    │       ├── SuchInput               ← Lieferant / RN / Betrag / Datum
    │       ├── BelegSuchergebnis (×n)  ← Lieferant | RN | Betrag | Datum
    │       │   └── BetragsWarnBadge    ← Bei starker Abweichung
    │       └── EmptyState
    │
    └── BulkAktionsLeiste               ← Bei Checkbox-Selektion
        ├── BulkKeinBelegButton
        └── BulkZuordnenButton

API:
  POST   /api/transaktionen/[id]/match   → Beleg zuordnen
  DELETE /api/transaktionen/[id]/match   → Zuordnung entfernen
  PATCH  /api/transaktionen/[id]/match   → Als "kein_beleg" markieren
```

### Datenmodell (keine neue Tabelle – schreibt in transaktionen)

```
Manuelle Zuordnung:   match_type="MANUAL", match_status="bestaetigt", beleg_id=X
Kein Beleg:           match_type="KEIN_BELEG", match_status="kein_beleg", beleg_id=null
Vorschlag bestätigt:  match_status="bestaetigt", match_bestaetigt_von=auth.uid()
Zuordnung entfernt:   beleg_id=null, match_type=null, match_status="offen"

Audit: match_bestaetigt_am (Timestamp) + match_bestaetigt_von (UUID) auf transaktionen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Zuordnungs-UI | Modal Dialog | Kein Seitenkontext-Verlust |
| Beleg-Suche | Client-seitig (< 500 Belege) | < 300ms, kein Server-Call |
| Bulk-Aktionen | Checkbox + Aktionsleiste | Pattern aus Gmail/Linear |
| Audit-Trail | Felder auf transaktionen | Kein separates Log-Table nötig |

### Abhängigkeiten

Keine neuen Packages – shadcn/ui (Dialog, Checkbox, Badge).

## Frontend Implementation Notes

### Components Created
- `src/components/transaktionen/zuordnungs-dialog.tsx` - Modal dialog with transaction details (left) and searchable beleg list (right). Includes client-side search, amount/month deviation warnings, and beleg-already-assigned error handling.
- `src/components/transaktionen/bulk-aktions-leiste.tsx` - Sticky bottom bar for bulk actions (Kein Beleg, Zuordnen) with selection count badge.

### Components Updated
- `src/components/transaktionen/transaktionen-tabelle.tsx` - Added checkbox column for bulk selection (select all / individual), row highlighting on selection.
- `src/components/transaktionen/matching-aktionen-menu.tsx` - Added "Kein Beleg erforderlich", "Zuordnung entfernen", and "Markierung aufheben" menu items. Reorganized action visibility per status.
- `src/app/(app)/transaktionen/page.tsx` - Added "Offene Positionen" tab (red + yellow only) with count badge. Integrated ZuordnungsDialog and BulkAktionsLeiste. Wired manual assign handler through all components.

### API Endpoints Used (already existed)
- `POST /api/transaktionen/[id]/match` - Assign beleg manually
- `DELETE /api/transaktionen/[id]/match` - Remove assignment
- `PATCH /api/transaktionen/[id]/match` - Mark as "kein_beleg"

### Acceptance Criteria Coverage
- Zuordnen-Dialog opens from any transaction row via dropdown menu
- Dialog shows transaction details left, searchable beleg list right
- Search by Lieferant, Rechnungsnummer, Betrag, Datum (client-side, < 300ms)
- Confirm yellow matches with 1 click (existing confirm action)
- Remove matches from green transactions (new "Zuordnung entfernen")
- "Kein Beleg" marking (new action in menu)
- Bulk actions via checkboxes + sticky action bar
- "Offene Positionen" tab for red + yellow transactions
- Amount deviation and cross-month warnings displayed

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
