# PROJ-2: Mandant-Onboarding

## Status: In Progress
**Created:** 2026-03-13
**Last Updated:** 2026-03-13

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – User muss eingeloggt und verifiziert sein

## User Stories
- As a new user, I want to create my company (Mandant) during onboarding so that my data is correctly assigned
- As a new user, I want to be guided through setup with a wizard so that I don't miss important configuration steps
- As a user, I want to enter my company's master data (name, address, UID-Nummer) so that it appears correctly on exports
- As a user, I want to see a setup completion indicator so that I know my account is ready to use

## Acceptance Criteria
- [ ] After first login (verified), user is automatically redirected to onboarding wizard
- [ ] Wizard requires: Firmenname, Rechtsform, Adresse, UID-Nummer (optional), Geschäftsjahr-Start
- [ ] Mandant record is created in DB with `mandant_id` tied to the authenticated user
- [ ] All subsequent data is scoped to this `mandant_id` (RLS enforced)
- [ ] Onboarding wizard shows progress (step X of Y)
- [ ] After completing onboarding, user lands on the main dashboard
- [ ] Users who have already completed onboarding skip the wizard on subsequent logins
- [ ] User can later edit company master data in settings

## Edge Cases
- User closes browser mid-wizard → progress is saved, wizard resumes where left off on next login
- User submits invalid UID-Nummer format → validation error, no external API call in MVP
- User skips optional fields → allowed, can be filled later
- Multiple browser tabs open during onboarding → only one mandant created (idempotent)

## Technical Requirements
- Multi-Tenancy: `mandant_id` (UUID) generated at mandant creation, stored on all future records
- RLS: Row-Level Security policies must be applied to the `mandanten` table immediately
- Supabase Auth: `auth.uid()` linked to `mandanten.owner_id`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/
├── (auth)/
│   └── onboarding/                    ← /onboarding (geschützt, kein Nav)
│       ├── OnboardingWizard           ← Hauptcontainer, verwaltet aktuellen Schritt
│       │   ├── StepIndicator          ← "Schritt 2 von 3" + Fortschrittsbalken
│       │   ├── Step 1: Firmendaten
│       │   │   ├── FirmennameFeld     ← Pflichtfeld
│       │   │   ├── RechtsformSelect   ← GmbH, GmbH & Co KG, EinzelU, etc.
│       │   │   └── UIDNummerFeld      ← Optional, Format AT + 8 Ziffern
│       │   ├── Step 2: Adresse
│       │   │   ├── StrasseFeld
│       │   │   ├── PLZFeld
│       │   │   ├── OrtFeld
│       │   │   └── LandSelect         ← Default: Österreich
│       │   └── Step 3: Geschäftsjahr
│       │       ├── GeschaeftsjahrbeginnSelect  ← Monat (1–12)
│       │       └── ConfirmSummary     ← Zusammenfassung aller Eingaben vor Abschluss
│       └── SkipGuard                  ← Redirect wenn Mandant bereits existiert
│
├── (app)/
│   └── settings/
│       └── firma/                     ← /settings/firma
│           └── FirmaSettingsForm      ← Dieselben Felder wie Wizard, einzeln editierbar
│
└── middleware.ts                      ← Prüft: Eingeloggt? Onboarding abgeschlossen?
```

### Datenmodell

```
Tabelle: mandanten
  - id (UUID, Primärschlüssel)         → wird mandant_id auf allen anderen Tabellen
  - owner_id (UUID)                    → verknüpft mit auth.uid()
  - firmenname (Text, Pflicht)
  - rechtsform (Text)                  → GmbH / GmbH & Co KG / Einzelunternehmen / etc.
  - uid_nummer (Text, optional)        → Format: ATU12345678
  - strasse (Text)
  - plz (Text)
  - ort (Text)
  - land (Text, Default: AT)
  - geschaeftsjahr_beginn (Integer)    → Monat 1–12
  - onboarding_abgeschlossen (Boolean) → false solange Wizard läuft
  - erstellt_am (Timestamp)

RLS: Nur owner_id = auth.uid() darf lesen/schreiben
```

### Middleware-Erweiterung (aufbauend auf PROJ-1)

```
Request kommt herein
        ↓
  1. Eingeloggt? → Nein → /login
  2. Mandant existiert & onboarding_abgeschlossen?
        ↓ Nein → /onboarding
        ↓ Ja   → Anfrage durchlassen
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Wizard-State | URL-Params (?step=2) | Browser-Back funktioniert, Tab-Crash-sicher |
| Fortschrittsspeicherung | DB (onboarding_abgeschlossen) | Überlebt Browser-Schließen |
| Idempotenz | UPSERT auf mandanten | Kein doppelter Mandant bei Tab-Duplikation |

### Abhängigkeiten

Keine neuen Packages – shadcn/ui (Form, Select, Input, Progress) und Supabase.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
