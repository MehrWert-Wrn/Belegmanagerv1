-- PROJ-31: Eigenverbrauch Rechnungstyp
-- Adds eigenverbrauch as a distinct receipt type for employee/owner consumption
-- (different from eigenbeleg which is a replacement for lost receipts)

ALTER TYPE rechnungstyp_enum ADD VALUE IF NOT EXISTS 'eigenverbrauch';
