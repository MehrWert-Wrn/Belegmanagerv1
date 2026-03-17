# PROJ-7: Kassabuch

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding)
- Requires: PROJ-3 (Belegverwaltung) – Belege für Kassazuordnung
- Requires: PROJ-5 (Matching-Engine) – Matching-Logik wird wiederverwendet
- Requires: PROJ-6 (Manuelle Zuordnung) – Manuelle Zuordnung gilt auch für Kassakassa

## User Stories
- As a user, I want to manage a cash register journal (Kassabuch) as a separate payment source so that cash transactions are tracked separately from bank transactions
- As a user, I want to manually enter cash transactions (date, amount, description, supplier) so that my cash payments are recorded
- As a user, I want cash transactions to go through the same matching process as bank transactions so that I don't need a separate workflow
- As a user, I want to see the running cash balance so that I can verify my physical cash count

## Acceptance Criteria
- [ ] Kassabuch is a separate `zahlungsquelle` in the system (type = KASSA, alongside type = KONTOAUSZUG)
- [ ] User can add cash transactions manually: Datum, Betrag (Ausgabe negativ, Einnahme positiv), Beschreibung, Lieferant (Freitext)
- [ ] User can edit and delete cash transactions (soft delete)
- [ ] Cash transactions appear in the same transaction list view, filterable by source (Kassa / Bank)
- [ ] Matching engine runs identically on cash transactions (same Stufe 1 + Stufe 2 logic)
- [ ] Manual assignment (PROJ-6) works identically for cash transactions
- [ ] Running cash balance displayed: Anfangssaldo + sum of all transactions = current balance
- [ ] User sets the opening balance (Anfangssaldo) for the Kassabuch
- [ ] Monthly closing (PROJ-8) includes Kassabuch as a required source
- [ ] RLS: Kassabuch transactions scoped to mandant_id

## Edge Cases
- User enters a positive cash amount (Einnahme) → allowed, shown separately but included in balance
- Running balance goes negative → warning shown (unusual for a Kassabuch)
- CSV import not supported for Kassabuch (manual entry only in MVP)
- Multiple months of Kassabuch entries → balance carries forward month to month
- Opening balance can only be set once; changes require admin confirmation (or simply allow editing with a warning)

## Technical Requirements
- Kassabuch shares the `transaktionen` table with a `quelle_id` pointing to the Kassa source
- No separate table needed – matching logic is source-agnostic
- Opening balance stored on the `zahlungsquellen` record

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/kassabuch/                    ← eigene Seite (nicht in /transaktionen)
├── KassabuchHeader
│   ├── SaldoAnzeige                    ← Anfangssaldo + Summe = Aktueller Saldo
│   │   └── NegativSaldoWarnung         ← Badge wenn Saldo < 0
│   ├── AnfangssaldoButton              ← Öffnet Anfangssaldo-Dialog
│   └── EintragHinzufügenButton
│
├── KassabuchTabelle                    ← Chronologisch, neueste oben
│   └── KassaEintragZeile (×n)
│       ├── Datum / Lieferant / Beschreibung
│       ├── Betrag                      ← Rot (Ausgabe) / Grün (Einnahme)
│       ├── AmpelBadge                  ← Identisch zu PROJ-5
│       ├── BelegReferenz
│       └── AktionenMenu                ← Bearbeiten / Löschen / Zuordnen
│
├── KassaEintragDialog                  ← Neu + Bearbeiten
│   ├── DatumPicker / BetragFeld (mit Vorzeichen-Toggle)
│   ├── LieferantFeld / BeschreibungFeld
│   └── ZuordnenOptional                ← Beleg direkt beim Erstellen zuordnen
│
└── AnfangssaldoDialog
    ├── SaldoFeld
    └── WarnungBeiÄnderung

API:
  POST   /api/kassabuch/eintraege
  PATCH  /api/kassabuch/eintraege/[id]
  DELETE /api/kassabuch/eintraege/[id]  ← Soft Delete
  PATCH  /api/kassabuch/anfangssaldo
```

### Datenmodell (keine neue Tabelle)

```
zahlungsquellen (bestehend)
  → typ = "kassa", automatisch beim Onboarding angelegt
  → anfangssaldo (Decimal)              ← neues Feld
  → anfangssaldo_gesetzt_am (Timestamp)

transaktionen (bestehend)
  → Kassaeinträge: quelle_id = Kassa-Zahlungsquelle
  → Positiv = Einnahme, Negativ = Ausgabe
  → Alle match_* Felder identisch zu Bankbuchungen
  → geloescht_am (Timestamp)            ← Soft Delete (neues Feld)

Saldo: anfangssaldo + SUM(betrag) wo nicht gelöscht = Aktueller Kassastand
```

### Unterschiede zu Kontoauszug

| Aspekt | Kontoauszug | Kassabuch |
|---|---|---|
| Erfassung | CSV-Import | Manuelle Eingabe |
| Bearbeiten/Löschen | Nein | Ja (Soft Delete) |
| Saldo | Nein | Laufender Saldo |
| Matching + Zuordnung | Identisch (PROJ-5/6) | Identisch (PROJ-5/6) |

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Eigene Seite /kassabuch | Ja | Andere UX (editierbar, Saldo) – eigene Seite sinnvoller |
| Geteiltes Datenmodell | Ja | Matching ohne Änderung, kein Code-Duplication |
| Saldo-Berechnung | On-the-fly Client-side | Keine extra DB-Spalte, bei < 1.000 Einträgen instant |

### Abhängigkeiten

Keine neuen Packages.

## Frontend Implementation Notes

**Implemented on:** 2026-03-17

### Components Created
- `src/components/kassabuch/saldo-anzeige.tsx` - Balance card showing Anfangssaldo, Bewegungen, and Aktueller Kassastand with negative balance warning badge
- `src/components/kassabuch/kassabuch-tabelle.tsx` - Table with edit/delete/matching actions menu per row, reuses AmpelBadge from PROJ-5
- `src/components/kassabuch/kassa-eintrag-dialog.tsx` - Add/Edit dialog with Vorzeichen-Toggle (Ausgabe/Einnahme), Datum, Betrag, Lieferant, Beschreibung
- `src/components/kassabuch/anfangssaldo-dialog.tsx` - Opening balance dialog with warning when entries exist
- `src/components/kassabuch/kassa-loeschen-dialog.tsx` - Soft-delete confirmation dialog

### Page
- `src/app/(app)/kassabuch/page.tsx` - Main page with header, saldo card, filter bar (search, dates, match-status), table, and all dialogs

### Reused Components
- `AmpelBadge` from `@/components/transaktionen/ampel-badge` (identical matching status display)
- `ZuordnungsDialog` from `@/components/transaktionen/zuordnungs-dialog` (manual assignment, PROJ-6)

### API Integration
- GET `/api/kassabuch/eintraege` - Fetch entries with date filters
- POST `/api/kassabuch/eintraege` - Create new entry
- PATCH `/api/kassabuch/eintraege/[id]` - Edit entry
- DELETE `/api/kassabuch/eintraege/[id]` - Soft delete
- GET `/api/kassabuch/saldo` - Fetch current balance
- PATCH `/api/kassabuch/anfangssaldo` - Set opening balance
- Matching actions use existing `/api/matching/*` and `/api/transaktionen/[id]/match` endpoints

### Design Decisions
- Client-side filtering for search and status (API already handles date filtering server-side)
- Saldo is fetched from dedicated endpoint (server-side calculation), not computed client-side, to ensure accuracy
- Sidebar already had Kassabuch nav item (BookOpen icon)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
