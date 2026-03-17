-- mandant_users table
CREATE TABLE mandant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  rolle TEXT NOT NULL CHECK (rolle IN ('admin', 'buchhalter')),
  aktiv BOOLEAN NOT NULL DEFAULT true,
  eingeladen_am TIMESTAMPTZ NOT NULL DEFAULT now(),
  einladung_angenommen_am TIMESTAMPTZ,
  einladung_token UUID DEFAULT gen_random_uuid(),
  einladung_gueltig_bis TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  UNIQUE(mandant_id, user_id)
);

ALTER TABLE mandant_users ENABLE ROW LEVEL SECURITY;

-- Only mandant members can see users of their mandant
CREATE POLICY "mandant_users_select" ON mandant_users
  FOR SELECT USING (mandant_id = get_mandant_id());

-- Only admins can insert (enforced at API level, RLS just scopes to mandant)
CREATE POLICY "mandant_users_insert" ON mandant_users
  FOR INSERT WITH CHECK (mandant_id = get_mandant_id());

CREATE POLICY "mandant_users_update" ON mandant_users
  FOR UPDATE USING (mandant_id = get_mandant_id());

-- Seed existing mandant owners as admins
INSERT INTO mandant_users (mandant_id, user_id, email, rolle, einladung_angenommen_am)
SELECT
  m.id,
  m.owner_id,
  u.email,
  'admin',
  now()
FROM mandanten m
JOIN auth.users u ON u.id = m.owner_id
ON CONFLICT (mandant_id, user_id) DO NOTHING;

-- Auto-seed trigger for new mandants
CREATE OR REPLACE FUNCTION seed_mandant_admin()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO mandant_users (mandant_id, user_id, email, rolle, einladung_angenommen_am)
  SELECT NEW.id, NEW.owner_id, u.email, 'admin', now()
  FROM auth.users u WHERE u.id = NEW.owner_id
  ON CONFLICT (mandant_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_seed_mandant_admin
  AFTER INSERT ON mandanten
  FOR EACH ROW EXECUTE FUNCTION seed_mandant_admin();

CREATE INDEX idx_mandant_users_mandant ON mandant_users(mandant_id);
CREATE INDEX idx_mandant_users_user ON mandant_users(user_id);
CREATE INDEX idx_mandant_users_token ON mandant_users(einladung_token);
