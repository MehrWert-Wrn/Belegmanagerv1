# PROJ-13: Reisekostenabrechnung

## Status: Planned
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-1 (Authentifizierung)
- Requires: PROJ-2 (Mandant-Onboarding)
- Requires: PROJ-3 (Belegverwaltung) – Belege für Reisekosten wiederverwendbar

## User Stories
- As a user, I want to record business trips with date, destination, purpose, and distance so that I can claim mileage reimbursement
- As a user, I want to attach receipts (meals, accommodation, other expenses) to a trip so that all costs are captured
- As a user, I want mileage to be calculated automatically based on km and the Austrian mileage rate so that I don't have to calculate manually
- As a user, I want to generate a travel expense report (Reisekostenabrechnung) as PDF so that I can submit it for reimbursement or accounting
- As a user, I want to see an overview of all trips per month so that I have a complete picture of my travel costs

## Acceptance Criteria
- [ ] User can create a trip: Datum, Reiseziel, Zweck (Freitext), Transportmittel (PKW / ÖV / Flug / Sonstige)
- [ ] For PKW trips: Kilometer-Eingabe, automatic calculation with Austrian rate (€ 0.42/km as of 2026)
- [ ] User can add expense items to a trip: Kategorie (Verpflegung, Unterkunft, Sonstiges), Betrag, Beleg (optional, from PROJ-3)
- [ ] Per-diem (Tagegeld) automatically calculated based on trip duration (Austrian rates: Inland > 3h, > 5h, > 12h)
- [ ] Trip summary shows: Kilometerkosten, Tagegeld, Sonstige Ausgaben, Gesamtbetrag
- [ ] PDF export of individual trip report (Reisekostenabrechnung-Formular)
- [ ] Monthly overview: list of all trips with totals
- [ ] RLS: trips scoped to mandant_id

## Edge Cases
- Multi-day trip → spans multiple dates, duration calculated correctly for per-diem
- Trip with zero km (public transport) → mileage section hidden/disabled
- Mileage rate changes (legal update) → rate configurable per mandant (default = current Austrian rate)
- User attaches a beleg already used in Kontoauszug-Matching → allowed (cross-reference)
- Trip deleted after PDF generated → PDF no longer regenerable from deleted data

## Technical Requirements
- Austrian per-diem rates (Inlandsreise): > 3h = €8.80, > 5h = €17.60, > 12h = €26.40 (as of 2026, verify before implementation)
- Austrian mileage rate: €0.42/km for PKW (verify before implementation)
- PDF generation: server-side (react-pdf or similar)
- `reisen` table: id, mandant_id, user_id, datum_von, datum_bis, reiseziel, zweck, km, transportmittel, created_at
- `reisen_ausgaben` table: id, reise_id, kategorie, betrag, beleg_id (nullable)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
