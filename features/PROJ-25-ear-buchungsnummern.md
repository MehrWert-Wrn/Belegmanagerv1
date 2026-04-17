# PROJ-25: EAR-Buchungstyp & Buchungsnummern-System

## Status: Deployed
**Created:** 2026-04-17
**Last Updated:** 2026-04-17

### Backend Implementation Notes (2026-04-17)
- 4 SQL migrations created for: buchfuehrungsart, kuerzel, buchungsnummer/storage_path_original, workflow_status privat
- New helper library: `src/lib/ear-buchungsnummern.ts` with kuerzel generation, buchungsnummer building, filename sanitization, two-phase abschluss/aufhebung
- Updated 6 API routes: mandant GET, onboarding POST, zahlungsquellen POST/PATCH, workflow-status PATCH, monatsabschluss GET/schliessen/oeffnen
- Updated monatsabschluss-types.ts with EarPreview and Buchfuehrungsart types
- Frontend UI extensions still pending

## Dependencies
- Requires: PROJ-3 (Belegverwaltung) – storage_path_original auf belege
- Requires: PROJ-8 (Monatsabschluss-Workflow) – Erweiterung Abschluss + Aufhebung
- Requires: PROJ-10 (Zahlungsquellen-Verwaltung) – kuerzel auf zahlungsquellen

## Scope
Gilt ausschließlich für EAR-Mandanten (Ein-/Ausgabenrechner). Für DOPPELT-Mandanten (Doppelte Buchhaltung) ändert sich nichts am bestehenden Verhalten.

---

## User Stories

### Buchführungstyp
- Als neuer Mandant möchte ich beim Onboarding meine Buchführungsart angeben (EAR oder Doppelte Buchhaltung), damit die App korrekt konfiguriert wird.
- Als EAR-Mandant möchte ich, dass die App meine Buchungsnummern automatisch verwaltet, damit ich keine manuelle Nummerierung pflegen muss.

### Zahlungsquelle-Kürzel
- Als EAR-Mandant möchte ich, dass jede Zahlungsquelle automatisch ein Kürzel bekommt (B1, K1, …), damit Buchungsnummern eindeutig einer Quelle zugeordnet werden können.
- Als Mandant möchte ich das Kürzel einer Zahlungsquelle nachträglich ändern können, damit ich es an meine interne Nomenklatur anpassen kann.

### Privat-Status
- Als EAR-Mandant möchte ich einzelne Transaktionen als "privat" markieren können, damit diese aus meiner EAR ausgeschlossen werden und keine Buchungsnummer erhalten.
- Als EAR-Mandant möchte ich, dass eine auf "privat" gesetzte Transaktion automatisch von einem bestehenden Beleg-Match getrennt wird, damit kein Buchungsbeleg fälschlicherweise einer privaten Transaktion zugeordnet bleibt.

### Buchungsnummern-Vergabe (Monatsabschluss)
- Als EAR-Mandant möchte ich, dass beim Monatsabschluss alle bestätigten Transaktionen des Monats automatisch nummeriert werden, damit mein EAR lückenlos und revisionssicher ist.
- Als EAR-Mandant möchte ich, dass die zugeordneten Belegdateien beim Monatsabschluss automatisch nach dem Schema {buchungsnummer}_{original_filename} umbenannt werden, damit Belege in der Ablage eindeutig einer Buchungszeile zugeordnet sind.
- Als EAR-Mandant möchte ich den Monatsabschluss aufheben können und dabei alle Buchungsnummern und Dateibenennungen rückgängig machen, damit ich Korrekturen vornehmen kann.

---

## Acceptance Criteria

### 1. buchfuehrungsart auf Mandanten
- [ ] Neue DB-Spalte `mandanten.buchfuehrungsart` TEXT, CHECK IN ('DOPPELT', 'EAR'), DEFAULT 'DOPPELT', NOT NULL
- [ ] Onboarding speichert buchfuehrungsart korrekt in die DB (war bisher wirkungslos)
- [ ] TypeScript-Typen aktualisiert
- [ ] Bestehende Mandanten ohne Wert erhalten DEFAULT 'DOPPELT'

### 2. Zahlungsquelle-Kürzel
- [ ] Neue DB-Spalte `zahlungsquellen.kuerzel` VARCHAR(10)
- [ ] Beim Erstellen einer neuen Zahlungsquelle wird kuerzel automatisch vergeben:
  - kontoauszug → B1, B2, B3 (pro Mandant, nach Anzahl bestehender kontoauszug-Quellen)
  - kassa → K1, K2, …
  - kreditkarte → CC1, CC2, …
  - paypal → PP1, PP2, …
  - sonstige → S1, S2, …
