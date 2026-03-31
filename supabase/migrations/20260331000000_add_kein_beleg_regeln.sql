CREATE TABLE kein_beleg_regeln (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kein_beleg_regeln ENABLE ROW LEVEL SECURITY;

CREATE POLICY kein_beleg_regeln_select ON kein_beleg_regeln
  FOR SELECT USING (mandant_id = (SELECT get_mandant_id()));

CREATE POLICY kein_beleg_regeln_insert ON kein_beleg_regeln
  FOR INSERT WITH CHECK (mandant_id = (SELECT get_mandant_id()));

CREATE POLICY kein_beleg_regeln_delete ON kein_beleg_regeln
  FOR DELETE USING (mandant_id = (SELECT get_mandant_id()));

CREATE INDEX kein_beleg_regeln_mandant_idx ON kein_beleg_regeln (mandant_id);
