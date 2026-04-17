-- PROJ-25: Add UNIQUE constraint on (mandant_id, kuerzel) for zahlungsquellen
-- Prevents duplicate kuerzel per mandant (e.g. two sources both named "B1")
-- Auto-generation logic avoids duplicates on creation, but manual edits require DB enforcement

ALTER TABLE zahlungsquellen
  ADD CONSTRAINT zahlungsquellen_mandant_kuerzel_unique UNIQUE (mandant_id, kuerzel);
