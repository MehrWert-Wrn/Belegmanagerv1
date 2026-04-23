-- PROJ-7 Kassabuch-Erweiterung (2026-04-23)
-- - kassa_kategorien:   Kostenkategorien pro Mandant
-- - kassa_vorlagen:     Buchungs-Vorlagen pro Mandant
-- - kassa_pruefungen:   Kassenprüfungs-Protokoll
-- - kassabuch_archiv:   Unveränderliche Monats-PDFs nach Abschluss
-- - transaktionen:      kategorie_id + kassa_vorlage_id
-- - CHECK-Constraint um 'DIFFERENZ' erweitert
-- - storage.buckets:    'kassabuch-archive' (private)

-- ---------------------------------------------------------------------------
-- 1. kassa_kategorien
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kassa_kategorien (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id   UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  farbe        TEXT NOT NULL DEFAULT '#6B7280',
  kontonummer  TEXT,
  ist_standard BOOLEAN NOT NULL DEFAULT false,
  erstellt_am  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kassa_kategorien ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kassa_kategorien_select_own" ON kassa_kategorien
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "kassa_kategorien_insert_own" ON kassa_kategorien
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "kassa_kategorien_update_own" ON kassa_kategorien
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "kassa_kategorien_delete_own" ON kassa_kategorien
  FOR DELETE USING (mandant_id = get_mandant_id());

CREATE INDEX IF NOT EXISTS idx_kassa_kategorien_mandant ON kassa_kategorien(mandant_id);

-- ---------------------------------------------------------------------------
-- 2. kassa_vorlagen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kassa_vorlagen (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id        UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  kassa_buchungstyp TEXT NOT NULL CHECK (kassa_buchungstyp IN ('EINNAHME','AUSGABE','EINLAGE','ENTNAHME')),
  betrag            NUMERIC(10,2),
  beschreibung      TEXT,
  kategorie_id      UUID REFERENCES kassa_kategorien(id) ON DELETE SET NULL,
  erstellt_am       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kassa_vorlagen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kassa_vorlagen_select_own" ON kassa_vorlagen
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "kassa_vorlagen_insert_own" ON kassa_vorlagen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "kassa_vorlagen_update_own" ON kassa_vorlagen
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "kassa_vorlagen_delete_own" ON kassa_vorlagen
  FOR DELETE USING (mandant_id = get_mandant_id());

CREATE INDEX IF NOT EXISTS idx_kassa_vorlagen_mandant ON kassa_vorlagen(mandant_id);

-- ---------------------------------------------------------------------------
-- 3. kassa_pruefungen
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kassa_pruefungen (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id               UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  geprueft_am              TIMESTAMPTZ NOT NULL DEFAULT now(),
  geprueft_von             UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  buchbestand              NUMERIC(10,2) NOT NULL,
  istbestand               NUMERIC(10,2) NOT NULL,
  differenz                NUMERIC(10,2) GENERATED ALWAYS AS (istbestand - buchbestand) STORED,
  begruendung              TEXT,
  differenz_transaktion_id UUID REFERENCES transaktionen(id) ON DELETE SET NULL
);

ALTER TABLE kassa_pruefungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kassa_pruefungen_select_own" ON kassa_pruefungen
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "kassa_pruefungen_insert_own" ON kassa_pruefungen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
-- Protokoll-Einträge dürfen nicht nachträglich geändert oder gelöscht werden (BAO)

CREATE INDEX IF NOT EXISTS idx_kassa_pruefungen_mandant     ON kassa_pruefungen(mandant_id);
CREATE INDEX IF NOT EXISTS idx_kassa_pruefungen_erstellt_am ON kassa_pruefungen(mandant_id, geprueft_am DESC);

-- ---------------------------------------------------------------------------
-- 4. kassabuch_archiv
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kassabuch_archiv (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id    UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  monat         TEXT NOT NULL, -- Format 'YYYY-MM'
  storage_path  TEXT NOT NULL,
  erstellt_am   TIMESTAMPTZ NOT NULL DEFAULT now(),
  erstellt_von  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (mandant_id, monat)
);

ALTER TABLE kassabuch_archiv ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kassabuch_archiv_select_own" ON kassabuch_archiv
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "kassabuch_archiv_insert_own" ON kassabuch_archiv
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
-- Archive-Einträge sind immutable: kein UPDATE/DELETE

CREATE INDEX IF NOT EXISTS idx_kassabuch_archiv_mandant       ON kassabuch_archiv(mandant_id);
CREATE INDEX IF NOT EXISTS idx_kassabuch_archiv_mandant_monat ON kassabuch_archiv(mandant_id, monat);

-- ---------------------------------------------------------------------------
-- 5. transaktionen.kategorie_id + kassa_vorlage_id
-- ---------------------------------------------------------------------------

ALTER TABLE transaktionen
  ADD COLUMN IF NOT EXISTS kategorie_id      UUID REFERENCES kassa_kategorien(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kassa_vorlage_id  UUID REFERENCES kassa_vorlagen(id)   ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transaktionen_kategorie ON transaktionen(kategorie_id) WHERE kategorie_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. CHECK-Constraint um 'DIFFERENZ' erweitern
-- ---------------------------------------------------------------------------

ALTER TABLE transaktionen DROP CONSTRAINT IF EXISTS kassa_buchungstyp_check;

ALTER TABLE transaktionen
  ADD CONSTRAINT kassa_buchungstyp_check
  CHECK (kassa_buchungstyp IS NULL OR kassa_buchungstyp IN (
    'EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME', 'STORNO', 'DIFFERENZ'
  ));

-- ---------------------------------------------------------------------------
-- 7. Storage-Bucket für Kassabuch-Archiv (private)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'kassabuch-archive',
  'kassabuch-archive',
  false,
  20971520, -- 20 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Pfad-Schema: {mandant_id}/{YYYY-MM}.pdf
-- Upload erfolgt server-side via Service-Role; authentifizierte Mandant-User dürfen lesen.
CREATE POLICY "kassabuch_archive_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'kassabuch-archive'
    AND split_part(name, '/', 1)::uuid = get_mandant_id()
  );

-- ---------------------------------------------------------------------------
-- 8. Standard-Kategorien Seed-Funktion
--    - idempotent pro Mandant via ist_standard + name
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_kassa_standard_kategorien(p_mandant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO kassa_kategorien (mandant_id, name, farbe, kontonummer, ist_standard)
  VALUES
    (p_mandant_id, 'Büromaterial',             '#3B82F6', '7600', true),
    (p_mandant_id, 'Reisekosten / Diäten',     '#14B8A6', '7330', true),
    (p_mandant_id, 'Repräsentation / Bewirtung','#F59E0B', '7680', true),
    (p_mandant_id, 'Porto / Versand',          '#8B5CF6', '7610', true),
    (p_mandant_id, 'Sonstiges',                '#6B7280', '7800', true)
  ON CONFLICT DO NOTHING;
END;
$$;

-- Seed für bestehende Mandanten, die bereits eine Kassaquelle haben
INSERT INTO kassa_kategorien (mandant_id, name, farbe, kontonummer, ist_standard)
SELECT DISTINCT zq.mandant_id, v.name, v.farbe, v.kontonummer, true
FROM zahlungsquellen zq
CROSS JOIN (VALUES
  ('Büromaterial',              '#3B82F6', '7600'),
  ('Reisekosten / Diäten',      '#14B8A6', '7330'),
  ('Repräsentation / Bewirtung','#F59E0B', '7680'),
  ('Porto / Versand',           '#8B5CF6', '7610'),
  ('Sonstiges',                 '#6B7280', '7800')
) AS v(name, farbe, kontonummer)
WHERE zq.typ = 'kassa'
  AND NOT EXISTS (
    SELECT 1 FROM kassa_kategorien kk
    WHERE kk.mandant_id = zq.mandant_id AND kk.name = v.name
  );

-- ---------------------------------------------------------------------------
-- 9. ensure_kassa_quelle erweitern: Standard-Kategorien beim Erstanlegen seeden
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION ensure_kassa_quelle(p_mandant_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_created BOOLEAN := false;
BEGIN
  SELECT id INTO v_id FROM zahlungsquellen
  WHERE mandant_id = p_mandant_id AND typ = 'kassa' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO zahlungsquellen (mandant_id, name, typ)
    VALUES (p_mandant_id, 'Kassabuch', 'kassa')
    RETURNING id INTO v_id;
    v_created := true;
  END IF;

  -- Beim Erstanlegen auch Standard-Kategorien seeden
  IF v_created THEN
    PERFORM seed_kassa_standard_kategorien(p_mandant_id);
  END IF;

  RETURN v_id;
END;
$$;
