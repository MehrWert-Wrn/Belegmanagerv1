# PROJ-17: Eigenbeleg-Erstellung

**Status:** In Review  
**Erstellt:** 2026-04-02  
**Deployed:** 2026-04-02

---

## Übersicht

Für jede Transaktion soll ein Eigenbeleg erstellt werden können, der automatisch in der Belegverwaltung abgelegt wird. Ein Eigenbeleg dient als interner Nachweis, wenn kein regulärer Fremdbeleg vorhanden ist.

## User Stories

- Als Buchhalterin möchte ich für eine Transaktion ohne reguläre Rechnung einen Eigenbeleg erstellen, damit die Transaktion trotzdem ordnungsgemäß belegt ist.
- Als Buchhalterin möchte ich, dass der Eigenbeleg automatisch mit einer laufenden Nummer (pro Jahr) versehen wird.
- Als Buchhalterin möchte ich die Firmenangaben (Name, Adresse) aus dem Mandantenprofil vorausgefüllt sehen.

## Anforderungen

### Pflichtfelder im Eigenbeleg
- **Bezeichnung:** `Eigenbeleg_[laufende Nummer]` (auto-generiert)
- **Name und Adresse des Unternehmens** (aus Mandantenprofil vorausgefüllt)
- **Datum der Ausgabe / des Vorgangs** (aus Transaktion vorausgefüllt)
- **Beschreibung der Ausgabe** (Freitext, Pflichtfeld)
- **Betrag brutto** (aus Transaktion vorausgefüllt)
- **MwSt-Satz** (Auswahl: 0%, 5%, 10%, 13%, 20%) → Nettobetrag wird automatisch berechnet
- **Grund, warum kein regulärer Beleg vorhanden ist** (Freitext, Pflichtfeld)
- **Laufende Nummer** (auto-generiert, Format: `NNN/JJJJ`)

### Verhalten
- Button „Eigenbeleg erstellen" erscheint im Transaktion-Detail-Sheet für Transaktionen mit `match_status = 'offen'`
- Nach Erstellung: Transaktion wird automatisch als `match_status = 'bestaetigt'` markiert (match_type = 'EIGENBELEG')
- Eigenbeleg erscheint in der Belegverwaltung mit `rechnungstyp = 'eigenbeleg'`
- Laufende Nummer ist pro Mandant und Jahr eindeutig (z.B. `001/2026`, `002/2026`)

## Technisches Design

### DB-Änderungen
- `rechnungstyp_enum`: neuer Wert `'eigenbeleg'`
- `belege.storage_path`: nullable (Eigenbelege haben keine Datei)
- `belege.original_filename`: nullable
- `belege.eigenbeleg_laufnummer`: INTEGER (nullable)
- `belege.eigenbeleg_jahr`: INTEGER (nullable)
- `belege.kein_beleg_grund`: TEXT (nullable)
- Unique Index auf `(mandant_id, eigenbeleg_jahr, eigenbeleg_laufnummer)` WHERE NOT NULL

### Neue API-Routen
- `GET /api/mandant` – Gibt Mandant-Profil zurück (firmenname, strasse, plz, ort)
- `POST /api/transaktionen/[id]/eigenbeleg` – Erstellt Eigenbeleg für Transaktion

### Neue UI-Komponenten
- `eigenbeleg-dialog.tsx` – Dialog-Formular zur Eigenbeleg-Erstellung

### Geänderte UI-Komponenten
- `transaktion-detail-sheet.tsx` – Button „Eigenbeleg erstellen" für offene Transaktionen

## Acceptance Criteria

- [x] Eigenbeleg kann für offene Transaktionen erstellt werden
- [x] Laufende Nummer wird automatisch pro Mandant und Jahr vergeben
- [x] Firmenname und Adresse aus Mandantenprofil sind vorausgefüllt
- [x] Datum und Bruttobetrag aus Transaktion sind vorausgefüllt
- [x] Nettobetrag wird aus Brutto und MwSt-Satz berechnet
- [x] Nach Erstellung ist Transaktion als `bestaetigt` markiert
- [x] Eigenbeleg erscheint in der Belegverwaltung
- [x] Monatsabschluss wird respektiert (kein Eigenbeleg für gesperrte Monate)

---

## QA Report (2026-04-02)

### Summary

PROJ-17 Eigenbeleg-Erstellung has been reviewed by static code analysis of all relevant source files: API routes, UI components, types, DB migration, and integration points. The build passes without TypeScript errors. The core happy path is correctly implemented. However, several security gaps, a missing migration file, a race condition, and a few edge case issues were found.

