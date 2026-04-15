-- PROJ-22 Bug-004: UNIQUE-Constraint auf help_article_feedback (article_id, user_id)
-- Verhindert Feedback-Spam: ein User kann pro Artikel nur einmal bewerten.
-- Bestehende Duplikate werden vorher bereinigt (neueste Bewertung bleibt erhalten).

-- 1. Duplikate entfernen: pro (article_id, user_id) den ältesten Eintrag löschen
DELETE FROM public.help_article_feedback
WHERE id NOT IN (
  SELECT DISTINCT ON (article_id, user_id) id
  FROM public.help_article_feedback
  ORDER BY article_id, user_id, created_at DESC
);

-- 2. UNIQUE-Constraint anlegen
ALTER TABLE public.help_article_feedback
  ADD CONSTRAINT help_article_feedback_article_user_unique
  UNIQUE (article_id, user_id);
