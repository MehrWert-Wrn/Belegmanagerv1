-- =============================================================================
-- PROJ-31: Referral Bug Fixes
-- BUG-005: referrals.referral_code_id CASCADE → SET NULL (historische rewarded-Eintraege bleiben erhalten)
-- BUG-002: check_recent_auth_user RPC fuer frischen Signup-Nachweis
-- =============================================================================

-- ---------------------------------------------------------------------------
-- BUG-005: referrals.referral_code_id – ON DELETE CASCADE → ON DELETE SET NULL
-- Wenn ein Mandant geloescht wird und damit sein referral_code verschwindet,
-- sollen bereits rewarded-Eintraege erhalten bleiben (referral_code_id = NULL).
-- ---------------------------------------------------------------------------

ALTER TABLE referrals
  ALTER COLUMN referral_code_id DROP NOT NULL;

ALTER TABLE referrals
  DROP CONSTRAINT IF EXISTS referrals_referral_code_id_fkey;

ALTER TABLE referrals
  ADD CONSTRAINT referrals_referral_code_id_fkey
  FOREIGN KEY (referral_code_id)
  REFERENCES referral_codes(id)
  ON DELETE SET NULL;

-- RLS Policy aktualisieren: NULL referral_code_id → kein Mandant-Zugriff (Service-Role only)
-- Die bestehende Policy bleibt korrekt: referral_code_id IN (...) ergibt fuer NULL = kein Match.
-- Historische orphaned Eintraege sind nur via Admin/Service-Role sichtbar – gewuenscht.

-- ---------------------------------------------------------------------------
-- BUG-002: check_recent_auth_user – prueft ob E-Mail frisch in auth.users angelegt
-- Verhindert Fake-Registrierungen mit beliebigen E-Mail-Adressen im Register-Endpoint.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_recent_auth_user(p_email TEXT, p_minutes INT DEFAULT 10)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email = lower(p_email)
      AND created_at > now() - (p_minutes || ' minutes')::interval
  );
$$;

REVOKE ALL ON FUNCTION check_recent_auth_user(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION check_recent_auth_user(TEXT, INT) TO service_role;

COMMENT ON FUNCTION check_recent_auth_user IS
  'PROJ-31 BUG-002: Prueft ob eine E-Mail-Adresse innerhalb der letzten p_minutes Minuten in auth.users angelegt wurde. Schutz gegen Fake-Referral-Registrierungen.';
