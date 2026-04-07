-- PROJ-16 BUG-009: Set trial_ends_at to 23:59:59 UTC on day 30 (not exact creation time)
-- Prevents early expiry when mandant is created mid-day

CREATE OR REPLACE FUNCTION set_trial_ends_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    -- End of day (23:59:59 UTC) on the 30th day from today
    NEW.trial_ends_at := date_trunc('day', NOW() AT TIME ZONE 'UTC') + INTERVAL '30 days' + INTERVAL '23 hours 59 minutes 59 seconds';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