### Acceptance Criteria Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Eigenbeleg kann fuer offene Transaktionen erstellt werden | PASS | UI button shows only for `match_status === 'offen' && betrag < 0`. API creates beleg and links to transaction. |
| 2 | Laufende Nummer automatisch pro Mandant und Jahr | PASS | Queries max `eigenbeleg_laufnummer` for mandant+year, increments. Format `NNN/JJJJ`. |
| 3 | Firmenname und Adresse vorausgefuellt | PASS | `GET /api/mandant` fetches mandant profile. Dialog displays firmenname, strasse, plz, ort, uid_nummer. |
| 4 | Datum und Bruttobetrag vorausgefuellt | PASS | Pre-filled from `transaktion.datum` and `Math.abs(transaktion.betrag)`. Read-only inputs. |
| 5 | Nettobetrag berechnet | PASS | Calculated identically on client and server: `brutto / (1 + mwst_satz / 100)`, rounded to 2 decimals. |
| 6 | Transaktion als bestaetigt markiert | PASS | API sets `match_status: 'bestaetigt'`, `match_type: 'EIGENBELEG'`, `match_score: 100`. |
| 7 | Eigenbeleg erscheint in Belegverwaltung | PASS | Inserted as `rechnungstyp: 'eigenbeleg'`. Beleg-tabelle has teal badge for eigenbeleg type. |
| 8 | Monatsabschluss respektiert | PASS | API calls `isMonatGesperrt()` and returns 403 if month is locked. |

### Bugs Found

#### BUG-001: Missing DB Migration File (High)

**Severity:** High
**Priority:** P1
**Description:** The feature spec lists DB changes (new enum value `eigenbeleg`, new columns `eigenbeleg_laufnummer`, `eigenbeleg_jahr`, `kein_beleg_grund`, unique index, nullable `storage_path`/`original_filename`). However, no SQL migration file was created in `supabase/migrations/`. The commit `eb4f172` contains zero `.sql` files. These changes were presumably applied directly to the Supabase dashboard.
**Impact:** The DB schema is not reproducible from the migration files. A fresh deployment or new environment will fail because the columns, enum value, and unique index do not exist.
**Steps to reproduce:** Run `ls supabase/migrations/ | grep eigenbeleg` -- returns nothing.
**Expected:** A migration file like `20260402000000_add_eigenbeleg_columns.sql` should exist with all DDL changes.

#### BUG-002: No Server-Side Check for match_status Before Creating Eigenbeleg (High)

**Severity:** High
**Priority:** P1
**Description:** The API route `POST /api/transaktionen/[id]/eigenbeleg` does NOT verify that `transaktion.match_status === 'offen'` before proceeding. While the UI only shows the button for `match_status === 'offen'`, a direct API call (e.g. via curl) can create an Eigenbeleg for a transaction that is already `bestaetigt` or `vorgeschlagen`, overwriting its existing match.
**Impact:** A user or attacker with auth could overwrite an existing confirmed match by calling the API directly. The old beleg gets its `zuordnungsstatus` reset to `offen` (line 97-100), but there is no guard preventing this.
**Steps to reproduce:**
1. Have a transaction with `match_status = 'bestaetigt'` and an existing `beleg_id`.
2. Call `POST /api/transaktionen/{id}/eigenbeleg` with valid body.
3. The existing match is overwritten with an Eigenbeleg.
**Expected:** API should return 400/409 if `match_status !== 'offen'`.

#### BUG-003: Laufnummer Race Condition (Medium)

**Severity:** Medium
**Priority:** P2
**Description:** The laufnummer generation (lines 47-58 of the eigenbeleg route) is a classic read-then-write race condition. Two concurrent POST requests could both read the same max laufnummer and try to insert the same value. The unique index `(mandant_id, eigenbeleg_jahr, eigenbeleg_laufnummer)` would cause one to fail with a 500 error, but the error message would be a raw Supabase constraint violation, not a user-friendly message.
**Impact:** In a multi-user environment (admin + buchhalter), simultaneous eigenbeleg creation for the same mandant+year could result in a confusing error. Data integrity is preserved by the unique index (if it was applied to the DB), but the UX is poor.
**Steps to reproduce:** Send two concurrent POST requests for eigenbelege in the same mandant+year.
**Expected:** Either use a DB sequence/serial, a `SELECT ... FOR UPDATE` lock, or catch the unique constraint violation and retry with the next number.

#### BUG-004: GET /api/mandant Fails for Invited Users (buchhalter) (Medium)

**Severity:** Medium
**Priority:** P2
**Description:** The `mandanten` table RLS policy is `owner_id = auth.uid()` for SELECT. When an invited buchhalter (who is not the owner) calls `GET /api/mandant`, the Supabase query returns 0 rows because RLS blocks access. The `.single()` call then fails, and the API returns 404.
**Impact:** Invited buchhalter users cannot create Eigenbelege because the dialog cannot load firm data. The dialog will show "..." for the firm name indefinitely.
**Steps to reproduce:**
1. Log in as an invited buchhalter user.
2. Open a transaction detail sheet, click "Eigenbeleg erstellen".
3. The dialog shows "..." for Firmenname and no address.
**Note:** The `get_mandant_id()` function was fixed for invited users, but the `mandanten` table SELECT policy itself was not updated. Other tables use `mandant_id = get_mandant_id()` which works, but `mandanten` uses `owner_id = auth.uid()`.

