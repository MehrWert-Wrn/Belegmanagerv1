-- PROJ-22 Bug-014: search_vector als Generated Column hinzufügen
-- textSearch('search_vector', …) in Supabase JS benötigt eine echte Spalte,
-- keine Expression-Index. Diese Migration fügt die Spalte als GENERATED ALWAYS AS STORED an.

-- 1. Alte Expression-Index entfernen (wird durch Column-Index ersetzt)
DROP INDEX IF EXISTS public.idx_help_articles_search;

-- 2. Generated Column anlegen
ALTER TABLE public.help_articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'german',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(content_html, '')
    )
  ) STORED;

-- 3. GIN-Index auf der neuen Spalte (für schnelle textSearch-Queries)
CREATE INDEX IF NOT EXISTS idx_help_articles_search_vector
  ON public.help_articles
  USING GIN(search_vector);
