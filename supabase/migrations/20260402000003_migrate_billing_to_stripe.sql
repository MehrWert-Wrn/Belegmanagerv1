-- PROJ-16: Migrate billing tables from GoCardless to Stripe

ALTER TABLE billing_subscriptions
  DROP COLUMN IF EXISTS gc_mandate_id,
  DROP COLUMN IF EXISTS gc_subscription_id,
  DROP COLUMN IF EXISTS gc_customer_id,
  DROP COLUMN IF EXISTS gc_billing_request_id,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_stripe_customer_id_unique
  ON billing_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_stripe_subscription_id_unique
  ON billing_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE billing_payments
  DROP COLUMN IF EXISTS gc_payment_id,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;