- [ ] Kürzel wird in der Zahlungsquellen-Liste angezeigt
- [ ] Kürzel ist in den Zahlungsquellen-Einstellungen editierbar
- [ ] Bestehende Zahlungsquellen erhalten rückwirkend ein Kürzel (Migration: nach Typ + erstellt_am ASC sortiert nummerieren)

### 3. workflow_status 'privat'
- [ ] `workflow_status` Enum um 'privat' erweitert
- [ ] In der Transaktionen-Tabelle erscheint "Privat markieren" nur für EAR-Mandanten
- [ ] Wenn Transaktion auf 'privat' gesetzt wird UND match_status = 'bestaetigt':
  - [ ] beleg_id = NULL
  - [ ] match_status = 'offen'
  - [ ] match_score = 0, match_type = NULL, match_bestaetigt_am = NULL, match_bestaetigt_von = NULL
  - [ ] belege.zuordnungsstatus = 'offen'
- [ ] Wenn Transaktion auf 'privat' gesetzt wird UND match_status = 'vorgeschlagen': Match ebenfalls aufheben (gleiche Felder)
- [ ] Privat-Transaktionen erhalten beim Monatsabschluss keine Buchungsnummer
- [ ] Privat-Transaktionen erscheinen im Monatsabschluss-Report unter "Ausgeschlossen (privat)"

### 4. Neue DB-Felder
- [ ] `transaktionen.buchungsnummer` VARCHAR(50), nullable
- [ ] `belege.storage_path_original` TEXT, nullable

### 5. Buchungsnummern-Vergabe beim Monatsabschluss (EAR-only)
- [ ] Buchungsnummern werden NUR beim Monatsabschluss vergeben, nicht bei Match-Confirm
- [ ] Nur für EAR-Mandanten; DOPPELT-Mandanten: kein Unterschied zum bisherigen Ablauf
- [ ] Erfasste Transaktionen: match_status IN ('bestaetigt', 'kein_beleg') UND workflow_status ≠ 'privat'
- [ ] Sortierung: datum ASC, bei Gleichstand erstellt_am ASC
- [ ] Nummernformat: `{Präfix}_{lfd_nr:04d}_{kuerzel}_{MM}_{YYYY}`
  - Präfix aus belege.rechnungstyp: E / A / G / EB / S (bei null oder kein_beleg → S)
  - lfd_nr: pro quelle_id + Monat + Jahr, beginnt bei 0001
  - Beispiel: `E_0001_B1_01_2026`
- [ ] Datei-Umbenennung (nur wenn belege.storage_path != null):
  - Neuer Dateiname: `{buchungsnummer}_{original_filename}`
  - Storage: copy(old_path, new_path) → remove(old_path)
  - belege.storage_path_original = old_path
  - belege.storage_path = new_path
- [ ] Atomarität: Alle Storage-Renames zuerst; DB-Commit nur wenn alle Renames erfolgreich
- [ ] Bei Storage-Fehler: bereits umbenannte Dateien zurückbenennen, Monatsabschluss schlägt fehl mit Fehlermeldung (kein partial state)
- [ ] kein_beleg-Transaktionen: Buchungsnummer wird vergeben, kein File-Rename (keine Datei vorhanden)

### 6. Monatsabschluss aufheben (EAR-Erweiterung)
- [ ] Beim Aufheben eines EAR-Monatsabschlusses:
  - [ ] transaktionen.buchungsnummer → NULL für alle Transaktionen des Monats
  - [ ] Für Belege mit storage_path_original != NULL: storage.copy(current_path → original_path), storage.remove(current_path)
  - [ ] belege.storage_path → storage_path_original
  - [ ] belege.storage_path_original → NULL
- [ ] Atomarität analog zum Abschluss (Storage zuerst, dann DB)
- [ ] Nach Aufhebung sind alle Transaktionen wieder ohne Buchungsnummer und Belege haben Originalnamen

### 7. Monatsabschluss-Vorschau (EAR-Erweiterung)
- [ ] Im Monatsabschluss-Dialog für EAR-Mandanten wird angezeigt:
  - Anzahl Transaktionen, die nummeriert werden (bestaetigt + kein_beleg, nicht privat)
  - Anzahl privat-Transaktionen (ausgeschlossen, keine Nummer)
  - Anzahl offene Transaktionen (Warnung: nicht abschlussreif)
- [ ] Warnung wenn eine Zahlungsquelle des Monats kein kuerzel hat (Sicherheitsnetz)

