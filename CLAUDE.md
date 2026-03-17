# Belegmanager

> Mandantenfähige Web-Applikation zur Buchhaltungsvorbereitung für österreichische KMUs. Automatisches Matching von Zahlungsausgängen mit Eingangsrechnungsbelegen – mit Ampel-Status, Monatsabschluss-Workflow und DATEV-Export.

## Tech Stack

- **Framework:** Next.js 14 (App Router), TypeScript
- **Styling:** Tailwind CSS + shadcn/ui (copy-paste components)
- **Backend:** Supabase (PostgreSQL + RLS + Auth + Storage) – **Kerninfrastruktur, nicht optional**
- **Deployment:** Vercel (Frontend) + Supabase Cloud EU Frankfurt
- **Validation:** Zod + react-hook-form
- **State:** React useState / Context API
- **Export:** DATEV-kompatibles CSV

## Projekt-Kontext

- **Mandant:** Mehr.Wert Gruppe GmbH
- **Zielmarkt:** Österreichische KMUs, DSGVO-konform, Supabase EU-Region Pflicht
- **Multi-Tenancy:** KRITISCH – jede Tabelle hat `mandant_id`, RLS auf allen Tabellen, kein Datenleck zwischen Mandanten
- **Auth:** Supabase Auth (E-Mail + Passwort), E-Mail-Verifizierung Pflicht vor erstem Login

## Project Structure

```
src/
  app/              Pages (Next.js App Router)
  components/
    ui/             shadcn/ui components (NEVER recreate these)
  hooks/            Custom React hooks
  lib/              Utilities (supabase.ts, utils.ts, matching.ts)
features/           Feature specifications (PROJ-X-name.md)
  INDEX.md          Feature status overview
docs/
  PRD.md            Product Requirements Document
  production/       Production guides (Sentry, security, performance)
```

## Development Workflow

1. `/requirements` - Create feature spec from idea
2. `/architecture` - Design tech architecture (PM-friendly, no code)
3. `/frontend` - Build UI components (shadcn/ui first!)
4. `/backend` - Build APIs, database, RLS policies
5. `/qa` - Test against acceptance criteria + security audit
6. `/deploy` - Deploy to Vercel + production-ready checks

## Feature Tracking

All features tracked in `features/INDEX.md`. Every skill reads it at start and updates it when done. Feature specs live in `features/PROJ-X-name.md`.

## Key Conventions

- **Feature IDs:** PROJ-1, PROJ-2, etc. (sequential)
- **Commits:** `feat(PROJ-X): description`, `fix(PROJ-X): description`
- **Single Responsibility:** One feature per spec file
- **shadcn/ui first:** NEVER create custom versions of installed shadcn components
- **Human-in-the-loop:** All workflows have user approval checkpoints
- **RLS immer:** Jede neue Supabase-Tabelle bekommt sofort RLS + `mandant_id` – keine Ausnahmen
- **Service Role Key:** Nur in sicheren Server-Kontexten (API Routes), nie im Frontend

## Matching-Logik (Kernfunktion)

Die Matching-Logik ist quellen-agnostisch und arbeitet auf normalisierten Transaktions-Objekten:
- **Stufe 1 – Hard Match** (Score 100, deterministisch): RN_MATCH, SEPA_MATCH, IBAN_GUARDED, PAYPAL_ID_MATCH
- **Stufe 2 – Score-Matching** (0–100 Punkte): Betrag, Datum, Lieferant, Beschreibung
- Details → `features/PROJ-X-matching.md`

## Build & Test Commands

```bash
npm run dev        # Development server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run start      # Production server
```

## Product Context

@docs/PRD.md

## Feature Overview

@features/INDEX.md
