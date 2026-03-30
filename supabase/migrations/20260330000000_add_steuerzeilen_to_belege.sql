-- Add steuerzeilen JSONB column to belege table
-- Stores individual tax lines: [{nettobetrag, mwst_satz, bruttobetrag}]
-- The existing bruttobetrag, nettobetrag, mwst_satz columns remain for totals/matching.

ALTER TABLE belege ADD COLUMN IF NOT EXISTS steuerzeilen JSONB;