---

## Edge Cases

- **Mandant wechselt Buchführungsart:** buchfuehrungsart ist nach Onboarding read-only – kein Wechsel möglich. Keine Rückwirkung auf abgeschlossene Monate.
- **Zahlungsquelle wird deaktiviert nach Kürzel-Vergabe:** Kürzel bleibt erhalten; bestehende Buchungsnummern bleiben gültig.
- **Kürzel manuell geändert nach Abschluss:** Hat keine Auswirkung auf bereits vergebene Buchungsnummern (die Nummer ist ein gespeicherter String).
- **Beleg ohne Datei (storage_path = null):** Buchungsnummer wird vergeben, kein File-Rename. Kein Fehler.
- **Zwei Transaktionen am selben Datum:** Sortierung nach erstellt_am ASC als Tiebreaker → deterministisch.
- **Storage-Fehler bei einzelner Datei während Monatsabschluss:** Gesamter Abschluss wird abgebrochen, bereits umbenannte Dateien werden zurückgesetzt. Benutzer erhält Fehlermeldung mit Hinweis auf betroffene Datei.
- **Monatsabschluss aufheben wenn Datei in Storage fehlt:** Fehler-tolerant – DB-Revert trotzdem durchführen, Storage-Fehler loggen (Datei war evtl. manuell gelöscht).
- **Privat setzen bei bereits abgeschlossenem Monat:** Durch Monat-Lock blockiert (bestehende Logik greift).
- **Privat-Transaktion hat vorgeschlagenen Match:** Match wird ebenfalls aufgehoben (nicht nur bestätigte).
- **EAR-Mandant, Zahlungsquelle ohne Kürzel beim Abschluss:** Warnung im Dialog; Abschluss wird trotzdem erlaubt (Sicherheitsnetz-Warnung, kein Block, da Auto-Generierung diesen Fall verhindern sollte).
- **original_filename enthält Sonderzeichen im Storage-Pfad:** Dateiname wird für Storage-Pfad sanitized (Leerzeichen, Umlaute, Sonderzeichen → URL-safe).
- **Bestehende EAR-Mandanten zum Launch-Zeitpunkt:** Bereits abgeschlossene Monate werden nicht rückwirkend nummeriert. Zukünftige Abschlüsse starten bei 0001.

---

## Technical Requirements
- Storage-Operationen: Supabase Storage SDK (`copy` + `remove`)
- Atomarität: Storage-Phase zuerst, DB-Phase erst nach vollständigem Storage-Erfolg
- Performance: Monatsabschluss mit Buchungsnummern < 10s für bis zu 500 Transaktionen
- Filename-Sanitization: Pfad-sichere Darstellung des original_filename für Storage-Pfad
- RLS: buchfuehrungsart ist mandanten-scoped (bestehende RLS greift)
- Kein Breaking Change für DOPPELT-Mandanten

---

## Tech Design (Solution Architect)

### Überblick
4 Ebenen: Datenbankstruktur → Serverlogik → neue Hilfsbibliothek → UI-Erweiterungen. Keine neuen Seiten oder Hauptkomponenten – alles sind Erweiterungen bestehender Teile.

### A) Datenbankstruktur (4 Migrationen)
- **Migration 1:** `mandanten.buchfuehrungsart` TEXT ('DOPPELT'|'EAR'), DEFAULT 'DOPPELT' – bestehende Mandanten erhalten DOPPELT
- **Migration 2:** `zahlungsquellen.kuerzel` VARCHAR(10) + Backfill bestehender Quellen (pro Mandant nach Typ + erstellt_am sortiert nummerieren)
- **Migration 3:** `transaktionen.buchungsnummer` VARCHAR(50) nullable + `belege.storage_path_original` TEXT nullable
- **Migration 4:** `workflow_status` Enum um 'privat' erweitern

### B) Neue Hilfsbibliothek: `src/lib/ear-buchungsnummern.ts`
Zentraler Ort für die gesamte EAR-Logik. Enthält:
- **Kürzel generieren:** Typ + Anzahl bestehender Quellen → "B1", "K1", "CC2"
- **Buchungsnummer bauen:** rechnungstyp + lfd_nr + kuerzel + monat + jahr → "E_0001_B1_01_2026"
- **Dateiname sanitieren:** original_filename → storage-pfad-sicherer Dateiname
- **Zwei-Phasen-Abschluss (Kern):** Phase 1 = alle Storage-Renames mit Rollback-Tracking; Phase 2 = DB-Commit nur wenn Phase 1 vollständig erfolgreich
- **Zwei-Phasen-Aufhebung (Revert):** Phase 1 = Storage-Revert (fehler-tolerant, fehlende Dateien loggen); Phase 2 = DB-Revert

