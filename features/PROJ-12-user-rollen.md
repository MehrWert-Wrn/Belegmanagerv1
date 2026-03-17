# PROJ-12: Multi-Tenant User-Rollen

## Status: In Review
**Created:** 2026-03-13
**Last Updated:** 2026-03-17

## Dependencies
- Requires: PROJ-1 (Authentifizierung) – Auth-System muss vorhanden sein
- Requires: PROJ-2 (Mandant-Onboarding) – Mandant muss existieren

## User Stories
- As a mandant admin, I want to invite a bookkeeper via email so that they can access my data
- As a mandant admin, I want to assign roles (Admin / Buchhalter) so that access is appropriately restricted
- As a mandant admin, I want to revoke a user's access so that former employees can no longer log in
- As a bookkeeper (Buchhalter), I want to access the mandant's data so that I can perform my tasks
- As a bookkeeper, I want to be limited to read + assign rights (no delete, no admin settings) so that data integrity is protected

## Acceptance Criteria
- [ ] Mandant has at least one user with role "Admin" (the creator/owner)
- [ ] Admin can invite users by email → invite email sent with signup link
- [ ] Invite link creates a new Supabase Auth user linked to the mandant
- [ ] Two roles available: Admin (full access) and Buchhalter (limited access)
- [ ] Buchhalter permissions: view all data, create/edit matches, add comments, export
- [ ] Buchhalter restrictions: cannot delete transactions or belege, cannot close/reopen months, cannot manage users, cannot access settings
- [ ] Admin can change a user's role
- [ ] Admin can deactivate a user (cannot log in, data preserved)
- [ ] User list shows: name, email, role, status (active/inactive), last login
- [ ] A mandant must always have at least one Admin (cannot remove last admin)
- [ ] RLS: enforced based on mandant membership, not just role

## Edge Cases
- Invite to already-registered email → link to existing account, assign to mandant
- Invited user never accepts → invite expires after 7 days, can be resent
- Admin tries to remove their own admin role → blocked if they are the last admin
- Admin deactivates themselves → blocked (must transfer admin role first)
- User belongs to multiple mandants (future case) → not supported in MVP

## Technical Requirements
- `mandant_users` table: mandant_id, user_id, role ENUM (admin, buchhalter), aktiv, invited_at, accepted_at
- RLS policies: all tables filter by mandant_id where user has an active mandant_users record
- Role-based UI hiding + API-level enforcement

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Seitenstruktur (Component Tree)

```
app/(app)/settings/benutzer/        ← Nur für Admins sichtbar
├── BenutzerHeader + EinladenButton
├── BenutzerTabelle
│   └── BenutzerZeile (×n)
│       ├── Name + E-Mail + RolleBadge + StatusBadge + LetzterLogin
│       └── AktionenMenu
│           ├── RolleÄndernOption
│           ├── DeaktivierenOption
│           └── EinladungNeusendenOption (bei ausstehenden)
└── EinladungsDialog
    ├── EmailFeld
    ├── RolleSelect (Default: Buchhalter)
    └── EinladenButton

Sidebar: "Benutzer"-Link nur für Admins sichtbar

API:
  GET    /api/benutzer
  POST   /api/benutzer/einladen
  PATCH  /api/benutzer/[id]/rolle
  PATCH  /api/benutzer/[id]/status
  POST   /api/benutzer/[id]/einladung-erneut
```

### Datenmodell

```
Neue Tabelle: mandant_users
  - id (UUID)
  - mandant_id (UUID, FK → mandanten)
  - user_id (UUID, FK → auth.users, nullable bei ausstehender Einladung)
  - email (Text)
  - rolle (Enum)                        → admin / buchhalter
  - aktiv (Boolean)
  - eingeladen_am / einladung_angenommen_am (Timestamps)
  - einladung_token (UUID, nullable)    → für Einladungs-Link
  - einladung_gueltig_bis (Timestamp)   → 7 Tage
  UNIQUE(mandant_id, user_id)

RLS-Erweiterung (alle Tabellen):
  Bisherig: owner_id = auth.uid()
  Neu:      EXISTS (mandant_users WHERE mandant_id = table.mandant_id
                    AND user_id = auth.uid() AND aktiv = true)
```

### Rollen-Matrix

```
Aktion                          Admin   Buchhalter
─────────────────────────────────────────────────
Belege / Transaktionen ansehen    ✓         ✓
Matches + Kommentare              ✓         ✓
DATEV-Export                      ✓         ✓
Löschen (Belege / TX)             ✓         ✗
Monatsabschluss öffnen/schließen  ✓         ✗
Einstellungen + Benutzerverwaltung ✓        ✗
```

### Technische Entscheidungen

| Entscheidung | Gewählt | Warum |
|---|---|---|
| Rollen-Enforcement | API (403) + RLS | Nie nur UI-seitig |
| Einladungs-Flow | Token-Link (7 Tage) | Sicherer als offener Signup-Link |
| Letzter Admin | API blockiert Selbst-Degradierung | Kein Mandant ohne Admin |
| RLS-Erweiterung | mandant_users statt owner_id | Skaliert auf Multi-User |

### Abhängigkeiten

Keine neuen Packages.

## Implementation Notes (2026-03-17)

### Database
- Migration `20260317144508_create_mandant_users_table.sql`: Creates `mandant_users` table with RLS, seeds existing owners as admins, adds auto-seed trigger for new mandants, indexes on mandant_id/user_id/einladung_token
- Migration `20260317144509_add_get_user_rolle_function.sql`: `get_user_rolle()` SQL function returns current user's role in their mandant
- **Note:** Migrations need to be applied manually via `supabase db push` (CLI not authenticated during build)

### Backend (API Routes)
- `GET /api/benutzer` - Lists all mandant_users with last_sign_in_at from auth.users (admin-only)
- `POST /api/benutzer/einladen` - Invite user by email with role, MVP limit of 10 active users, sends Supabase invite email
- `PATCH /api/benutzer/[id]/rolle` - Change role with last-admin protection
- `PATCH /api/benutzer/[id]/status` - Activate/deactivate with last-admin protection
- `POST /api/benutzer/[id]/einladung-erneut` - Resend invite with token reset and 7-day extension
- All routes use shared `requireAuth()`, `requireAdmin()`, `getMandantId()` helpers from `src/lib/auth-helpers.ts`
- Admin client (`src/lib/supabase/admin.ts`) uses `SUPABASE_SERVICE_ROLE_KEY` for auth.admin operations

### Frontend
- Settings layout updated with "Benutzer" tab
- `src/app/(app)/settings/benutzer/page.tsx` - Admin-only page with auto-redirect for non-admins
- `src/components/benutzer/benutzer-tabelle.tsx` - Table with role/status badges, action dropdown (role change, deactivate, resend invite)
- `src/components/benutzer/einladungs-dialog.tsx` - Email + role form with success state
- `src/components/benutzer/rolle-aendern-dialog.tsx` - Role change with select

### Types
- Added `mandant_users` table definition to `Database` type
- Added `get_user_rolle` to Functions
- Added `MandantUser`, `MandantUserInsert`, `UserRolle`, `BenutzerListItem` convenience types

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
