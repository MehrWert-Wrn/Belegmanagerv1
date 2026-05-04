-- PROJ-9: Belegliste-Export
-- Erweitert das export_typ ENUM um den Wert 'belegliste'.
-- Damit kann der Belegliste-Export (PDF + CSV im ZIP) im export_protokolle
-- vom Buchhaltungsuebergabe-Export ('csv'/'zip') unterschieden werden.

ALTER TYPE export_typ ADD VALUE IF NOT EXISTS 'belegliste';

COMMENT ON TYPE export_typ IS
  'Export-Typ fuer export_protokolle: csv = Buchhaltungsuebergabe-CSV, zip = Buchhaltungsuebergabe-ZIP, belegliste = Belegliste (CSV oder ZIP).';
