-- =============================================================================
-- PROJ-20: FinAPI-Integration – Automatischer Kontoauszug-Import
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUM: finapi_verbindung_status
-- ---------------------------------------------------------------------------

CREATE TYPE finapi_verbindung_status AS ENUM ('aktiv', 'sca_faellig', 'fehler', 'getrennt');

-- ---------------------------------------------------------------------------
-- ENUM: import_quelle_typ
-- ---------------------------------------------------------------------------

CREATE TYPE import_quelle_typ AS ENUM ('csv', 'finapi');

-- ---------------------------------------------------------------------------
-- TABELLE: finapi_verbindungen
-- ---------------------------------------------------------------------------

CREATE TABLE finapi_verbindungen (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                      UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  zahlungsquelle_id               UUID REFERENCES zahlungsquellen(id) ON DELETE SET NULL,
  finapi_user_id                  TEXT NOT NULL,
  finapi_user_password_encrypted  TEXT NOT NULL,
  finapi_bank_connection_id       BIGINT,
  bank_name                       TEXT,
  iban                            TEXT,
  kontonummer                     TEXT,
  status                          finapi_verbindung_status NOT NULL DEFAULT 'aktiv',
  letzter_sync_at                 TIMESTAMPTZ,
  letzter_sync_anzahl             INTEGER DEFAULT 0,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finapi_verbindungen ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "finapi_verbindungen_select_own" ON finapi_verbindungen
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "finapi_verbindungen_insert_own" ON finapi_verbindungen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "finapi_verbindungen_update_own" ON finapi_verbindungen
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "finapi_verbindungen_delete_own" ON finapi_verbindungen
  FOR DELETE USING (mandant_id = get_mandant_id());

-- Indexes
CREATE INDEX idx_finapi_verbindungen_mandant ON finapi_verbindungen(mandant_id);
CREATE INDEX idx_finapi_verbindungen_status ON finapi_verbindungen(status);
CREATE INDEX idx_finapi_verbindungen_bank_connection ON finapi_verbindungen(finapi_bank_connection_id);

-- ---------------------------------------------------------------------------
-- TABELLE: finapi_sync_historie
-- ---------------------------------------------------------------------------

CREATE TABLE finapi_sync_historie (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verbindung_id         UUID NOT NULL REFERENCES finapi_verbindungen(id) ON DELETE CASCADE,
  mandant_id            UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  sync_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  anzahl_importiert     INTEGER NOT NULL DEFAULT 0,
  anzahl_duplikate      INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL CHECK (status IN ('erfolg', 'fehler')),
  fehler_meldung        TEXT
);

ALTER TABLE finapi_sync_historie ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finapi_sync_historie_select_own" ON finapi_sync_historie
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "finapi_sync_historie_insert_own" ON finapi_sync_historie
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX idx_finapi_sync_historie_verbindung ON finapi_sync_historie(verbindung_id);
CREATE INDEX idx_finapi_sync_historie_sync_at ON finapi_sync_historie(sync_at DESC);

-- ---------------------------------------------------------------------------
-- TABELLE: finapi_webform_sessions (temporäre Sitzungen für den WebForm-Flow)
-- Speichert Credentials sicher in der DB statt in der Callback-URL.
-- Wird nach Abschluss oder nach 1h automatisch ungültig.
-- ---------------------------------------------------------------------------

CREATE TABLE finapi_webform_sessions (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                      UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  finapi_user_id                  TEXT NOT NULL,
  finapi_user_password_encrypted  TEXT NOT NULL,
  verbindung_id                   UUID REFERENCES finapi_verbindungen(id) ON DELETE CASCADE,
  webform_id                      TEXT,
  status                          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'expired')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour')
);

ALTER TABLE finapi_webform_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finapi_webform_sessions_select_own" ON finapi_webform_sessions
  FOR SELECT USING (mandant_id = get_mandant_id());

CREATE POLICY "finapi_webform_sessions_insert_own" ON finapi_webform_sessions
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "finapi_webform_sessions_update_own" ON finapi_webform_sessions
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX idx_finapi_webform_sessions_mandant ON finapi_webform_sessions(mandant_id);
CREATE INDEX idx_finapi_webform_sessions_expires ON finapi_webform_sessions(expires_at);

-- ---------------------------------------------------------------------------
-- ERWEITERUNG: transaktionen – externe_id + import_quelle
-- ---------------------------------------------------------------------------

ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS externe_id TEXT;
ALTER TABLE transaktionen ADD COLUMN IF NOT EXISTS import_quelle import_quelle_typ DEFAULT 'csv';

-- Index für Duplikat-Erkennung via FinAPI-Transaction-ID
CREATE INDEX idx_transaktionen_externe_id ON transaktionen(externe_id) WHERE externe_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- ERWEITERUNG: mandanten – finapi_user_id
-- ---------------------------------------------------------------------------

ALTER TABLE mandanten ADD COLUMN IF NOT EXISTS finapi_user_id TEXT;

-- ---------------------------------------------------------------------------
-- Update get_mandant_id() to also support invited users (mandant_users)
-- This is already handled by the existing function, no changes needed.
-- ---------------------------------------------------------------------------
