-- =============================================================================
-- BELEGMANAGER – INITIAL SCHEMA
-- All tables, enums, functions, RLS policies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE match_status AS ENUM ('offen', 'vorgeschlagen', 'bestaetigt', 'kein_beleg');
CREATE TYPE workflow_status AS ENUM ('normal', 'rueckfrage', 'erledigt');
CREATE TYPE zahlungsquelle_typ AS ENUM ('kontoauszug', 'kassa', 'kreditkarte', 'paypal', 'sonstige');
CREATE TYPE zuordnungsstatus AS ENUM ('offen', 'zugeordnet');
CREATE TYPE monatsabschluss_status AS ENUM ('offen', 'abgeschlossen');
CREATE TYPE export_typ AS ENUM ('csv', 'zip');

-- ---------------------------------------------------------------------------
-- MANDANTEN
-- ---------------------------------------------------------------------------

CREATE TABLE mandanten (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  firmenname              TEXT NOT NULL,
  rechtsform              TEXT,
  uid_nummer              TEXT,
  strasse                 TEXT,
  plz                     TEXT,
  ort                     TEXT,
  land                    TEXT NOT NULL DEFAULT 'AT',
  geschaeftsjahr_beginn   INTEGER NOT NULL DEFAULT 1,
  onboarding_abgeschlossen BOOLEAN NOT NULL DEFAULT false,
  erstellt_am             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id)
);

ALTER TABLE mandanten ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandanten_select_own" ON mandanten
  FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "mandanten_insert_own" ON mandanten
  FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "mandanten_update_own" ON mandanten
  FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- get_mandant_id() – core RLS helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_mandant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM mandanten WHERE owner_id = auth.uid() LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- MANDANT_USERS
-- ---------------------------------------------------------------------------

CREATE TABLE mandant_users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  user_id                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email                     TEXT NOT NULL,
  rolle                     TEXT NOT NULL CHECK (rolle IN ('admin', 'buchhalter')),
  aktiv                     BOOLEAN NOT NULL DEFAULT true,
  eingeladen_am             TIMESTAMPTZ NOT NULL DEFAULT now(),
  einladung_angenommen_am   TIMESTAMPTZ,
  einladung_token           UUID DEFAULT gen_random_uuid(),
  einladung_gueltig_bis     TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  UNIQUE(mandant_id, user_id)
);

ALTER TABLE mandant_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandant_users_select" ON mandant_users
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "mandant_users_insert" ON mandant_users
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "mandant_users_update" ON mandant_users
  FOR UPDATE USING (mandant_id = get_mandant_id());

CREATE INDEX idx_mandant_users_mandant ON mandant_users(mandant_id);
CREATE INDEX idx_mandant_users_user    ON mandant_users(user_id);
CREATE INDEX idx_mandant_users_token   ON mandant_users(einladung_token);

