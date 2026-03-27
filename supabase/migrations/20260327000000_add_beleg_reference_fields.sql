-- PROJ-5: Add additional reference fields to belege for better matching
-- These fields allow hard-matching against SEPA mandates, payment references, and order numbers.

ALTER TABLE belege ADD COLUMN IF NOT EXISTS mandatsreferenz TEXT;
ALTER TABLE belege ADD COLUMN IF NOT EXISTS zahlungsreferenz TEXT;
ALTER TABLE belege ADD COLUMN IF NOT EXISTS bestellnummer TEXT;

-- Indexes for matching lookups
CREATE INDEX IF NOT EXISTS idx_belege_mandatsreferenz ON belege(mandatsreferenz) WHERE mandatsreferenz IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_belege_zahlungsreferenz ON belege(zahlungsreferenz) WHERE zahlungsreferenz IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_belege_bestellnummer ON belege(bestellnummer) WHERE bestellnummer IS NOT NULL;
