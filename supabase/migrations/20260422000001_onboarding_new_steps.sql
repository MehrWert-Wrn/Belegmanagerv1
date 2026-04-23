-- PROJ-21: Add new onboarding checklist steps
-- Adds 8 new columns for the restructured onboarding tour (steps 2-8 + appointment)
-- company_data_done column is kept for backwards compatibility but no longer used in UI/API

ALTER TABLE onboarding_progress
  ADD COLUMN IF NOT EXISTS belege_hochladen_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mobile_app_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_test_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transactions_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matching_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kassabuch_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monatsabschluss_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS appointment_done boolean NOT NULL DEFAULT false;
