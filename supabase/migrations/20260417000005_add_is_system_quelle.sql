-- Add is_system_quelle column to zahlungsquellen
-- Used to mark system-generated sources like "Direkt bezahlt" (DIR)
-- that should not appear in the regular UI source list.

ALTER TABLE zahlungsquellen
  ADD COLUMN is_system_quelle BOOLEAN NOT NULL DEFAULT false;

-- Each mandant can have at most one system source
CREATE UNIQUE INDEX uq_zahlungsquellen_system_per_mandant
  ON zahlungsquellen (mandant_id)
  WHERE is_system_quelle = true;

-- Index for filtering system sources in queries
CREATE INDEX idx_zahlungsquellen_is_system
  ON zahlungsquellen (is_system_quelle);
