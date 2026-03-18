-- BUG-PROJ5-002: Add lieferant_iban column to belege for IBAN_GUARDED matching
ALTER TABLE belege ADD COLUMN IF NOT EXISTS lieferant_iban TEXT;
