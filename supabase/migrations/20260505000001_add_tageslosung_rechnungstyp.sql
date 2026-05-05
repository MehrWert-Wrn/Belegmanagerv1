-- PROJ-7 / PROJ-3: Tageslosung-Erweiterung (2026-05-05)
-- - rechnungstyp_enum: Neuer Wert 'tageslosung'
-- - kassa_kategorien:  Standard-Kategorie 'Tageslosung' für alle Mandanten mit Kassaquelle
-- - seed_kassa_standard_kategorien: Funktion um 'Tageslosung' erweitert

-- 1. Neuer Enum-Wert
ALTER TYPE rechnungstyp_enum ADD VALUE IF NOT EXISTS 'tageslosung';

-- 2. Tageslosung-Kategorie für bestehende Mandanten mit Kassaquelle
INSERT INTO kassa_kategorien (mandant_id, name, farbe, kontonummer, ist_standard)
SELECT DISTINCT zq.mandant_id, 'Tageslosung', '#EC4899', NULL, true
FROM zahlungsquellen zq
WHERE zq.typ = 'kassa'
  AND NOT EXISTS (
    SELECT 1 FROM kassa_kategorien kk
    WHERE kk.mandant_id = zq.mandant_id AND kk.name = 'Tageslosung'
  );

-- 3. seed_kassa_standard_kategorien um Tageslosung erweitern
CREATE OR REPLACE FUNCTION seed_kassa_standard_kategorien(p_mandant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO kassa_kategorien (mandant_id, name, farbe, kontonummer, ist_standard)
  VALUES
    (p_mandant_id, 'Büromaterial',              '#3B82F6', '7600', true),
    (p_mandant_id, 'Reisekosten / Diäten',      '#14B8A6', '7330', true),
    (p_mandant_id, 'Repräsentation / Bewirtung', '#F59E0B', '7680', true),
    (p_mandant_id, 'Porto / Versand',            '#8B5CF6', '7610', true),
    (p_mandant_id, 'Sonstiges',                  '#6B7280', '7800', true),
    (p_mandant_id, 'Tageslosung',                '#EC4899', NULL,   true)
  ON CONFLICT DO NOTHING;
END;
$$;