### C) API-Erweiterungen (6 bestehende Routes)
- `POST /api/zahlungsquellen` – kuerzel vor INSERT auto-berechnen
- `PATCH /api/zahlungsquellen/[id]` – kuerzel als patchbares Feld zulassen
- `PATCH /api/transaktionen/[id]/workflow-status` – 'privat' akzeptieren + bei vorhandenem Match auto-unlink
- `POST /api/monatsabschluss/[jahr]/[monat]/schliessen` – EAR-Gate + Zwei-Phasen-Abschluss aufrufen
- `POST /api/monatsabschluss/[jahr]/[monat]/oeffnen` – EAR-Gate + Zwei-Phasen-Aufhebung aufrufen
- `GET /api/monatsabschluss/[jahr]/[monat]` – wenn EAR: ear_zu_nummerieren, ear_privat, ear_quellen_ohne_kuerzel zurückgeben

### D) UI-Erweiterungen (5 bestehende Komponenten, keine neuen Seiten)
- `quelle-karte.tsx` + `quelle-dialog.tsx` – Kürzel als Badge anzeigen + editierbar machen
- `workflow-status-section.tsx` + `transaktionen-tabelle.tsx` – Privat-Option + Privat-Badge (nur EAR)
- `vollstaendigkeits-pruefung.tsx` – EAR-Block: Anzahl zu nummerieren, Anzahl privat, Warnung ohne Kürzel
- `abschluss-dialog.tsx` – EAR-Hinweis auf Buchungsnummern + Dateiumbenennung
- `wiedereroeffnen-dialog.tsx` – EAR-Warnung: Buchungsnummern + Dateinamen werden zurückgesetzt

### E) EAR-Gate
`/api/mandant` liefert `buchfuehrungsart` im Response. Alle Komponenten lesen `mandant.buchfuehrungsart === 'EAR'` aus dem bestehenden Mandanten-Kontext.

### F) Breaking-Change-Schutz
DOPPELT-Mandanten: Monatsabschluss, Transaktionen und Belege unverändert. Kürzel wird bei Zahlungsquellen angezeigt, aber ohne buchhalterische Funktion.

## QA Test Results

**Tested:** 2026-04-17
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Scope:** Backend + Frontend code review, build verification, security audit. Status: In Progress (frontend UI extensions noted as pending in implementation notes).

### Acceptance Criteria Status

#### AC-1: buchfuehrungsart auf Mandanten
- [x] Neue DB-Spalte `mandanten.buchfuehrungsart` TEXT, CHECK IN ('DOPPELT', 'EAR'), DEFAULT 'DOPPELT', NOT NULL -- Migration 20260417000000 verified
- [x] Onboarding speichert buchfuehrungsart korrekt in die DB -- `POST /api/onboarding` passes `buchfuehrungsart` to upsert, defaults to 'DOPPELT' if empty
- [x] TypeScript-Typen aktualisiert -- `Buchfuehrungsart` type in `monatsabschluss-types.ts`, `WorkflowStatus` includes 'privat' in `types.ts`
- [x] Bestehende Mandanten ohne Wert erhalten DEFAULT 'DOPPELT' -- DEFAULT clause in migration handles this

#### AC-2: Zahlungsquelle-Kuerzel
- [x] Neue DB-Spalte `zahlungsquellen.kuerzel` VARCHAR(10) -- Migration 20260417000001
- [x] Beim Erstellen einer neuen Zahlungsquelle wird kuerzel automatisch vergeben -- `generateKuerzel()` called in `POST /api/zahlungsquellen`
- [x] Kuerzel-Prefixe korrekt: B, K, CC, PP, S -- verified in `TYP_KUERZEL_PREFIX` mapping
- [x] Kuerzel wird in der Zahlungsquellen-Liste angezeigt -- Badge in `quelle-karte.tsx` line 107-111
- [x] Kuerzel ist in den Zahlungsquellen-Einstellungen editierbar -- Input field in `quelle-dialog.tsx` (edit mode only), PATCH route accepts `kuerzel`
- [x] Bestehende Zahlungsquellen erhalten rueckwirkend ein Kuerzel -- Backfill DO-block in migration, sorted by mandant_id + typ + erstellt_am ASC

