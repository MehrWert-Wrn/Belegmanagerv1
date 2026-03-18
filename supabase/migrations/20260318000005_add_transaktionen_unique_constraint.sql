-- Add UNIQUE index on transaktionen to prevent duplicate imports at DB level.
-- buchungsreferenz and beschreibung can be NULL; COALESCE treats NULL as ''
-- so two rows with NULL buchungsreferenz/beschreibung on the same date/amount/quelle are detected as duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaktionen_duplikat_check
ON transaktionen(mandant_id, quelle_id, datum, betrag, COALESCE(buchungsreferenz, ''), COALESCE(beschreibung, ''));
