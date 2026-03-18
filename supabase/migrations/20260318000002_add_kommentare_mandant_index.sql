-- Add missing mandant_id index on transaktions_kommentare for RLS performance.
-- All RLS policies filter by mandant_id = get_mandant_id(); without this index
-- every comment query requires a full table scan.

CREATE INDEX idx_kommentare_mandant ON transaktions_kommentare(mandant_id);