#### AC-3: workflow_status 'privat'
- [x] workflow_status Enum um 'privat' erweitert -- Migration 20260417000003, CHECK constraint updated
- [x] "Privat markieren" erscheint nur fuer EAR-Mandanten -- `isEar` prop in `WorkflowStatusSection`, `privat` option conditionally rendered
- [x] Wenn Transaktion auf 'privat' gesetzt wird UND match_status = 'bestaetigt': beleg_id = NULL, match_status = 'offen', match_score = 0, match_type = NULL, match_bestaetigt_am = NULL, match_bestaetigt_von = NULL -- All fields cleared in workflow-status route lines 84-89
- [x] belege.zuordnungsstatus = 'offen' wird gesetzt -- Line 95-97 in workflow-status route
- [x] Vorgeschlagener Match wird ebenfalls aufgehoben -- OR condition on line 80: `match_status === 'bestaetigt' || match_status === 'vorgeschlagen'`
- [x] Privat-Transaktionen erhalten beim Monatsabschluss keine Buchungsnummer -- Filtered out by `.or('workflow_status.is.null,workflow_status.neq.privat')` in earMonatsabschluss
- [x] Privat-Transaktionen erscheinen im Monatsabschluss-Report unter "Ausgeschlossen (privat)" -- `ear_privat` count in getEarPreviewData, displayed in vollstaendigkeits-pruefung.tsx

#### AC-4: Neue DB-Felder
- [x] `transaktionen.buchungsnummer` VARCHAR(50), nullable -- Migration 20260417000002
- [x] `belege.storage_path_original` TEXT, nullable -- Migration 20260417000002
- [x] Index on buchungsnummer -- `idx_transaktionen_buchungsnummer` WHERE NOT NULL

#### AC-5: Buchungsnummern-Vergabe beim Monatsabschluss (EAR-only)
- [x] Buchungsnummern werden NUR beim Monatsabschluss vergeben -- earMonatsabschluss called from schliessen route
- [x] Nur fuer EAR-Mandanten -- `isEar` gate in schliessen route
- [x] Erfasste Transaktionen: match_status IN ('bestaetigt', 'kein_beleg') UND workflow_status != 'privat' -- Verified in query
- [x] Sortierung: datum ASC, bei Gleichstand erstellt_am ASC -- Two `.order()` calls
- [x] Nummernformat: `{Praefix}_{lfd_nr:04d}_{kuerzel}_{MM}_{YYYY}` -- buildBuchungsnummer verified
- [x] Prefix-Mapping E/A/G/EB/S korrekt -- null/kein_beleg/sonstiges default to 'S'
- [x] lfd_nr pro quelle_id + Monat + Jahr, beginnt bei 0001 -- Counter per quelle_id via `lfdCounters` Map
- [x] Datei-Umbenennung: copy + remove pattern -- Storage Phase 1 in earMonatsabschluss
- [x] belege.storage_path_original gespeichert -- Phase 2 DB update
- [x] belege.storage_path aktualisiert -- Phase 2 DB update
- [ ] BUG: Atomaritaet bei DB-Fehler nach Storage-Erfolg nicht gewaehrleistet (siehe BUG-PROJ25-003)
- [x] kein_beleg-Transaktionen: Buchungsnummer vergeben, kein File-Rename -- beleg check `if (beleg && beleg.storage_path)`

#### AC-6: Monatsabschluss aufheben (EAR-Erweiterung)
- [x] transaktionen.buchungsnummer -> NULL -- Bulk update in earMonatsaufhebung Phase 2
- [x] Storage-Revert: copy(current -> original), remove(current) -- Phase 1 in earMonatsaufhebung
- [x] belege.storage_path -> storage_path_original, storage_path_original -> NULL -- DB update loop
- [x] Fehler-tolerant bei fehlenden Dateien -- try/catch with storageFehler array, continues on error

#### AC-7: Monatsabschluss-Vorschau (EAR-Erweiterung)
- [x] Anzahl Transaktionen die nummeriert werden -- `ear_zu_nummerieren` in getEarPreviewData
- [x] Anzahl privat-Transaktionen -- `ear_privat` count
- [x] Anzahl offene Transaktionen (Warnung) -- `anzahl_offen` in pruefung response
- [x] Warnung wenn Zahlungsquelle ohne kuerzel -- `ear_quellen_ohne_kuerzel` array, displayed in vollstaendigkeits-pruefung.tsx

### Edge Cases Status

#### EC-1: Mandant wechselt Buchfuehrungsart
- [x] buchfuehrungsart ist nach Onboarding read-only -- No PATCH endpoint for mandant buchfuehrungsart, onboarding is upsert on owner_id

#### EC-2: Zahlungsquelle deaktiviert nach Kuerzel-Vergabe
- [x] Kuerzel bleibt erhalten -- No logic removes kuerzel on deactivation