#### BUG-005: TypeScript Types Incomplete for transaktionen Table (Low)

**Severity:** Low
**Priority:** P3
**Description:** The `transaktionen` Row, Insert, and Update types in `types.ts` do not include `beleg_id`, `match_type`, `match_bestaetigt_am`, or `match_bestaetigt_von` columns. These columns clearly exist in the database (used in multiple API routes including the eigenbeleg route). The `TransaktionWithRelations` type adds `beleg_id` and `match_type` as extra fields, but they should be in the base Row type. The Update type also lacks these fields.
**Impact:** No runtime errors (Supabase client accepts arbitrary column names), but TypeScript cannot provide type safety for these fields. The build passes because Supabase's generic type system is permissive.
**Steps to reproduce:** Compare `transaktionen.Update` type (lines 326-337 of types.ts) with the columns set in `eigenbeleg/route.ts` line 106-112.

#### BUG-006: No Server-Side Check for Expense-Only Transactions (Low)

**Severity:** Low
**Priority:** P3
**Description:** The UI correctly restricts the "Eigenbeleg erstellen" button to expense transactions (`betrag < 0`), but the API does not validate this. A direct API call could create an Eigenbeleg for an income transaction (`betrag > 0`). The Zod schema validates `bruttobetrag: z.number().positive()`, but the client sends `Math.abs(transaktion.betrag)` which would be positive for both income and expense.
**Impact:** An income transaction could incorrectly get an Eigenbeleg via direct API call. This would be a data integrity issue since Eigenbelege are meant for expenses only.

#### BUG-007: Dialog Does Not Reset mandant State on Reopen (Low)

**Severity:** Low
**Priority:** P4
**Description:** In `eigenbeleg-dialog.tsx`, the `handleClose` function resets `beschreibung`, `mwstSatz`, and `keinBelegGrund`, but the `mandant` state is never reset. If the fetch fails on first open (network error), subsequent opens will retain the null mandant state without retrying. The `useEffect` re-fetches on `open` change, so this partially mitigates the issue, but the stale mandant data from a previous open could briefly flash.
**Impact:** Minor UX issue. If mandant data changes between dialog opens, the old data may briefly show.

#### BUG-008: No request.json() Error Handling (Low)

**Severity:** Low
**Priority:** P4
**Description:** The API route calls `await request.json()` (line 24) before Zod validation. If the request body is not valid JSON (e.g., empty body, malformed JSON), this will throw an unhandled exception, resulting in a generic 500 error instead of a proper 400 response.
**Steps to reproduce:** Send a POST request with `Content-Type: application/json` but a non-JSON body.
**Expected:** Should return 400 with a clear error message.

### Security Audit

| Check | Result | Notes |
|-------|--------|-------|
| Authentication | PASS | Both routes check `supabase.auth.getUser()` and return 401 if unauthenticated. |
| Zod Input Validation | PASS | All user inputs validated with Zod schema (beschreibung, mwst_satz, kein_beleg_grund, datum, bruttobetrag). |
| RLS (Row Level Security) | PASS | Supabase client uses RLS. Belege and transaktionen tables have RLS enabled with `mandant_id = get_mandant_id()`. Cross-tenant data access is prevented. |
| Month Lock | PASS | `isMonatGesperrt()` check prevents eigenbeleg creation for locked months. |
| Authorization (match_status) | FAIL | No server-side check that `match_status === 'offen'`. See BUG-002. |
| Authorization (expense-only) | FAIL | No server-side check that `betrag < 0`. See BUG-006. |
| IDOR (Insecure Direct Object Reference) | PASS | Transaction ID from URL is validated via RLS -- user can only access their own mandant's transactions. |
| SQL Injection | PASS | All queries use Supabase parameterized queries. |
| XSS | PASS | React auto-escapes output. No `dangerouslySetInnerHTML` usage. |
| Rate Limiting | NOTE | No rate limiting on the eigenbeleg creation endpoint. An authenticated user could spam-create eigenbelege. Low risk but worth noting. |
| Invited User Access | FAIL | Buchhalter users cannot load mandant profile due to mandanten table RLS policy. See BUG-004. |

### Recommendations

1. **P1 -- Create migration file** for all eigenbeleg-related DDL changes and commit it.
2. **P1 -- Add server-side match_status check** in the eigenbeleg API route: reject if `match_status !== 'offen'`.
3. **P2 -- Fix laufnummer race condition** by using a Postgres sequence, advisory lock, or catching unique constraint violations with retry logic.
4. **P2 -- Fix mandanten RLS policy** to allow invited users (buchhalter) to SELECT their mandant. Either update the policy to `owner_id = auth.uid() OR id = get_mandant_id()` or add a separate policy.
5. **P3 -- Regenerate types.ts** from the current DB schema to include all columns (beleg_id, match_type, match_bestaetigt_am, match_bestaetigt_von).
6. **P3 -- Add server-side expense check** (betrag < 0) in the eigenbeleg API route.
7. **P4 -- Wrap request.json() in try/catch** to return 400 on malformed JSON.
