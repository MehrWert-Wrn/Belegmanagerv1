-- PROJ-11: Kommentare & Workflow-Status
-- Creates the transaktions_kommentare table for internal comments on transactions

CREATE TABLE transaktions_kommentare (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaktion_id UUID NOT NULL REFERENCES transaktionen(id) ON DELETE CASCADE,
  mandant_id UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS (mandatory for all tables)
ALTER TABLE transaktions_kommentare ENABLE ROW LEVEL SECURITY;

-- RLS policy: mandant members can read and write their own mandant's comments
CREATE POLICY "mandant_kommentare_select" ON transaktions_kommentare
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "mandant_kommentare_insert" ON transaktions_kommentare
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

-- No UPDATE/DELETE policies: comments are immutable (audit trail)

-- Index on transaktion_id for fast comment lookups per transaction
CREATE INDEX idx_kommentare_transaktion ON transaktions_kommentare(transaktion_id);

-- Index on mandant_id for RLS performance
CREATE INDEX idx_kommentare_mandant ON transaktions_kommentare(mandant_id);