#### EC-3: Kuerzel manuell geaendert nach Abschluss
- [x] Keine Auswirkung auf bestehende Buchungsnummern -- buchungsnummer is stored as string, not recomputed

#### EC-4: Beleg ohne Datei
- [x] Buchungsnummer wird vergeben, kein File-Rename -- Guard `if (beleg && beleg.storage_path)` in earMonatsabschluss

#### EC-5: Zwei Transaktionen am selben Datum
- [x] Sortierung nach erstellt_am ASC als Tiebreaker -- `.order('erstellt_am', { ascending: true })` secondary sort

#### EC-6: Storage-Fehler bei einzelner Datei
- [x] Gesamter Abschluss abgebrochen -- rollbackStorageOps called, error returned

#### EC-7: Monatsabschluss aufheben wenn Datei fehlt
- [x] Fehler-tolerant, DB-Revert trotzdem durchfuehren -- try/catch in Phase 1, storageFehler logged

#### EC-8: Privat setzen bei abgeschlossenem Monat
- [ ] NOT TESTABLE via code review alone -- depends on Monat-Lock logic in existing PROJ-8 implementation. No explicit check in workflow-status route.

#### EC-9: original_filename Sonderzeichen
- [x] sanitizeFilename handles umlauts, spaces, special chars -- Verified function implementation

### Security Audit Results

- [x] Authentication: All API routes check user session before processing
- [x] Authorization (RLS): transaktionen, zahlungsquellen, mandanten all have RLS enabled
- [x] Input validation: Zod schemas on all POST/PATCH routes; workflow_status restricted to enum values
- [x] Rate limiting: POST /api/zahlungsquellen has rate limit (5/min)
- [ ] BUG: Kuerzel field allows path-traversal characters (see BUG-PROJ25-001)
- [ ] BUG: No uniqueness constraint on kuerzel per mandant (see BUG-PROJ25-002)
- [x] EAR-Gate: Privat status server-side restricted to EAR mandants only
- [x] Service role key not exposed to frontend

### Cross-Browser / Responsive Testing
- Not applicable for this round: Build succeeds (`npm run build` passed), but manual browser testing cannot be performed in code-review mode. Frontend UI extensions are confirmed present and structurally correct.

### Bugs Found

#### BUG-PROJ25-001: Kuerzel field allows unsafe characters for file paths (Path Traversal Risk)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Edit a Zahlungsquelle via PATCH /api/zahlungsquellen/[id]
  2. Set kuerzel to `../../x` or `<script>` or `/etc`
  3. Trigger a Monatsabschluss for an EAR mandant
  4. Expected: Kuerzel should only contain alphanumeric characters and basic symbols
  5. Actual: Kuerzel is validated only for length (1-10 chars), not for character safety. The kuerzel is embedded in `buchungsnummer` which is used unsanitized in storage file paths (`newFilename = buchungsnummer + "_" + sanitizedOriginal`). While Supabase Storage likely mitigates actual path traversal, this is a defense-in-depth gap.
- **Fix:** Add regex validation to kuerzel Zod schema, e.g. `.regex(/^[a-zA-Z0-9_-]+$/)`, and apply `sanitizeFilename()` or equivalent to the buchungsnummer portion of the new filename.
- **Priority:** Fix before deployment

#### BUG-PROJ25-002: No uniqueness constraint on kuerzel per mandant
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Create two Zahlungsquellen of the same type for one mandant
  2. Edit the second one's kuerzel to match the first (e.g. both "B1")
  3. Expected: Uniqueness enforced -- should reject duplicate kuerzel per mandant
  4. Actual: No DB UNIQUE constraint on (mandant_id, kuerzel). The auto-generation logic avoids duplicates on creation, but manual edits can introduce duplicates. Duplicate kuerzel would cause confusing buchungsnummern.
- **Fix:** Add `UNIQUE(mandant_id, kuerzel)` constraint via migration. Add server-side uniqueness check in PATCH route.
- **Priority:** Fix before deployment

#### BUG-PROJ25-003: Atomicity gap -- DB failure after Storage success leaves inconsistent state
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Trigger earMonatsabschluss for a month with many transactions + belege
  2. If Phase 1 (Storage) succeeds but Phase 2 (DB update) fails
  3. Expected: Per spec, "DB-Commit nur wenn alle Renames erfolgreich" implies full atomicity
  4. Actual: Code explicitly does NOT rollback storage on DB error (comment: "the storage state is now authoritative"). Files are renamed in storage but buchungsnummern are not saved in DB. The system ends up in an inconsistent state.
