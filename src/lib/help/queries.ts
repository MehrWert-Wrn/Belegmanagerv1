// PROJ-22: Hilfe-Center – Server-side Query Helpers
// Uses the Supabase anon client (respects RLS) for public reads,
// and the admin (service role) client for admin-only operations.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  HelpArticle,
  HelpTopic,
  HelpTopicWithArticles,
  HelpTopicWithCount,
} from './types'

// ---------------------------------------------------------------------------
// Public (RLS enforced) – used by /help reader routes
// ---------------------------------------------------------------------------

/**
 * Fetch all topics (non-deleted) plus the count of published articles.
 * Topics without any published article are filtered out unless includeEmpty=true.
 */
export async function getTopicsWithCounts(
  options: { includeEmpty?: boolean } = {},
): Promise<HelpTopicWithCount[]> {
  const supabase = await createClient()
  const { data: topics, error } = await supabase
    .from('help_topics')
    .select('id, title, slug, description, icon, sort_order, created_at')
    .is('deleted_at', null)  // Bug-013: defense-in-depth, RLS filtert bereits
    .order('sort_order', { ascending: true })
    .limit(100)

  if (error || !topics) return []

  const { data: articles } = await supabase
    .from('help_articles')
    .select('topic_id')
    .eq('status', 'published')
    .is('deleted_at', null)
    .limit(1000)

  const counts = new Map<string, number>()
  for (const a of articles || []) {
    counts.set(a.topic_id, (counts.get(a.topic_id) || 0) + 1)
  }

  const result = topics.map((t) => ({
    ...(t as HelpTopic),
    article_count: counts.get(t.id) || 0,
  }))

  if (options.includeEmpty) return result
  return result.filter((t) => t.article_count > 0)
}

export async function getTopicBySlugWithArticles(
  slug: string,
): Promise<HelpTopicWithArticles | null> {
  const supabase = await createClient()
  const { data: topic, error } = await supabase
    .from('help_topics')
    .select('id, title, slug, description, icon, sort_order, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (error || !topic) return null

  const { data: articles } = await supabase
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
    )
    .eq('topic_id', topic.id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(500)

  return {
    ...(topic as HelpTopic),
    articles: (articles || []) as HelpArticle[],
  }
}

export async function getArticleBySlugs(
  topicSlug: string,
  articleSlug: string,
): Promise<{ topic: HelpTopic; article: HelpArticle } | null> {
  const supabase = await createClient()
  const { data: topic } = await supabase
    .from('help_topics')
    .select('id, title, slug, description, icon, sort_order, created_at')
    .eq('slug', topicSlug)
    .maybeSingle()

  if (!topic) return null

  const { data: article } = await supabase
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
    )
    .eq('topic_id', topic.id)
    .eq('slug', articleSlug)
    .eq('status', 'published')
    .is('deleted_at', null)
    .maybeSingle()

  if (!article) return null

  return { topic: topic as HelpTopic, article: article as HelpArticle }
}

export async function getRelatedArticlesServer(
  article: HelpArticle,
  limit = 3,
): Promise<HelpArticle[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
    )
    .eq('topic_id', article.topic_id)
    .eq('status', 'published')
    .is('deleted_at', null)
    .neq('id', article.id)
    .order('sort_order', { ascending: true })
    .limit(limit)

  return (data || []) as HelpArticle[]
}

export async function searchArticlesServer(
  query: string,
  limit = 20,
): Promise<Array<HelpArticle & { topic_slug: string }>> {
  const q = query.trim()
  if (q.length < 2) return []

  const supabase = await createClient()

  // Bug-014 fix: search_vector ist jetzt eine Generated Column (Migration 20260415000001)
  // Bug-016 fix: nur Wortzeichen + Umlaute erlaubt, alle Sonderzeichen (():|&) werden entfernt
  const cleanWords = q
    .split(/\s+/)
    .map((w) => w.replace(/[^\w\u00C0-\u017F]/g, ''))
    .filter((w) => w.length >= 2)

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
    const { help_topics: _ht, ...rest } = row as unknown as HelpArticle & {
      help_topics: { slug: string }
    }
    return {
      ...(rest as HelpArticle),
      topic_slug: topicData?.slug ?? '',
    }
  })
}

// ---------------------------------------------------------------------------
// Admin (service role – bypasses RLS) – used by /admin/help routes
// ---------------------------------------------------------------------------

export async function adminGetAllTopics(): Promise<HelpTopicWithCount[]> {
  const admin = createAdminClient()
  const { data: topics } = await admin
    .from('help_topics')
    .select('id, title, slug, description, icon, sort_order, created_at')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .limit(200)

  const { data: articles } = await admin
    .from('help_articles')
    .select('topic_id')
    .is('deleted_at', null)
    .limit(5000)

  const counts = new Map<string, number>()
  for (const a of articles || []) {
    counts.set(a.topic_id, (counts.get(a.topic_id) || 0) + 1)
  }

  return (topics || []).map((t) => ({
    ...(t as HelpTopic),
    article_count: counts.get(t.id) || 0,
  }))
}

export async function adminGetAllArticles(): Promise<HelpArticle[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
    )
    .is('deleted_at', null)
    .order('topic_id', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(1000)

  return (data || []) as HelpArticle[]
}

export async function adminGetArticleById(id: string): Promise<HelpArticle | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('help_articles')
    .select(
      'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
    )
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  return (data as HelpArticle | null) ?? null
}
