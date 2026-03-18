-- Add name column to mandant_users for display in user list (BUG-PROJ12-004)
ALTER TABLE mandant_users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
