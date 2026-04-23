-- BUG-19: kassa_pruefung_atomic – beide INSERTs in einer einzigen DB-Transaktion,
-- damit der lfd_nr_kassa-Trigger bei einem Rollback keine Lücken hinterlässt.
--
-- BUG-32: Storage-Policies für kassabuch-archive Bucket –
-- authenticated User darf nur eigene Mandanten-Pfade lesen.

-- -----------------------------------------------------------------------
-- BUG-19: RPC kassa_pruefung_atomic
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kassa_pruefung_atomic(
  p_mandant_id          uuid,
  p_quelle_id           uuid,
  p_geprueft_von        uuid,
  p_istbestand          numeric,
  p_buchbestand         numeric,
  p_differenz           numeric,
  p_begruendung         text    DEFAULT NULL,
  p_datum               date    DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_differenz_tx_id uuid;
  v_pruefung_id     uuid;
  v_geprueft_am     timestamptz;
  v_differenz_col   numeric;
BEGIN
  -- Optional: DIFFERENZ-Transaktion anlegen (nur wenn Differenz ≠ 0)
  IF p_differenz <> 0 THEN
    INSERT INTO public.transaktionen (
      mandant_id, quelle_id, datum, betrag, beschreibung,
      kassa_buchungstyp, match_status
    ) VALUES (
      p_mandant_id, p_quelle_id, p_datum, p_differenz,
      'Kassadifferenz – ' || COALESCE(p_begruendung, ''),
      'DIFFERENZ', 'kein_beleg'
    )
    RETURNING id INTO v_differenz_tx_id;
  END IF;

  -- Kassenprüfungs-Protokoll anlegen
  INSERT INTO public.kassa_pruefungen (
    mandant_id, geprueft_von, buchbestand, istbestand,
    begruendung, differenz_transaktion_id
  ) VALUES (
    p_mandant_id, p_geprueft_von, p_buchbestand, p_istbestand,
    p_begruendung, v_differenz_tx_id
  )
  RETURNING id, geprueft_am, differenz
  INTO v_pruefung_id, v_geprueft_am, v_differenz_col;

  RETURN jsonb_build_object(
    'id',                       v_pruefung_id,
    'geprueft_am',              v_geprueft_am,
    'buchbestand',              p_buchbestand,
    'istbestand',               p_istbestand,
    'differenz',                v_differenz_col,
    'begruendung',              p_begruendung,
    'differenz_transaktion_id', v_differenz_tx_id
  );
END;
$$;

-- -----------------------------------------------------------------------
-- BUG-32: Storage-Policies für kassabuch-archive
-- Uploads erfolgen über den Admin-Client (umgeht RLS).
-- Authenticated User darf nur den eigenen Mandanten-Pfad lesen.
-- -----------------------------------------------------------------------

-- SELECT: nur Dateien im eigenen Mandanten-Ordner lesbar
CREATE POLICY "kassabuch_archiv_select_own_mandant"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'kassabuch-archive'
    AND EXISTS (
      SELECT 1
      FROM public.mandant_users mu
      WHERE mu.user_id  = auth.uid()
        AND mu.mandant_id::text = (string_to_array(name, '/'))[1]
    )
  );

-- INSERT via Client explizit sperren (Uploads nur über Admin-Client erlaubt)
CREATE POLICY "kassabuch_archiv_deny_client_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id <> 'kassabuch-archive'
  );

-- UPDATE via Client sperren (Archive sind unveränderlich – § 131 BAO)
CREATE POLICY "kassabuch_archiv_deny_client_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id <> 'kassabuch-archive'
  );

-- DELETE via Client sperren (Archive dürfen nicht gelöscht werden – § 131 BAO)
CREATE POLICY "kassabuch_archiv_deny_client_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id <> 'kassabuch-archive'
  );
