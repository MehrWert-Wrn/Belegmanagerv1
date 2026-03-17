# PROJ-5: Matching-Engine

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – Belege mit Metadaten müssen vorhanden sein
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen importiert sein

## User Stories
- As a user, I want imported transactions to be automatically matched to invoice documents so that I save hours of manual work
- As a user, I want to see a traffic-light status (green/yellow/red) for each transaction so that I know which ones need attention
- As a user, I want to understand why a match was made (match reason shown) so that I can trust the automation
- As a user, I want to see suggested matches for unmatched transactions (yellow) so that I can quickly confirm them

## Acceptance Criteria
- [ ] After import (or on-demand), matching engine runs automatically for all unmatched transactions of the mandant
- [ ] **Stufe 1 – Hard Match** (Score 100, deterministisch): matched instantly, no user confirmation needed
  - RN_MATCH: Rechnungsnummer found in transaction description
  - SEPA_MATCH: SEPA Verwendungszweck matches invoice reference
  - IBAN_GUARDED: IBAN in transaction matches supplier's known IBAN + amount matches
  - PAYPAL_ID_MATCH: PayPal transaction ID matches invoice reference
- [ ] **Stufe 2 – Score-Matching** (0–100 Punkte):
  - Betrag: exakte Übereinstimmung = 40 Punkte, ±1% = 20 Punkte
  - Datum: ±3 Tage = 15 Punkte, ±7 Tage = 10 Punkte, ±30 Tage = 5 Punkte
  - Lieferant: Name-Match im Verwendungszweck = 25 Punkte
  - Beschreibung: Keyword-Match = 10 Punkte
- [ ] Score ≥ 80 → Grün (auto-matched, shown as confirmed)
- [ ] Score 50–79 → Gelb (suggested match, requires user confirmation)
- [ ] Score < 50 or no match → Rot (unmatched, requires manual assignment)
- [ ] Each transaction shows: Ampelfarbe, matched Beleg (if any), Match-Grund, Score
- [ ] Matching re-runs automatically when new belege are uploaded or transactions imported
- [ ] Match-Quote metric: percentage of transactions with green status (target: ≥ 80%)

## Edge Cases
- One transaction matches multiple invoices → take highest score; if tied, flag as yellow for manual review
- One invoice matched to multiple transactions → warn user, flag as conflict (orange)
- Transaction amount differs slightly from invoice (e.g., Skonto, bank fees) → score-based, surfaces as yellow
- Matching runs on large dataset (500+ transactions, 500+ belege) → must complete in < 10s
- Beleg deleted after being matched → transaction reverts to rot status
- User manually confirms a yellow match → status set to green, locked
- User rejects a suggested match → transaction stays red, suggestion suppressed

## Technical Requirements
- Matching logic implemented as pure TypeScript function (source-agnostic, works on normalized transaction objects)
- Deterministic: same input always produces same output
- No external API calls during matching
- Runs server-side (Next.js API route or Supabase Edge Function)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
app/(app)/transaktionen/
└── TransaktionenPage
    ├── MatchingStatusBar               ← "87% gematcht – 12 offen"
    │   └── MatchingNeustartenButton    ← On-Demand Matching (manueller Button-Klick)
    │
    ├── TransaktionenTabelle
    │   └── TransaktionZeile (×n)
    │       ├── AmpelBadge              ← ● Grün / ● Gelb / ● Rot
    │       ├── BelegReferenz           ← Lieferant + RN wenn gematcht
    │       ├── MatchGrund              ← "RN_MATCH", "Score 85", etc.
    │       └── AktionenMenu            ← Bestätigen / Ablehnen / Manuell zuordnen
    │
    └── FilterBar (Erweiterung)
        └── StatusFilter                ← Alle / Grün / Gelb / Rot

API Routes:
  POST /api/matching/run               ← Matching auslösen (nach Import + on-demand)
  POST /api/matching/confirm           ← Match bestätigen
  POST /api/matching/reject            ← Match ablehnen
```

### Matching-Logik (Ablauf)

```
Trigger: automatisch nach CSV-Import ODER manuell per Button-Klick
        ↓
Lade alle ungematchten Transaktionen + offene Belege des Mandanten
        ↓
Für jede Transaktion:
  Stufe 1 – Hard Match (deterministisch, Score 100):
    RN_MATCH: Rechnungsnummer im Verwendungszweck?
    SEPA_MATCH: SEPA-Referenz stimmt überein?
    IBAN_GUARDED: IBAN + exakter Betrag?
    PAYPAL_ID_MATCH: PayPal-ID stimmt?
    → Treffer: Status = GRÜN, match_type gesetzt

  Stufe 2 – Score-Matching (wenn kein Hard Match):
    Betrag (0–40) + Datum (0–15) + Lieferant (0–25) + Beschreibung (0–10)
    ≥ 80 → GRÜN | 50–79 → GELB | < 50 → ROT
        ↓
Ergebnisse in transaktionen schreiben (match_status, match_score, beleg_id)
```

### Datenmodell-Erweiterung

```
Tabelle: transaktionen (zusätzlich zu PROJ-4)
  - beleg_id (UUID, FK → belege, nullable)
  - match_type (Text)         → RN_MATCH / SEPA_MATCH / IBAN_GUARDED / PAYPAL_ID_MATCH / SCORE / MANUAL
  - match_abgelehnte_beleg_ids (UUID[])  → abgelehnte Vorschläge nicht nochmal vorschlagen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Matching-Logik | Pure TypeScript-Funktion | Testbar, source-agnostisch, portierbar |
| Trigger | Nach Import + manueller Button-Klick | Flexibel für beide Workflows |
| Ausführungsort | Next.js API Route (MVP) | Ausreichend für 500×500 Vergleiche (< 5s); bei Bedarf → Edge Function |
| Ergebnis | In transaktionen Tabelle | Kein separates Match-Log nötig im MVP |

### Abhängigkeiten

Keine neuen Packages – reine TypeScript-Logik.

## Frontend Implementation Notes
- **MatchingStatusBar**: Shows match quote percentage, counts per status (green/yellow/red), progress bar, and "Matching neu starten" button
- **AmpelBadge**: Traffic-light badge component with tooltip showing score
- **MatchGrund**: Displays match type (RN_MATCH, SEPA_MATCH, Score X, Manual, etc.) with tooltip explanation
- **MatchingAktionenMenu**: Dropdown with confirm/reject/manual assign actions per transaction
- **TransaktionenTabelle**: Updated to show Beleg reference (supplier + invoice number), match reason, and action menu
- **TransaktionenPage**: Integrated MatchingStatusBar, updated filter to use traffic-light colored status options
- **TransaktionWithRelations** type added for joined API response data (belege + zahlungsquellen)
- All components use shadcn/ui primitives (Badge, Tooltip, DropdownMenu, Card, Progress, Table)
- Responsive: Beleg and Match-Grund columns hidden below lg breakpoint

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
