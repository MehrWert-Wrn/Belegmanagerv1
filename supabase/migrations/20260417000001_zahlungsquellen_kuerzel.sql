-- PROJ-25 Migration 2: Add kuerzel to zahlungsquellen + backfill

ALTER TABLE zahlungsquellen
  ADD COLUMN IF NOT EXISTS kuerzel VARCHAR(10);

COMMENT ON COLUMN zahlungsquellen.kuerzel IS 'Kurzbezeichnung fuer Buchungsnummern (z.B. B1, K1, CC2)';

-- Backfill existing zahlungsquellen with auto-generated kuerzel
-- Sorted by typ + erstellt_am ASC per mandant
DO $$
DECLARE
  r RECORD;
  prefix TEXT;
  counter INT;
  last_mandant UUID := NULL;
  last_typ TEXT := NULL;
BEGIN
  FOR r IN
    SELECT id, mandant_id, typ
    FROM zahlungsquellen
    WHERE kuerzel IS NULL
    ORDER BY mandant_id, typ, erstellt_am ASC
  LOOP
    -- Reset counter when mandant or typ changes
    IF r.mandant_id IS DISTINCT FROM last_mandant OR r.typ IS DISTINCT FROM last_typ THEN
      counter := 0;
      last_mandant := r.mandant_id;
      last_typ := r.typ;
    END IF;

    counter := counter + 1;

    -- Determine prefix based on typ
    CASE r.typ
      WHEN 'kontoauszug' THEN prefix := 'B';
      WHEN 'kassa' THEN prefix := 'K';
      WHEN 'kreditkarte' THEN prefix := 'CC';
      WHEN 'paypal' THEN prefix := 'PP';
      ELSE prefix := 'S';
    END CASE;

    UPDATE zahlungsquellen SET kuerzel = prefix || counter WHERE id = r.id;
  END LOOP;
END $$;
