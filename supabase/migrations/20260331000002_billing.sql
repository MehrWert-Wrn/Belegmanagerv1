-- PROJ-16: SaaS-Billing via GoCardless
-- Adds trial period, billing tables, and access control foundation

-- 1. Add trial_ends_at to mandanten
ALTER TABLE mandanten ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Backfill existing mandanten (30 days from creation)
UPDATE mandanten SET trial_ends_at = erstellt_am + INTERVAL '30 days' WHERE trial_ends_at IS NULL;

-- Trigger: auto-set trial_ends_at on new mandanten
CREATE OR REPLACE FUNCTION set_trial_ends_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mandanten_set_trial_ends_at ON mandanten;
CREATE TRIGGER mandanten_set_trial_ends_at
  BEFORE INSERT ON mandanten
  FOR EACH ROW EXECUTE FUNCTION set_trial_ends_at();

-- 2. billing_plans
CREATE TABLE IF NOT EXISTS billing_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  amount_cents    integer NOT NULL,
  currency        text NOT NULL DEFAULT 'EUR',
  interval        text NOT NULL DEFAULT 'monthly',
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Seed: single plan
INSERT INTO billing_plans (name, amount_cents, currency, interval)
VALUES ('Belegmanager', 2900, 'EUR', 'monthly')
ON CONFLICT DO NOTHING;

-- 3. billing_subscriptions
CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id            uuid NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  plan_id               uuid REFERENCES billing_plans(id),
  status                text NOT NULL DEFAULT 'pending_mandate',
  -- valid: pending_mandate | active | payment_failed | cancelled | paused
  gc_mandate_id         text,
  gc_subscription_id    text,
  gc_customer_id        text,
  gc_billing_request_id text,
  current_period_end    date,
  payment_failed_at     timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_subscriptions_mandant_id_idx ON billing_subscriptions(mandant_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_gc_billing_request_id_idx ON billing_subscriptions(gc_billing_request_id);
CREATE INDEX IF NOT EXISTS billing_subscriptions_gc_subscription_id_idx ON billing_subscriptions(gc_subscription_id);

-- 4. billing_payments
CREATE TABLE IF NOT EXISTS billing_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandant_id      uuid NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES billing_subscriptions(id),
  gc_payment_id   text UNIQUE NOT NULL,
  amount_cents    integer NOT NULL,
  currency        text NOT NULL DEFAULT 'EUR',
  status          text NOT NULL DEFAULT 'pending',
  -- valid: pending | confirmed | paid_out | failed | cancelled
  charge_date     date,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_payments_mandant_id_idx ON billing_payments(mandant_id);
CREATE INDEX IF NOT EXISTS billing_payments_subscription_id_idx ON billing_payments(subscription_id);

-- 5. RLS
ALTER TABLE billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;

-- billing_plans: anyone authenticated can read active plans
CREATE POLICY "billing_plans_select" ON billing_plans
  FOR SELECT TO authenticated
  USING (active = true);

-- billing_subscriptions: mandant sees only their own
CREATE POLICY "billing_subscriptions_select" ON billing_subscriptions
  FOR SELECT USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

CREATE POLICY "billing_subscriptions_insert" ON billing_subscriptions
  FOR INSERT WITH CHECK (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

CREATE POLICY "billing_subscriptions_update" ON billing_subscriptions
  FOR UPDATE USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );

-- billing_payments: same
CREATE POLICY "billing_payments_select" ON billing_payments
  FOR SELECT USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true
    )
  );
