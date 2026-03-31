-- Add faelligkeit_bezahlt flag to belege
-- Used to mark a beleg as "bezahlt/ignorieren" so overdue highlighting is suppressed
-- even if no transaction match exists yet.

ALTER TABLE belege
  ADD COLUMN IF NOT EXISTS faelligkeit_bezahlt BOOLEAN NOT NULL DEFAULT FALSE;
