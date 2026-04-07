-- PROJ-16 BUG-010/011: Restrict billing_subscriptions INSERT/UPDATE to owner/admin only
-- Buchhalter-Rolle darf keine Abo-Verwaltung durchführen

DROP POLICY IF EXISTS "billing_subscriptions_insert" ON billing_subscriptions;
DROP POLICY IF EXISTS "billing_subscriptions_update" ON billing_subscriptions;

-- Only mandate owners and admin-role mandant_users may create subscriptions
CREATE POLICY "billing_subscriptions_insert" ON billing_subscriptions
  FOR INSERT WITH CHECK (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users
        WHERE user_id = auth.uid() AND aktiv = true AND rolle = 'admin'
    )
  );

-- Only mandate owners and admin-role mandant_users may update subscriptions
CREATE POLICY "billing_subscriptions_update" ON billing_subscriptions
  FOR UPDATE USING (
    mandant_id IN (
      SELECT id FROM mandanten WHERE owner_id = auth.uid()
      UNION
      SELECT mandant_id FROM mandant_users
        WHERE user_id = auth.uid() AND aktiv = true AND rolle = 'admin'
    )
  );
