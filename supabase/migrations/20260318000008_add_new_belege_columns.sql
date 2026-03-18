-- PROJ-3: Add new columns and ENUMs to belege table for enhanced Belegverwaltung

-- ---------------------------------------------------------------------------
-- NEW ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE rechnungstyp_enum AS ENUM ('eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges');
CREATE TYPE import_quelle_enum AS ENUM ('manuell', 'n8n_import');

-- ---------------------------------------------------------------------------
-- NEW COLUMNS on belege
-- ---------------------------------------------------------------------------

ALTER TABLE belege ADD COLUMN IF NOT EXISTS rechnungsname TEXT;
ALTER TABLE belege ADD COLUMN IF NOT EXISTS rechnungstyp rechnungstyp_enum NOT NULL DEFAULT 'eingangsrechnung';
ALTER TABLE belege ADD COLUMN IF NOT EXISTS uid_lieferant TEXT;
ALTER TABLE belege ADD COLUMN IF NOT EXISTS beschreibung TEXT;
ALTER TABLE belege ADD COLUMN IF NOT EXISTS import_quelle import_quelle_enum NOT NULL DEFAULT 'manuell';

-- Check constraint: beschreibung max 100 characters
ALTER TABLE belege ADD CONSTRAINT belege_beschreibung_max_length CHECK (LENGTH(beschreibung) <= 100);

-- Index on rechnungstyp for filter performance
CREATE INDEX IF NOT EXISTS idx_belege_rechnungstyp ON belege(rechnungstyp);