- **Fix:** Either rollback storage on DB failure (true atomicity per spec), or use a DB transaction (wrap all updates in a single RPC call). At minimum, document this as a known limitation.
- **Priority:** Fix before deployment

#### BUG-PROJ25-004: generateKuerzel race condition on concurrent requests
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send two simultaneous POST requests to create Zahlungsquellen of the same type
  2. Both calls will count existing sources, get the same count, and generate the same kuerzel
  3. Expected: Unique kuerzel per type per mandant
  4. Actual: Both could end up as "B1" due to race condition (count then insert, not atomic)
- **Fix:** Use a DB-level sequence or `INSERT ... RETURNING` pattern that ensures uniqueness. Or add UNIQUE constraint (BUG-PROJ25-002) which would cause one to fail and can be retried.
- **Priority:** Nice to have (rare edge case, low impact)

#### BUG-PROJ25-005: Privat-Transaktion in abgeschlossenem Monat not blocked server-side
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Complete a Monatsabschluss for a month
  2. Call PATCH /api/transaktionen/[id]/workflow-status with `{"workflow_status": "privat"}` for a transaction in that closed month
  3. Expected: Rejected by Monat-Lock (per edge case spec: "Durch Monat-Lock blockiert")
  4. Actual: The workflow-status route does NOT check if the month is locked. It only checks that the mandant is EAR. The existing Monat-Lock must be enforced elsewhere, but there is no evidence of such a check in this route.
- **Fix:** Add a check in the workflow-status PATCH route: if the transaction's month is abgeschlossen, reject the status change with an appropriate error.
- **Priority:** Fix before deployment

#### BUG-PROJ25-006: Onboarding buchfuehrungsart treated as nullable despite being required
- **Severity:** Low
- **Steps to Reproduce:**
  1. In the onboarding API, the schema has `buchfuehrungsart: z.enum(['DOPPELT', 'EAR']).nullable().optional()`
  2. The insert uses `d.buchfuehrungsart || 'DOPPELT'`
  3. Expected: If user selects EAR in UI, value should be stored
  4. Actual: Works correctly due to the `|| 'DOPPELT'` fallback, BUT the nullable/optional schema means a client could send `null` which silently defaults to 'DOPPELT'. The UI requires the field (step1Schema enforces min(1)), so this is a defense-in-depth gap only.
- **Fix:** Change API schema to `.default('DOPPELT')` instead of `.nullable().optional()`.
- **Priority:** Nice to have

#### BUG-PROJ25-007: lfd_nr counter does NOT separate by rechnungstyp prefix
- **Severity:** Low
- **Steps to Reproduce:**
  1. Have an EAR mandant with a mix of eingangsrechnungen and ausgangsrechnungen on the same quelle in the same month
  2. Close the month
  3. Expected: Each prefix type could have independent numbering (E_0001, A_0001)
  4. Actual: Counter is per quelle_id only, so you get E_0001, A_0002, E_0003, etc. The spec says "lfd_nr: pro quelle_id + Monat + Jahr, beginnt bei 0001" -- this is ambiguous but the implementation uses a single counter per quelle. This is technically correct per the spec wording but may not match user expectations.
- **Fix:** Clarify with product owner whether lfd_nr should reset per prefix or not. Current behavior is acceptable per spec.
- **Priority:** Nice to have (clarification needed)

### Summary
- **Acceptance Criteria:** 26/27 sub-criteria passed (1 atomicity gap)
- **Edge Cases:** 8/9 verified (1 not testable via code review alone)
- **Bugs Found:** 7 total (0 critical, 3 medium, 0 high, 4 low)
  - Medium: BUG-PROJ25-001 (kuerzel path safety), BUG-PROJ25-002 (kuerzel uniqueness), BUG-PROJ25-003 (atomicity gap), BUG-PROJ25-005 (Monat-Lock bypass for privat)
  - Low: BUG-PROJ25-004 (kuerzel race condition), BUG-PROJ25-006 (onboarding schema gap), BUG-PROJ25-007 (lfd_nr counter ambiguity)
- **Security:** 3 issues found (kuerzel path traversal, uniqueness gap, month-lock bypass)
- **Build:** PASSES (`npm run build` successful)
- **Production Ready:** NO -- 4 medium bugs should be fixed first (BUG-PROJ25-001, 002, 003, 005)

---

## QA Test Results -- Round 2

**Tested:** 2026-04-17
**Tester:** QA Engineer (AI)
**Scope:** Follow-up review to verify whether Round 1 bugs were fixed, plus additional code review findings.

