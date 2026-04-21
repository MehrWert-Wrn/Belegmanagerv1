-- PROJ-9: Buchhaltungsübergabe-Export (ersetzt DATEV-Export)
-- Umbenennen: monatsabschluesse.datev_export_vorhanden -> export_vorhanden
-- Grund: Der Export ist ein allgemeiner Buchhaltungsübergabe-Export (BMD/RZL/Sage),
-- nicht mehr DATEV-spezifisch.

ALTER TABLE monatsabschluesse
  RENAME COLUMN datev_export_vorhanden TO export_vorhanden;

COMMENT ON COLUMN monatsabschluesse.export_vorhanden IS
  'true sobald mindestens ein Buchhaltungsübergabe-Export für diesen Monat erstellt wurde';
