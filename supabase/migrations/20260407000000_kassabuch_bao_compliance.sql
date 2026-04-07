-- BAO-Konformität Kassabuch (§131 BAO)
-- Adds: lfd_nr_kassa, kassa_buchungstyp, mwst_betrag, storno_zu_id, storno_grund
-- Converts soft-delete flow to Stornobuchung for audit compliance

-- 1. Add new columns to transaktionen
ALTER TABLE transaktionen
  ADD COLUMN IF NOT EXISTS lfd_nr_kassa INTEGER,
  ADD COLUMN IF NOT EXISTS kassa_buchungstyp TEXT,
  ADD COLUMN IF NOT EXISTS mwst_betrag DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS storno_zu_id UUID REFERENCES transaktionen(id),
  ADD COLUMN IF NOT EXISTS storno_grund TEXT;

-- 2. CHECK constraint for buchungstyp
ALTER TABLE transaktionen
  ADD CONSTRAINT kassa_buchungstyp_check
  CHECK (kassa_buchungstyp IS NULL OR kassa_buchungstyp IN (
    'EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME', 'STORNO'
  ));

-- 3. Function: auto-assign sequential lfd_nr_kassa per mandant
-- NOTE: Uses advisory lock to prevent race conditions under concurrent inserts
CREATE OR REPLACE FUNCTION assign_kassa_lfd_nr()
RETURNS TRIGGER AS $$
DECLARE
  is_kassa BOOLEAN;
  next_nr INTEGER;
BEGIN
  -- Only apply to kassa-type sources
  SELECT EXISTS (
    SELECT 1 FROM zahlungsquellen
    WHERE id = NEW.quelle_id AND typ = 'kassa'
  ) INTO is_kassa;

  IF is_kassa THEN
    -- Advisory lock per mandant to prevent concurrent gaps
    PERFORM pg_advisory_xact_lock(hashtext(NEW.mandant_id::text));

    SELECT COALESCE(MAX(lfd_nr_kassa), 0) + 1
    INTO next_nr
    FROM transaktionen
    WHERE mandant_id = NEW.mandant_id
      AND lfd_nr_kassa IS NOT NULL;

    NEW.lfd_nr_kassa := next_nr;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Trigger: fire before each kassa insert
DROP TRIGGER IF EXISTS trg_assign_kassa_lfd_nr ON transaktionen;
CREATE TRIGGER trg_assign_kassa_lfd_nr
  BEFORE INSERT ON transaktionen
  FOR EACH ROW
  EXECUTE FUNCTION assign_kassa_lfd_nr();

-- 5. Index for lfd_nr lookups (integrity checks, exports)
CREATE INDEX IF NOT EXISTS idx_transaktionen_lfd_nr_kassa
  ON transaktionen (mandant_id, lfd_nr_kassa)
  WHERE lfd_nr_kassa IS NOT NULL;
