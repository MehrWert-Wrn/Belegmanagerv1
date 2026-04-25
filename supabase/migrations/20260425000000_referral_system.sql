-- =============================================================================
-- PROJ-31: Weiterempfehlungssystem (Referral)
-- =============================================================================
-- Tabellen:
--  * referral_codes – ein eindeutiger Code pro Mandant (Format: BM-XXXXXX)
--  * referrals      – Tracking-Eintrag pro Click / Registrierung / Reward
-- Zusatz:
--  * RPC increment_referral_clicks(p_code TEXT) – atomar fuer Landing Page
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABELLE: referral_codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referral_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  code          TEXT NOT NULL UNIQUE,                       -- Format: BM-XXXXXX
  total_clicks  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_codes_format_chk CHECK (code ~ '^BM-[A-Z0-9]{6}$'),
  CONSTRAINT referral_codes_mandant_unique UNIQUE (mandant_id)
);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- SELECT: Mandant sieht nur eigenen Code
CREATE POLICY "referral_codes_select_own" ON referral_codes
  FOR SELECT USING (mandant_id = get_mandant_id());

-- INSERT: Wird ueber API mit Service-Role gemacht; trotzdem Policy fuer authentifizierte User
CREATE POLICY "referral_codes_insert_own" ON referral_codes
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

-- UPDATE: Nur eigene Codes (z.B. wenn UI total_clicks anzeigen will)
CREATE POLICY "referral_codes_update_own" ON referral_codes
  FOR UPDATE USING (mandant_id = get_mandant_id())
  WITH CHECK (mandant_id = get_mandant_id());

-- Kein DELETE ueber RLS – Codes bleiben permanent

CREATE INDEX IF NOT EXISTS idx_referral_codes_mandant
  ON referral_codes(mandant_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code
  ON referral_codes(code);

-- ---------------------------------------------------------------------------
-- TABELLE: referrals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrals (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id              UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
  referred_mandant_id           UUID REFERENCES mandanten(id) ON DELETE SET NULL,
  referred_email                TEXT,
  status                        TEXT NOT NULL DEFAULT 'clicked'
                                CHECK (status IN ('clicked','registered','pending','rewarded','expired','blocked')),
  clicked_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  registered_at                 TIMESTAMPTZ,
  converted_at                  TIMESTAMPTZ,
  reward_eligible_at            TIMESTAMPTZ,
  rewarded_at                   TIMESTAMPTZ,
  stripe_credit_transaction_id  TEXT,
  payment_method_fingerprint    TEXT,
  same_domain_flag              BOOLEAN NOT NULL DEFAULT false,
  blocked_reason                TEXT
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- SELECT: Mandant sieht nur Referrals seines eigenen Codes
CREATE POLICY "referrals_select_own_code" ON referrals
  FOR SELECT USING (
    referral_code_id IN (
      SELECT id FROM referral_codes WHERE mandant_id = get_mandant_id()
    )
  );

-- INSERT: Mandant darf keinen Referral-Eintrag manuell anlegen (kommt aus Server-Code)
-- Wir verzichten auf eine INSERT-Policy fuer authentifizierte Nutzer.
-- Inserts laufen mit service_role (Admin-Client) ueber API-Routen.

-- UPDATE / DELETE: Nicht erlaubt fuer Mandanten

CREATE INDEX IF NOT EXISTS idx_referrals_code
  ON referrals(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referrals_mandant
  ON referrals(referred_mandant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status
  ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_referrals_status_converted_at
  ON referrals(status, converted_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_referrals_email
  ON referrals(referred_email);
CREATE INDEX IF NOT EXISTS idx_referrals_payment_fp
  ON referrals(payment_method_fingerprint) WHERE payment_method_fingerprint IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPC: increment_referral_clicks
-- Atomarer Click-Tracker fuer Landing Page – wird mit service_role aufgerufen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_referral_clicks(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  UPDATE referral_codes
     SET total_clicks = total_clicks + 1
   WHERE code = p_code
   RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_referral_clicks(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_referral_clicks(TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- KOMMENTARE
-- ---------------------------------------------------------------------------

COMMENT ON TABLE referral_codes IS 'PROJ-31: Eindeutiger Empfehlungs-Code pro Mandant (lazy generiert).';
COMMENT ON TABLE referrals IS 'PROJ-31: Referral-Tracking pro Click bis Reward.';
COMMENT ON COLUMN referrals.status IS 'clicked | registered | pending | rewarded | expired | blocked';
COMMENT ON COLUMN referrals.payment_method_fingerprint IS 'Stripe payment_method.card.fingerprint zur Fraud-Erkennung.';
COMMENT ON COLUMN referrals.same_domain_flag IS 'true wenn referrer und referee gleiche E-Mail-Domain verwenden – nur Hinweis, kein Auto-Block.';
COMMENT ON COLUMN referrals.blocked_reason IS 'self_referral | payment_method | NULL';
