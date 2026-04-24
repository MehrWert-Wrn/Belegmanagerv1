-- Add foreign currency support to belege
-- währung: ISO 4217 currency code (e.g. "EUR", "USD", "GBP")
-- bruttobetrag_fremdwährung: original amount in foreign currency (before conversion)
-- wechselkurs: EUR per 1 unit of foreign currency used at time of OCR
ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS waehrung TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS bruttobetrag_fremdwaehrung NUMERIC,
  ADD COLUMN IF NOT EXISTS wechselkurs NUMERIC;
