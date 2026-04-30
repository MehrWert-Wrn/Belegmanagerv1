-- Fix: ensure_kassa_quelle ohne ORDER BY gibt non-deterministisch mal K1, mal K2 zurück.
-- Bei mehreren Kassabüchern soll die zuletzt angelegte Quelle zurückgegeben werden,
-- da die älteste oft eine Testkassa oder leere Initialkassa ist.
CREATE OR REPLACE FUNCTION ensure_kassa_quelle(p_mandant_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
  v_created BOOLEAN := false;
BEGIN
  -- ORDER BY erstellt_am DESC: bei mehreren Kassaquellen die neueste zurückgeben
  -- (deterministisch, verhindert random LIMIT 1 Ergebnisse nach DB-Restarts)
  SELECT id INTO v_id FROM zahlungsquellen
  WHERE mandant_id = p_mandant_id AND typ = 'kassa'
  ORDER BY erstellt_am DESC
  LIMIT 1;

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