-- Auto-seed owner as admin when a new mandant is created
CREATE OR REPLACE FUNCTION seed_mandant_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO mandant_users (mandant_id, user_id, email, rolle, einladung_angenommen_am)
  SELECT NEW.id, NEW.owner_id, u.email, 'admin', now()
  FROM auth.users u WHERE u.id = NEW.owner_id
  ON CONFLICT (mandant_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_mandant_admin
  AFTER INSERT ON mandanten
  FOR EACH ROW EXECUTE FUNCTION seed_mandant_admin();

-- get_user_rolle() – returns current user's role within their mandant
CREATE OR REPLACE FUNCTION get_user_rolle()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT mu.rolle
  FROM mandant_users mu
  JOIN mandanten m ON m.id = mu.mandant_id
  WHERE m.id = get_mandant_id()
    AND mu.user_id = auth.uid()
    AND mu.aktiv = true
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- ZAHLUNGSQUELLEN
-- ---------------------------------------------------------------------------

CREATE TABLE zahlungsquellen (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id      UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  typ             zahlungsquelle_typ NOT NULL,
  iban            TEXT,
  csv_mapping     JSONB,
  aktiv           BOOLEAN NOT NULL DEFAULT true,
  anfangssaldo    NUMERIC NOT NULL DEFAULT 0,
  anfangssaldo_gesetzt_am TIMESTAMPTZ,
  erstellt_am     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE zahlungsquellen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zahlungsquellen_select_own" ON zahlungsquellen
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "zahlungsquellen_insert_own" ON zahlungsquellen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "zahlungsquellen_update_own" ON zahlungsquellen
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "zahlungsquellen_delete_own" ON zahlungsquellen
  FOR DELETE USING (mandant_id = get_mandant_id());

-- ensure_kassa_quelle() – idempotently creates the Kassabuch source
CREATE OR REPLACE FUNCTION ensure_kassa_quelle(p_mandant_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM zahlungsquellen
  WHERE mandant_id = p_mandant_id AND typ = 'kassa' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO zahlungsquellen (mandant_id, name, typ)
    VALUES (p_mandant_id, 'Kassabuch', 'kassa')
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- BELEGE
-- ---------------------------------------------------------------------------

CREATE TABLE belege (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id        UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  storage_path      TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  dateityp          TEXT NOT NULL,
  lieferant         TEXT,
  rechnungsnummer   TEXT,
  bruttobetrag      NUMERIC,
  nettobetrag       NUMERIC,
  mwst_satz         NUMERIC,
  rechnungsdatum    DATE,
  faelligkeitsdatum DATE,
  zuordnungsstatus  zuordnungsstatus NOT NULL DEFAULT 'offen',
  geloescht_am      TIMESTAMPTZ,
  erstellt_am       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE belege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "belege_select_own" ON belege
  FOR SELECT USING (mandant_id = get_mandant_id() AND geloescht_am IS NULL);
CREATE POLICY "belege_insert_own" ON belege
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "belege_update_own" ON belege
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX idx_belege_mandant       ON belege(mandant_id);
CREATE INDEX idx_belege_status        ON belege(zuordnungsstatus);
CREATE INDEX idx_belege_rechnungsdatum ON belege(rechnungsdatum);

-- ---------------------------------------------------------------------------
-- TRANSAKTIONEN
-- ---------------------------------------------------------------------------

CREATE TABLE transaktionen (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id                UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  quelle_id                 UUID NOT NULL REFERENCES zahlungsquellen(id) ON DELETE CASCADE,
  datum                     DATE NOT NULL,
  betrag                    NUMERIC NOT NULL,
  beschreibung              TEXT,
  iban_gegenseite           TEXT,
  bic_gegenseite            TEXT,
  buchungsreferenz          TEXT,
  match_status              match_status NOT NULL DEFAULT 'offen',
  match_score               INTEGER,
  match_type                TEXT,
  beleg_id                  UUID REFERENCES belege(id) ON DELETE SET NULL,
  match_abgelehnte_beleg_ids UUID[] NOT NULL DEFAULT '{}',
  match_bestaetigt_am       TIMESTAMPTZ,
  match_bestaetigt_von      UUID REFERENCES auth.users(id),
  workflow_status           workflow_status NOT NULL DEFAULT 'normal',
  geloescht_am              TIMESTAMPTZ,
  erstellt_am               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transaktionen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transaktionen_select_own" ON transaktionen
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "transaktionen_insert_own" ON transaktionen
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "transaktionen_update_own" ON transaktionen
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX idx_transaktionen_mandant ON transaktionen(mandant_id);
CREATE INDEX idx_transaktionen_quelle  ON transaktionen(quelle_id);
CREATE INDEX idx_transaktionen_datum   ON transaktionen(datum);
CREATE INDEX idx_transaktionen_status  ON transaktionen(match_status);

-- ---------------------------------------------------------------------------
-- TRANSAKTIONS_KOMMENTARE
-- ---------------------------------------------------------------------------

CREATE TABLE transaktions_kommentare (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaktion_id UUID NOT NULL REFERENCES transaktionen(id) ON DELETE CASCADE,
  mandant_id     UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transaktions_kommentare ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mandant_kommentare_select" ON transaktions_kommentare
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "mandant_kommentare_insert" ON transaktions_kommentare
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE INDEX idx_kommentare_transaktion ON transaktions_kommentare(transaktion_id);

-- ---------------------------------------------------------------------------
-- IMPORT_PROTOKOLLE
-- ---------------------------------------------------------------------------

CREATE TABLE import_protokolle (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id        UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  quelle_id         UUID NOT NULL REFERENCES zahlungsquellen(id) ON DELETE CASCADE,
  dateiname         TEXT NOT NULL,
  importiert_am     TIMESTAMPTZ NOT NULL DEFAULT now(),
  importiert_von    UUID NOT NULL REFERENCES auth.users(id),
  anzahl_importiert INTEGER NOT NULL DEFAULT 0,
  anzahl_duplikate  INTEGER NOT NULL DEFAULT 0,
  anzahl_fehler     INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE import_protokolle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_protokolle_select_own" ON import_protokolle
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "import_protokolle_insert_own" ON import_protokolle
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

-- ---------------------------------------------------------------------------
-- MONATSABSCHLUESSE
-- ---------------------------------------------------------------------------

CREATE TABLE monatsabschluesse (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id              UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  jahr                    INTEGER NOT NULL,
  monat                   INTEGER NOT NULL,
  status                  monatsabschluss_status NOT NULL DEFAULT 'offen',
  abgeschlossen_am        TIMESTAMPTZ,
  abgeschlossen_von       UUID REFERENCES auth.users(id),
  wiedergeoeffnet_am      TIMESTAMPTZ,
  wiedergeoeffnet_von     UUID REFERENCES auth.users(id),
  datev_export_vorhanden  BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(mandant_id, jahr, monat)
);

ALTER TABLE monatsabschluesse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monatsabschluesse_select_own" ON monatsabschluesse
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "monatsabschluesse_insert_own" ON monatsabschluesse
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
CREATE POLICY "monatsabschluesse_update_own" ON monatsabschluesse
  FOR UPDATE USING (mandant_id = get_mandant_id()) WITH CHECK (mandant_id = get_mandant_id());

-- ---------------------------------------------------------------------------
-- EXPORT_PROTOKOLLE
-- ---------------------------------------------------------------------------

CREATE TABLE export_protokolle (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id            UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  jahr                  INTEGER NOT NULL,
  monat                 INTEGER NOT NULL,
  exportiert_am         TIMESTAMPTZ NOT NULL DEFAULT now(),
  exportiert_von        UUID NOT NULL REFERENCES auth.users(id),
  export_typ            export_typ NOT NULL,
  anzahl_transaktionen  INTEGER NOT NULL DEFAULT 0,
  anzahl_ohne_beleg     INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE export_protokolle ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_protokolle_select_own" ON export_protokolle
  FOR SELECT USING (mandant_id = get_mandant_id());
CREATE POLICY "export_protokolle_insert_own" ON export_protokolle
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());