### Round 1 Bug Status (All STILL OPEN)

None of the 7 bugs from Round 1 have been fixed. No PROJ-25-related commits exist in git history. All changes remain in the working tree (unstaged).

| Bug ID | Severity | Status | Notes |
|--------|----------|--------|-------|
| BUG-PROJ25-001 | Medium | OPEN | kuerzel Zod schema still `.min(1).max(10)` only, no regex filter |
| BUG-PROJ25-002 | Medium | OPEN | No UNIQUE(mandant_id, kuerzel) constraint in any migration |
| BUG-PROJ25-003 | Medium | OPEN | earMonatsabschluss still has "storage state is now authoritative" comment, no DB rollback |
| BUG-PROJ25-004 | Low | OPEN | generateKuerzel still uses count-then-insert pattern |
| BUG-PROJ25-005 | Medium | OPEN | workflow-status PATCH route has NO month-lock check |
| BUG-PROJ25-006 | Low | OPEN | Onboarding schema still `.nullable().optional()` |
| BUG-PROJ25-007 | Low | OPEN | lfd_nr counter per quelle_id only, not per prefix |

### New Findings (Round 2)

#### BUG-PROJ25-008: Buchungsnummer not displayed anywhere in the UI
- **Severity:** Medium
- **Description:** The `buchungsnummer` field is assigned to transaktionen during Monatsabschluss but is never displayed in any UI component. Neither the transaktionen table (`transaktionen-tabelle.tsx`) nor the detail sheet (`transaktion-detail-sheet.tsx`) nor the kassabuch page shows the buchungsnummer. Users have no way to see which buchungsnummer was assigned to a transaction.
- **Expected:** After Monatsabschluss, users should be able to see the assigned buchungsnummer on each transaction.
- **Priority:** Fix before deployment (core user-visible feature)

#### BUG-PROJ25-009: Kassabuch page does not support 'privat' workflow status for EAR mandants
- **Severity:** Low
- **Description:** The kassabuch page (`src/app/(app)/kassabuch/page.tsx`) hardcodes `workflow_status: 'normal'` for all entries and does not use the `TransaktionDetailSheet` component. EAR mandants cannot mark kassabuch transactions as 'privat'. This may be by design (cash transactions are typically business-only), but the spec does not explicitly exclude kassabuch transactions from the privat feature.
- **Expected:** If kassabuch transactions should also support privat marking for EAR mandants, the kassabuch page needs the EAR-Gate and privat option.
- **Priority:** Clarify with product owner

#### BUG-PROJ25-010: Kuerzel field cannot be cleared once set via UI
- **Severity:** Low
- **Description:** In `quelle-dialog.tsx` line 169: `if (data.kuerzel) { body.kuerzel = data.kuerzel }` -- if a user clears the kuerzel input field to an empty string, the kuerzel is not sent in the PATCH body, so the old value remains. The kuerzel cannot be removed once set.
- **Expected:** If users are allowed to edit kuerzel, they should also be able to clear it (or this should be documented as intentional).
- **Priority:** Nice to have (clearing kuerzel is unusual)

### Round 2 Summary

- **Round 1 Bugs:** 7 bugs, ALL still OPEN (0 fixed)
- **New Bugs Found:** 3 (1 medium, 2 low)
- **Total Open Bugs:** 10 (0 critical, 0 high, 5 medium, 5 low)
  - Medium: BUG-PROJ25-001 (path traversal), BUG-PROJ25-002 (uniqueness), BUG-PROJ25-003 (atomicity), BUG-PROJ25-005 (month-lock bypass), BUG-PROJ25-008 (buchungsnummer not displayed)
  - Low: BUG-PROJ25-004 (race condition), BUG-PROJ25-006 (schema gap), BUG-PROJ25-007 (lfd_nr ambiguity), BUG-PROJ25-009 (kassabuch privat), BUG-PROJ25-010 (kuerzel clearing)
- **Build:** PASSES (`npm run build` successful)
- **Production Ready:** NO -- 5 medium bugs must be fixed first

### Recommended Fix Priority

1. BUG-PROJ25-001 -- Add regex validation to kuerzel (security)
2. BUG-PROJ25-002 -- Add UNIQUE constraint on (mandant_id, kuerzel) (data integrity)
3. BUG-PROJ25-005 -- Add month-lock check in workflow-status route (data integrity)
4. BUG-PROJ25-008 -- Display buchungsnummer in transaktionen UI (core UX)
5. BUG-PROJ25-003 -- Add storage rollback on DB failure (atomicity)

## Deployment
_To be added by /deploy_
