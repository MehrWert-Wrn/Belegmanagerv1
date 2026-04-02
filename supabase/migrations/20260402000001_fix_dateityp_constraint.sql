-- PROJ-17: Allow 'eigenbeleg' as dateityp in belege table
-- Eigenbelege have no physical file, so dateityp is set to 'eigenbeleg' as a marker.

ALTER TABLE belege DROP CONSTRAINT belege_dateityp_check;
ALTER TABLE belege ADD CONSTRAINT belege_dateityp_check
  CHECK (dateityp = ANY (ARRAY['pdf','jpg','jpeg','png','eigenbeleg']));
