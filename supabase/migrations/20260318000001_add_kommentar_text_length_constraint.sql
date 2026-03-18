-- Add missing CHECK constraint on transaktions_kommentare.text (max 500 chars)
-- Client-side validation exists but DB constraint is the authoritative guard.

ALTER TABLE transaktions_kommentare
  ADD CONSTRAINT kommentar_text_max_length CHECK (char_length(text) <= 500);
