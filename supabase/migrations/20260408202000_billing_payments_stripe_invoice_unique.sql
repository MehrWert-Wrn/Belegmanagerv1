-- BUG-004: billing_payments idempotent for duplicate Stripe webhooks
ALTER TABLE billing_payments
  ADD CONSTRAINT billing_payments_stripe_invoice_id_unique
  UNIQUE (stripe_invoice_id)
  DEFERRABLE INITIALLY DEFERRED;
