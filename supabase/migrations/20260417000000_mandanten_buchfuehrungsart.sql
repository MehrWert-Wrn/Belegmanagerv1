-- PROJ-25 Migration 1: Add buchfuehrungsart to mandanten
-- Existing mandanten default to 'DOPPELT'

ALTER TABLE mandanten
  ADD COLUMN IF NOT EXISTS buchfuehrungsart TEXT NOT NULL DEFAULT 'DOPPELT'
  CHECK (buchfuehrungsart IN ('DOPPELT', 'EAR'));

COMMENT ON COLUMN mandanten.buchfuehrungsart IS 'Buchfuehrungsart: DOPPELT (doppelte Buchhaltung) oder EAR (Einnahmen-Ausgaben-Rechnung)';
