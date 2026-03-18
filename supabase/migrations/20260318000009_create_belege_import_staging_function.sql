-- PROJ-3: Create function to generate per-mandant staging tables for n8n belege import

CREATE OR REPLACE FUNCTION create_belege_import_table(p_mandant_id UUID, p_firmenname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sanitized TEXT;
  v_table_name TEXT;
  v_trigger_fn_name TEXT;
  v_trigger_name TEXT;
BEGIN
  -- Step 1: Sanitize firmenname
  -- Lowercase, replace non-alphanumeric with underscore, collapse multiple underscores, trim
  v_sanitized := lower(p_firmenname);
  v_sanitized := regexp_replace(v_sanitized, '[^a-z0-9]', '_', 'g');
  v_sanitized := regexp_replace(v_sanitized, '_+', '_', 'g');
  v_sanitized := trim(both '_' from v_sanitized);
  v_sanitized := left(v_sanitized, 50);

  v_table_name := 'belege_import_' || v_sanitized;

  -- Check if table already exists; if collision, append mandant_id prefix
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v_table_name
  ) THEN
    v_table_name := v_table_name || '_' || left(p_mandant_id::text, 8);
  END IF;

  -- Ensure total table name stays within PostgreSQL 63-char limit
  v_table_name := left(v_table_name, 63);

  v_trigger_fn_name := v_table_name || '_to_belege_fn';
  v_trigger_name := v_table_name || '_to_belege_trg';

  -- Step 2: Create the staging table
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      rechnungsname TEXT,
      rechnungsnummer TEXT,
      rechnungstyp TEXT,
      lieferant TEXT,
      uid_lieferant TEXT,
      lieferant_iban TEXT,
      bruttobetrag DECIMAL(12,2),
      nettobetrag DECIMAL(12,2),
      mwst_satz DECIMAL(5,2),
      rechnungsdatum DATE,
      faelligkeitsdatum DATE,
      beschreibung TEXT,
      storage_path TEXT NOT NULL,
      original_filename TEXT,
      erstellt_am TIMESTAMPTZ DEFAULT NOW(),
      verarbeitet_am TIMESTAMPTZ
    )',
    v_table_name
  );

  -- Step 3: Create the trigger function that copies rows into belege
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.%I()
     RETURNS TRIGGER
     LANGUAGE plpgsql
     SECURITY DEFINER
     AS $fn$
     BEGIN
       INSERT INTO public.belege (
         mandant_id,
         rechnungsname,
         rechnungsnummer,
         rechnungstyp,
         lieferant,
         uid_lieferant,
         lieferant_iban,
         bruttobetrag,
         nettobetrag,
         mwst_satz,
         rechnungsdatum,
         faelligkeitsdatum,
         beschreibung,
         storage_path,
         original_filename,
         dateityp,
         import_quelle,
         zuordnungsstatus
       ) VALUES (
         %L::uuid,
         NEW.rechnungsname,
         NEW.rechnungsnummer,
         COALESCE(NEW.rechnungstyp, ''eingangsrechnung'')::rechnungstyp_enum,
         NEW.lieferant,
         NEW.uid_lieferant,
         NEW.lieferant_iban,
         NEW.bruttobetrag,
         NEW.nettobetrag,
         NEW.mwst_satz,
         NEW.rechnungsdatum,
         NEW.faelligkeitsdatum,
         NEW.beschreibung,
         NEW.storage_path,
         COALESCE(NEW.original_filename, ''imported.pdf''),
         ''pdf'',
         ''n8n_import''::import_quelle_enum,
         ''offen''::zuordnungsstatus
       );

       -- Mark the staging row as processed
       NEW.verarbeitet_am := NOW();
       RETURN NEW;
     END;
     $fn$',
    v_trigger_fn_name,
    p_mandant_id::text
  );

  -- Step 4: Attach the trigger BEFORE INSERT (so we can modify NEW.verarbeitet_am)
  EXECUTE format(
    'DROP TRIGGER IF EXISTS %I ON public.%I',
    v_trigger_name, v_table_name
  );
  EXECUTE format(
    'CREATE TRIGGER %I
     BEFORE INSERT ON public.%I
     FOR EACH ROW
     EXECUTE FUNCTION public.%I()',
    v_trigger_name, v_table_name, v_trigger_fn_name
  );

  -- Step 5: Enable RLS on the staging table
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table_name);

  -- Policy: Only service_role can INSERT (for n8n)
  -- service_role bypasses RLS by default, so no authenticated-user INSERT policy is needed.
  -- We explicitly deny INSERT for authenticated users by not creating an INSERT policy for them.
  -- (RLS is enabled, so without a matching policy, INSERT by authenticated users is denied.)

  -- Policy: SELECT/UPDATE allowed when user belongs to the mandant
  EXECUTE format(
    'CREATE POLICY %I ON public.%I
     FOR SELECT
     USING (%L::uuid = get_mandant_id())',
    v_table_name || '_select_policy', v_table_name, p_mandant_id::text
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I
     FOR UPDATE
     USING (%L::uuid = get_mandant_id())',
    v_table_name || '_update_policy', v_table_name, p_mandant_id::text
  );

  RETURN v_table_name;
END;
$$;
