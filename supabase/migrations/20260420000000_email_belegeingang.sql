-- PROJ-30: E-Mail-Belegeingang
-- Adds:
--   1. belege.quelle column (manual | email)
--   2. verarbeitete_email_nachrichten table for Postmark-Webhook idempotency

-- ---------------------------------------------------------------------------
-- 1. belege.quelle  (indicates origin of the Beleg)
-- ---------------------------------------------------------------------------

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS quelle TEXT NOT NULL DEFAULT 'manual'
    CHECK (quelle IN ('manual', 'email'));

-- Filter index: mostly used to highlight email-imported belege in the Belegliste
CREATE INDEX IF NOT EXISTS idx_belege_quelle
  ON belege(mandant_id, quelle)
  WHERE quelle <> 'manual';

COMMENT ON COLUMN belege.quelle IS
  'Origin of the beleg: manual (upload/API) or email (Postmark Inbound webhook)';

-- ---------------------------------------------------------------------------
-- 2. verarbeitete_email_nachrichten  (Postmark MessageID deduplication)
-- ---------------------------------------------------------------------------
-- Postmark may retry the webhook on transient errors. This table stores
-- each processed Postmark MessageID so retries are short-circuited with 200 OK.

CREATE TABLE IF NOT EXISTS verarbeitete_email_nachrichten (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      TEXT NOT NULL UNIQUE,
  mandant_id      UUID REFERENCES mandanten(id) ON DELETE SET NULL,
  from_email      TEXT,
  anhang_anzahl   INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('processed', 'bounced', 'skipped')),
  fehlermeldung   TEXT,
  verarbeitet_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE verarbeitete_email_nachrichten ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write this table. No end-user access is required,
-- since the Postmark webhook runs server-side with the service role. We still
-- add an explicit mandant-scoped SELECT policy for completeness and to avoid
-- accidental data leaks should the table ever be queried with anon/auth role.

CREATE POLICY "verarbeitete_email_nachrichten_select_own"
  ON verarbeitete_email_nachrichten
  FOR SELECT
  USING (mandant_id IS NOT NULL AND mandant_id = get_mandant_id());

-- No INSERT / UPDATE / DELETE policies on purpose: writes only via service role.

CREATE INDEX IF NOT EXISTS idx_verarbeitete_email_mandant
  ON verarbeitete_email_nachrichten(mandant_id, verarbeitet_am DESC)
  WHERE mandant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verarbeitete_email_status
  ON verarbeitete_email_nachrichten(status, verarbeitet_am DESC);

COMMENT ON TABLE verarbeitete_email_nachrichten IS
  'Deduplication log of processed Postmark Inbound webhooks (by MessageID).';
