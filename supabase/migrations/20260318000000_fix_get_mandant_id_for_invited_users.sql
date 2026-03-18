-- Fix get_mandant_id() to support invited users (non-owners)
-- Previously only looked up mandant via owner_id, blocking all invited users from RLS access.
-- Now falls back to mandant_users for active invited members.

CREATE OR REPLACE FUNCTION get_mandant_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT id FROM mandanten WHERE owner_id = auth.uid() LIMIT 1),
    (SELECT mandant_id FROM mandant_users WHERE user_id = auth.uid() AND aktiv = true LIMIT 1)
  );
$$;
