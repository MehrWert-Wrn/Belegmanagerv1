-- Add file_hash for duplicate detection (SHA-256, computed client-side)
ALTER TABLE belege ADD COLUMN IF NOT EXISTS file_hash TEXT;
CREATE INDEX IF NOT EXISTS belege_mandant_file_hash_idx ON belege (mandant_id, file_hash) WHERE file_hash IS NOT NULL AND geloescht_am IS NULL;
