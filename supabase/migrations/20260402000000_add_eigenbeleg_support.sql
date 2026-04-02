-- PROJ-17: Eigenbeleg-Erstellung
-- Adds eigenbeleg support to the belege table.

-- 1. Add 'eigenbeleg' to rechnungstyp enum
ALTER TYPE rechnungstyp_enum ADD VALUE IF NOT EXISTS 'eigenbeleg';

-- 2. Make storage_path and original_filename nullable (eigenbelege have no file)
ALTER TABLE belege ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE belege ALTER COLUMN original_filename DROP NOT NULL;

-- 3. Add eigenbeleg-specific columns
ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS eigenbeleg_laufnummer INTEGER,
  ADD COLUMN IF NOT EXISTS eigenbeleg_jahr INTEGER,
  ADD COLUMN IF NOT EXISTS kein_beleg_grund TEXT;

-- 4. Unique constraint: one laufnummer per mandant per year
CREATE UNIQUE INDEX IF NOT EXISTS belege_eigenbeleg_laufnummer_unique
  ON belege(mandant_id, eigenbeleg_jahr, eigenbeleg_laufnummer)
  WHERE eigenbeleg_laufnummer IS NOT NULL;

-- 5. Allow invited buchhalter users to read their mandant's profile
--    (previously only owner_id = auth.uid() was allowed)
CREATE POLICY "mandanten_select_via_get_mandant_id" ON mandanten
  FOR SELECT USING (id = get_mandant_id());
