-- =============================================================================
-- PROJ-21: Onboarding-Checkliste am Dashboard
-- =============================================================================

-- ---------------------------------------------------------------------------
-- TABELLE: onboarding_progress
-- Eine Zeile pro Mandant. Ein Eintrag wird nur beim erfolgreichen Mandant-
-- Onboarding (POST /api/onboarding) angelegt -> Opt-in fuer Bestands-Mandanten.
-- ---------------------------------------------------------------------------

CREATE TABLE onboarding_progress (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id               UUID NOT NULL UNIQUE REFERENCES mandanten(id) ON DELETE CASCADE,
  email_address_done       BOOLEAN NOT NULL DEFAULT false,
  email_connection_done    BOOLEAN NOT NULL DEFAULT false,
  company_data_done        BOOLEAN NOT NULL DEFAULT false,
  whatsapp_done            BOOLEAN NOT NULL DEFAULT false,
  portal_connections_done  BOOLEAN NOT NULL DEFAULT false,
  dismissed_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_progress_select_own" ON onboarding_progress
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "onboarding_progress_insert_own" ON onboarding_progress
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "onboarding_progress_update_own" ON onboarding_progress
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "onboarding_progress_delete_own" ON onboarding_progress
  FOR DELETE USING (mandant_id = get_mandant_id());

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_onboarding_progress_mandant ON onboarding_progress(mandant_id);

-- ---------------------------------------------------------------------------
-- Trigger: updated_at automatisch pflegen
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION onboarding_progress_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_onboarding_progress_updated_at
  BEFORE UPDATE ON onboarding_progress
  FOR EACH ROW
  EXECUTE FUNCTION onboarding_progress_set_updated_at();

COMMENT ON TABLE onboarding_progress IS
  'PROJ-21: Onboarding-Checkliste-Status pro Mandant. Opt-in: Eintrag wird nur beim neuen Mandant-Onboarding angelegt, Bestands-Mandanten sehen die Checkliste nicht.';
