# PROJ-11: Kommentare & Workflow-Status

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-4 (Kontoauszug-Import) – Transaktionen müssen existieren
- Requires: PROJ-5 (Matching-Engine) – Transaktionsstatus muss sichtbar sein

## User Stories
- As a user, I want to add internal comments to a transaction so that I can document questions or notes for my accountant
- As a user, I want to flag a transaction as "Rückfrage" so that open questions are clearly visible
- As a user, I want to see all transactions with open questions in a filtered view so that I can work through them
- As a user, I want to mark a comment thread as resolved so that it disappears from the open questions view
- As a user, I want to see comment history per transaction so that I understand the context of past decisions

## Acceptance Criteria
- [x] Each transaction has a comments section (visible on expand or in detail panel)
- [x] User can add a text comment (max 500 characters) to any transaction
- [x] User can set a status flag on a transaction: Normal / Rückfrage / Erledigt
- [x] Transactions with status "Rückfrage" show a visual indicator (icon/badge) in the list
- [x] Filtered view "Offene Rückfragen" shows all transactions with status = Rückfrage
- [x] User can mark a Rückfrage as resolved (status → Erledigt or Normal)
- [x] Comment history shows: author, timestamp, text for each comment
- [x] Comments are not editable or deletable after submission (audit trail)
- [x] RLS: comments scoped to mandant_id

## Edge Cases
- Comment added to a transaction in a closed month → allowed (comments don't affect financial data)
- Very long comment → truncated at 500 characters with counter shown
- Multiple users add comments simultaneously → append only, no conflicts
- User deletes a transaction with comments → comments cascade-deleted (or soft-delete)

## Technical Requirements
- `transaktions_kommentare` table: id, transaktion_id, mandant_id, user_id, text, created_at
- Status flag stored on the `transaktionen` record: workflow_status ENUM (normal, rueckfrage, erledigt)
- No real-time updates required in MVP (page refresh or manual reload sufficient)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI-Erweiterungen (in bestehende Transaktionen-Seite integriert)

```
TransaktionZeile
└── WorkflowStatusBadge             ← 💬 Icon wenn status = rueckfrage

TransaktionDetailPanel (Side-Sheet)
├── TransaktionsInfo
├── WorkflowStatusSection
│   ├── StatusSelect                ← Normal / Rückfrage / Erledigt
│   └── StatusSpeichernButton
└── KommentareSection
    ├── KommentarListe
    │   └── KommentarEintrag (×n)
    │       ├── AutorName + Zeitstempel
    │       └── KommentarText       ← Read-only, kein Edit/Delete
    └── NeuerKommentarForm
        ├── TextArea (max 500 Zeichen)
        ├── ZeichenCounter          ← "234 / 500"
        └── KommentarSpeichernButton

FilterBar-Erweiterung:
└── "Offene Rückfragen"-Filter      ← workflow_status = rueckfrage

API:
  POST  /api/transaktionen/[id]/kommentare
  PATCH /api/transaktionen/[id]/workflow-status
```

### Datenmodell

```
Neue Tabelle: transaktions_kommentare
  - id (UUID)
  - transaktion_id (UUID, FK → transaktionen)
  - mandant_id (UUID, FK)             ← für RLS
  - user_id (UUID, FK → auth.users)
  - text (Text, max 500 Zeichen)
  - created_at (Timestamp)
  (unveränderlich – kein updated_at / deleted_at)

Bestehend: transaktionen.workflow_status (bereits in PROJ-4 definiert)
  → normal / rueckfrage / erledigt
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Anzeige | Side-Sheet | Kontext bleibt sichtbar |
| Kommentare unveränderlich | Kein Edit/Delete | Audit-Trail für Buchhalter |
| Echtzeit | Nein (MVP) | Supabase Realtime möglich, aber nicht nötig |

### Abhängigkeiten

Keine neuen Packages.

## Implementation Notes (2026-03-17)

### Database
- Migration: `supabase/migrations/20260317000000_create_transaktions_kommentare_table.sql`
- `transaktions_kommentare` table with RLS (SELECT + INSERT policies, no UPDATE/DELETE for audit trail)
- Indexes on `transaktion_id` and `mandant_id`
- ON DELETE CASCADE from both `transaktionen` and `mandanten`

### API Routes
- `GET /api/transaktionen/[id]/kommentare` -- list comments with user email, ordered ASC
- `POST /api/transaktionen/[id]/kommentare` -- add comment, Zod validated (max 500 chars)
- `PATCH /api/transaktionen/[id]/workflow-status` -- update workflow status, Zod validated enum

### Frontend Components
- `transaktion-detail-sheet.tsx` -- Side sheet with transaction details, matching info, workflow status, and comments
- `workflow-status-section.tsx` -- Select dropdown with optimistic update and rollback on error
- `kommentare-section.tsx` -- Comment list + new comment form with character counter
- Updated `transaktionen-tabelle.tsx` -- clickable rows, workflow status icons (amber MessageCircleQuestion / green CheckCircle2)
- Updated `transaktionen/page.tsx` -- detail sheet state, "Rueckfragen" tab with badge count, workflow status change handler

### Design Decisions
- Comments show `is_own` flag so the current user sees "(Du)" next to their comments
- Workflow status changes are optimistic with error rollback
- No month-lock check on comments (comments don't affect financial data, per spec)
- Auth.users email resolution: current user email from session, other users show "Benutzer" (server SDK limitation)

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
