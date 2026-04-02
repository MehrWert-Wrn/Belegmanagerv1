-- PROJ-17: Add EIGENBELEG to transaktionen match_type constraint

ALTER TABLE transaktionen DROP CONSTRAINT transaktionen_match_type_check;
ALTER TABLE transaktionen ADD CONSTRAINT transaktionen_match_type_check
  CHECK (match_type = ANY (ARRAY['RN_MATCH','SEPA_MATCH','IBAN_GUARDED','PAYPAL_ID_MATCH','SCORE','MANUAL','EIGENBELEG']));
