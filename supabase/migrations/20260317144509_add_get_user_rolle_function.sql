-- Helper: get current user's role in their mandant
CREATE OR REPLACE FUNCTION get_user_rolle()
RETURNS TEXT AS $$
  SELECT mu.rolle
  FROM mandant_users mu
  JOIN mandanten m ON m.id = mu.mandant_id
  WHERE m.id = get_mandant_id()
    AND mu.user_id = auth.uid()
    AND mu.aktiv = true
  LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;
