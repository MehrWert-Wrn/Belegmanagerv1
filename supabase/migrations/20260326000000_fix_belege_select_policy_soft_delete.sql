-- Fix: PostgreSQL 17 RLS prüft ob die neue Zeile nach einem UPDATE noch via SELECT
-- sichtbar wäre. Beim Soft-Delete (geloescht_am setzen) schlug das mit dem alten
-- "geloescht_am IS NULL" Check fehl ("new row violates row-level security policy").
-- Die Filterung auf nicht-gelöschte Belege erfolgt bereits explizit in allen
-- API-Queries mit .is('geloescht_am', null).
DROP POLICY IF EXISTS "belege_select_own" ON belege;
CREATE POLICY "belege_select_own" ON belege
  FOR SELECT USING (mandant_id = get_mandant_id());
