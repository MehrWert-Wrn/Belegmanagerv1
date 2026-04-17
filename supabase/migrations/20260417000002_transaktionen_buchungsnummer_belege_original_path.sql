-- PROJ-25 Migration 3: Add buchungsnummer to transaktionen + storage_path_original to belege

ALTER TABLE transaktionen
  ADD COLUMN IF NOT EXISTS buchungsnummer VARCHAR(50);

COMMENT ON COLUMN transaktionen.buchungsnummer IS 'EAR-Buchungsnummer, vergeben beim Monatsabschluss (z.B. E_0001_B1_01_2026)';

CREATE INDEX IF NOT EXISTS idx_transaktionen_buchungsnummer ON transaktionen(buchungsnummer)
  WHERE buchungsnummer IS NOT NULL;

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS storage_path_original TEXT;

COMMENT ON COLUMN belege.storage_path_original IS 'Originaler Storage-Pfad vor Umbenennung beim EAR-Monatsabschluss';
