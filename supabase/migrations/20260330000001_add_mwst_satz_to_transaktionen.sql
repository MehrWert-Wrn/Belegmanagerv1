-- Add MwSt-Satz column to transaktionen for Kassabuch entries
ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS mwst_satz NUMERIC;
