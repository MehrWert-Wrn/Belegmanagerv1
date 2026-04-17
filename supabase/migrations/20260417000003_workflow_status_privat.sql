-- PROJ-25 Migration 4: Extend workflow_status enum to include 'privat'
-- workflow_status is a PostgreSQL native ENUM type
ALTER TYPE workflow_status ADD VALUE IF NOT EXISTS 'privat';
