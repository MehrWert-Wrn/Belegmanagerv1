-- PROJ-19: Admin Panel
-- Adds profiles table with is_admin, admin audit log, support tickets, billing override columns

-- ---------------------------------------------------------------------------
-- 1. PROFILES table (links to auth.users, stores is_admin flag)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile (but NOT is_admin – column-level lock)
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid() AND
    is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Users can insert their own profile on signup
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Index for admin lookups
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON profiles(is_admin) WHERE is_admin = true;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Backfill profiles for existing users
INSERT INTO profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. ADMIN_AUDIT_LOG (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  mandant_id  UUID REFERENCES mandanten(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'impersonation_start', 'impersonation_stop',
    'override_set', 'override_removed',
    'ticket_status_change', 'ticket_assignment'
  )),
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can only INSERT (append-only). No SELECT/UPDATE/DELETE via RLS for normal users.
-- Service role is used for all reads.
CREATE POLICY "admin_audit_log_insert_admin" ON admin_audit_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- No SELECT, UPDATE, DELETE policies = truly append-only for authenticated users.
-- Service role bypasses RLS for admin reads.

CREATE INDEX IF NOT EXISTS admin_audit_log_admin_id_idx ON admin_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_mandant_id_idx ON admin_audit_log(mandant_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON admin_audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. SUPPORT_TICKETS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS support_tickets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id            UUID NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  subject               TEXT NOT NULL CHECK (char_length(subject) >= 3 AND char_length(subject) <= 200),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  assigned_to_admin_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Mandant sees only their own tickets
CREATE POLICY "support_tickets_select_own" ON support_tickets
  FOR SELECT USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

CREATE POLICY "support_tickets_insert_own" ON support_tickets
  FOR INSERT WITH CHECK (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

-- Mandant can update their own tickets (e.g., reopen by posting message)
CREATE POLICY "support_tickets_update_own" ON support_tickets
  FOR UPDATE USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

-- No DELETE for mandants

CREATE INDEX IF NOT EXISTS support_tickets_mandant_id_idx ON support_tickets(mandant_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON support_tickets(assigned_to_admin_id);
CREATE INDEX IF NOT EXISTS support_tickets_created_at_idx ON support_tickets(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. SUPPORT_TICKET_MESSAGES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('mandant', 'admin')),
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  message     TEXT NOT NULL CHECK (char_length(message) >= 1 AND char_length(message) <= 5000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Mandant sees messages for their own tickets
CREATE POLICY "support_ticket_messages_select_own" ON support_ticket_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT st.id FROM support_tickets st
      WHERE st.mandant_id IN (
        SELECT id FROM mandanten WHERE owner_id = auth.uid()
        UNION
        SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
      )
    )
  );

CREATE POLICY "support_ticket_messages_insert_own" ON support_ticket_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    ticket_id IN (
      SELECT st.id FROM support_tickets st
      WHERE st.mandant_id IN (
        SELECT id FROM mandanten WHERE owner_id = auth.uid()
        UNION
        SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
      )
    )
  );

-- No UPDATE/DELETE for mandants

CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_id_idx ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS support_ticket_messages_created_at_idx ON support_ticket_messages(created_at);

-- ---------------------------------------------------------------------------
-- 5. BILLING OVERRIDE columns
-- ---------------------------------------------------------------------------

ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS admin_override_type TEXT CHECK (admin_override_type IN ('permanent', 'until_date')),
  ADD COLUMN IF NOT EXISTS admin_override_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 6. Updated_at trigger for support_tickets
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_tickets_updated_at ON support_tickets;
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_support_ticket_updated_at();

-- Also update parent ticket's updated_at when a message is added
CREATE OR REPLACE FUNCTION update_ticket_on_new_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS support_ticket_messages_update_ticket ON support_ticket_messages;
CREATE TRIGGER support_ticket_messages_update_ticket
  AFTER INSERT ON support_ticket_messages
  FOR EACH ROW EXECUTE FUNCTION update_ticket_on_new_message();
