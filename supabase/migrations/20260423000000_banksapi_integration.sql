-- =============================================================================
-- PROJ-20: BanksAPI-Integration – Parallel zur FinAPI-Integration
-- =============================================================================
-- Diese Migration ergaenzt FinAPI nicht, sondern stellt einen unabhaengigen
-- zweiten PSD2-Provider (BanksAPI) bereit. Die FinAPI-Tabellen bleiben
-- vollstaendig unberuehrt.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM: banksapi_verbindung_status
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE banksapi_verbindung_status AS ENUM ('aktiv', 'sca_faellig', 'fehler', 'getrennt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- ENUM-ERWEITERUNG: import_quelle_typ um 'banksapi'
-- (Bestehende Werte: 'csv', 'finapi')
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TYPE import_quelle_typ ADD VALUE IF NOT EXISTS 'banksapi';
EXCEPTION WHEN undefined_object THEN
  -- Falls der Typ noch nicht existiert (Edge-Case bei frischen DBs)
  CREATE TYPE import_quelle_typ AS ENUM ('csv', 'finapi', 'banksapi');
END $$;

-- ---------------------------------------------------------------------------
-- TABELLE: banksapi_verbindungen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banksapi_verbindungen (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id               UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  zahlungsquelle_id        UUID REFERENCES zahlungsquellen(id) ON DELETE SET NULL,
  banksapi_username        TEXT NOT NULL,
  banksapi_access_id       TEXT,
  banksapi_product_id      TEXT,
  bank_name                TEXT,
  iban                     TEXT,
  status                   banksapi_verbindung_status NOT NULL DEFAULT 'aktiv',
  letzter_sync_at          TIMESTAMPTZ,
  letzter_sync_anzahl      INTEGER DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE banksapi_verbindungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banksapi_verbindungen_select_own" ON banksapi_verbindungen
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_verbindungen_insert_own" ON banksapi_verbindungen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_verbindungen_update_own" ON banksapi_verbindungen
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_verbindungen_delete_own" ON banksapi_verbindungen
  FOR DELETE USING (mandant_id = get_mandant_id());

CREATE INDEX IF NOT EXISTS idx_banksapi_verbindungen_mandant
  ON banksapi_verbindungen(mandant_id);
CREATE INDEX IF NOT EXISTS idx_banksapi_verbindungen_status
  ON banksapi_verbindungen(status);
CREATE INDEX IF NOT EXISTS idx_banksapi_verbindungen_access
  ON banksapi_verbindungen(banksapi_access_id);

-- ---------------------------------------------------------------------------
-- TABELLE: banksapi_sync_historie
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banksapi_sync_historie (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verbindung_id       UUID NOT NULL REFERENCES banksapi_verbindungen(id) ON DELETE CASCADE,
  mandant_id          UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  anzahl_importiert   INTEGER NOT NULL DEFAULT 0,
  anzahl_duplikate    INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL CHECK (status IN ('success', 'error')),
  fehler_meldung      TEXT
);

ALTER TABLE banksapi_sync_historie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banksapi_sync_historie_select_own" ON banksapi_sync_historie
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_sync_historie_insert_own" ON banksapi_sync_historie
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX IF NOT EXISTS idx_banksapi_sync_historie_verbindung
  ON banksapi_sync_historie(verbindung_id);
CREATE INDEX IF NOT EXISTS idx_banksapi_sync_historie_synced_at
  ON banksapi_sync_historie(synced_at DESC);

-- ---------------------------------------------------------------------------
-- TABELLE: banksapi_webform_sessions
-- Temporaere Sitzungen fuer den hosted-UI Callback-Flow.
-- Speichert das BanksAPI-User-Passwort AES-256-GCM verschluesselt in der DB,
-- damit der Callback ohne Credentials in der URL auskommt.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banksapi_webform_sessions (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                      UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  banksapi_username               TEXT NOT NULL,
  banksapi_user_password_encrypted TEXT NOT NULL,
  status                          TEXT NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE banksapi_webform_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "banksapi_webform_sessions_select_own" ON banksapi_webform_sessions
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_webform_sessions_insert_own" ON banksapi_webform_sessions
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "banksapi_webform_sessions_update_own" ON banksapi_webform_sessions
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX IF NOT EXISTS idx_banksapi_webform_sessions_mandant
  ON banksapi_webform_sessions(mandant_id);
CREATE INDEX IF NOT EXISTS idx_banksapi_webform_sessions_expires
  ON banksapi_webform_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- ERWEITERUNG: mandanten – banksapi_username
-- (Wird beim ersten Bankzugang generiert und mandantenuebergreifend persistiert.)
-- ---------------------------------------------------------------------------

ALTER TABLE mandanten ADD COLUMN IF NOT EXISTS banksapi_username TEXT;
