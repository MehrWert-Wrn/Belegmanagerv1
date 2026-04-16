-- PROJ-24: Sichere Zugangsdaten-Übermittlung für E-Mail-Anbindung
-- Tabelle für verschlüsselt gespeicherte E-Mail-Zugangsdaten

-- pgcrypto aktivieren (idempotent)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TABELLE: mandant_credentials
CREATE TABLE mandant_credentials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id        UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL CHECK (provider IN ('imap', 'microsoft365', 'gmail')),
  payload_encrypted TEXT NOT NULL,
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,

  CONSTRAINT uq_mandant_credentials_provider UNIQUE (mandant_id, provider)
);

-- RLS aktivieren
ALTER TABLE mandant_credentials ENABLE ROW LEVEL SECURITY;

-- Mandant kann eigene Rows sehen (OHNE payload_encrypted – über Spalten-Auswahl im Query)
-- RLS erlaubt SELECT auf die Row, aber die API gibt payload_encrypted nie an Mandanten zurück
CREATE POLICY "mandant_credentials_select_own" ON mandant_credentials
  FOR SELECT
  USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

-- Mandant kann eigene Row einfügen (nur wenn keine aktive Submission für diesen Provider existiert)
CREATE POLICY "mandant_credentials_insert_own" ON mandant_credentials
  FOR INSERT
  WITH CHECK (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM mandant_credentials mc
      WHERE mc.mandant_id = mandant_credentials.mandant_id
        AND mc.provider = mandant_credentials.provider
    )
  );

-- Kein UPDATE/DELETE für Mandanten – nur Service Role (Admin)
-- Service Role bypassed RLS automatisch

-- Indexes
CREATE INDEX idx_mandant_credentials_mandant ON mandant_credentials(mandant_id);
CREATE INDEX idx_mandant_credentials_acknowledged ON mandant_credentials(acknowledged_at) WHERE acknowledged_at IS NULL;

-- Hilfsfunktionen für Encryption/Decryption (nur via Service Role aufrufbar)

-- Encrypt: nimmt Klartext-JSON + Key, gibt verschlüsselten Text zurück
CREATE OR REPLACE FUNCTION encrypt_credential_payload(
  payload_text TEXT,
  encryption_key TEXT
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT encode(pgp_sym_encrypt(payload_text, encryption_key)::bytea, 'base64');
$$;

-- Decrypt: nimmt verschlüsselten Text + Key, gibt Klartext zurück
CREATE OR REPLACE FUNCTION decrypt_credential_payload(
  encrypted_text TEXT,
  encryption_key TEXT
)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pgp_sym_decrypt(decode(encrypted_text, 'base64')::bytea, encryption_key);
$$;

-- Revoke execute from public/anon – nur Service Role kann aufrufen
REVOKE EXECUTE ON FUNCTION encrypt_credential_payload FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrypt_credential_payload FROM PUBLIC;
