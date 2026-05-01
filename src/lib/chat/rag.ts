// PROJ-23: KI-Chatbot – RAG via PostgreSQL Full-Text Search
//
// Strategy: reuse the existing help_articles search_vector (German FTS).
// No pgvector / embedding cost in Phase 1.

import { createClient } from '@/lib/supabase/server'
import type { HelpArticle } from '@/lib/help/types'

export interface RagArticleSnippet {
  id: string
  title: string
  summary: string
  /** Plain-text content (HTML stripped, truncated for context window) */
  content_excerpt: string
  /** Reader URL: /help/[topic-slug]/[article-slug] */
  url: string
}

/**
 * Strip HTML tags and decode common entities to plain text.
 * Sufficient for help-article HTML (rendered via tiptap, sanitized server-side).
 */
function htmlToPlainText(html: string): string {
  if (!html) return ''
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Truncate plain text to a maximum number of characters at a word boundary.
 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const lastSpace = slice.lastIndexOf(' ')
  return (lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice) + '...'
}

/**
 * Search published help articles via FTS and return up to {limit} snippets
 * for use as RAG context in the chatbot system prompt.
 */
export async function searchHelpArticlesForRag(
  query: string,
  limit = 3,
): Promise<RagArticleSnippet[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = await createClient()

  // Same sanitization pattern as /api/help/search – only word chars + umlauts,
  // join with `&` for AND-search, prefix-match with `:*`.
  const cleanWords = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\wÀ-ſ]/g, ''))
    .filter((w) => w.length >= 2)
    .slice(0, 8) // cap word count to avoid overly long FTS queries

  if (cleanWords.length === 0) return []

  const ftsQuery = cleanWords.map((w) => `${w}:*`).join(' & ')

  const { data, error } = await supabase
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at, help_topics!inner(slug)',
    )
    .eq('status', 'published')
    .is('deleted_at', null)
    .textSearch('search_vector', ftsQuery, { config: 'german', type: 'websearch' })
    .limit(limit)

  if (error || !data) return []

  return data.map((row) => {
    const topicData = (row as unknown as { help_topics: { slug: string } }).help_topics
    const article = row as unknown as HelpArticle
    const plain = htmlToPlainText(article.content_html ?? '')
    return {
      id: article.id,
      title: article.title,
      summary: article.summary ?? '',
      content_excerpt: truncate(plain, 1200),
      url: `/help/${topicData?.slug ?? ''}/${article.slug}`,
    }
  })
}

/**
 * Build the RAG context section for the system prompt.
 * Returns an empty string if no relevant articles were found.
 */
export function formatArticlesForPrompt(articles: RagArticleSnippet[]): string {
  if (articles.length === 0) return ''
  const sections = articles.map(
    (a, i) => `--- Artikel ${i + 1}: "${a.title}" (URL: ${a.url}) ---
${a.summary ? `Zusammenfassung: ${a.summary}\n` : ''}Inhalt: ${a.content_excerpt}`,
  )
  return `Relevante Artikel aus dem Hilfe-Center:\n\n${sections.join('\n\n')}`
}
