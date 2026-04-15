-- =============================================================================
-- PROJ-21: Backfill – onboarding_progress für alle bestehenden Mandanten
-- Fügt für jeden Mandanten ohne Eintrag eine leere Fortschrittszeile ein,
-- damit die Onboarding-Checkliste auch für Bestands-Mandanten erscheint.
-- =============================================================================

INSERT INTO onboarding_progress (mandant_id)
SELECT id
FROM mandanten
WHERE id NOT IN (SELECT mandant_id FROM onboarding_progress)
ON CONFLICT (mandant_id) DO NOTHING;
