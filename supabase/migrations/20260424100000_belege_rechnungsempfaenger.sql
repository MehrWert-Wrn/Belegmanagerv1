-- Add rechnungsempfaenger field to belege for Ausgangsrechnung matching
ALTER TABLE belege ADD COLUMN IF NOT EXISTS rechnungsempfaenger text;
