-- PROJ-3: Create staging tables for all existing mandanten
-- This ensures that mandanten created before the staging function was added also get their import tables.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, firmenname FROM mandanten
  LOOP
    PERFORM create_belege_import_table(r.id, r.firmenname);
  END LOOP;
END;
$$;
