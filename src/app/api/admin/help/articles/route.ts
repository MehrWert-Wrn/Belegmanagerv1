import { NextResponse } from 'next/server'
import { z } from 'zod'
import slugify from 'slugify'
import { verifyAdmin } from '@/lib/admin-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeArticleHtml, estimateReadTimeMinutes } from '@/lib/help/sanitize'
import { adminGetAllArticles } from '@/lib/help/queries'

const articleCreateSchema = z.object({
  topic_id: z.string().min(1),
  title: z.string().trim().min(2).max(200),
  slug: z.string().trim().min(2).max(200).optional(),
  summary: z.string().max(1000).optional().default(''),
  content_html: z.string().max(200_000).optional().default(''),
  status: z.enum(['draft', 'published']).optional().default('draft'),
  video_url: z.string().url().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
})

function validateYoutubeUrl(url: string | null | undefined): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return (
      u.hostname.includes('youtube.com') ||
      u.hostname === 'youtu.be' ||
      u.hostname === 'www.youtube-nocookie.com'
    )
  } catch {
    return false
  }
}

// GET /api/admin/help/articles – Admin-Liste aller Artikel (inkl. Entwuerfe)
export async function GET() {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const articles = await adminGetAllArticles()
    return NextResponse.json(articles)
  } catch (error) {
    console.error('[admin/help/articles] GET error:', error)
    return NextResponse.json(
      { error: 'Artikel konnten nicht geladen werden.' },
      { status: 500 },
    )
  }
}

// POST /api/admin/help/articles – Neuen Artikel anlegen
export async function POST(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = articleCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  if (!validateYoutubeUrl(parsed.data.video_url ?? null)) {
    return NextResponse.json(
      { error: 'Ungültige YouTube-URL.' },
      { status: 400 },
    )
  }

  const sanitized = sanitizeArticleHtml(parsed.data.content_html)
  const readTime = estimateReadTimeMinutes(sanitized)
  const slug = (
    parsed.data.slug || slugify(parsed.data.title, { lower: true, strict: true })
  ).trim()

  try {
    const admin = createAdminClient()

    // Default sort_order: ans Ende
    let sortOrder = parsed.data.sort_order
    if (sortOrder === undefined) {
      const { data: max } = await admin
        .from('help_articles')
        .select('sort_order')
        .eq('topic_id', parsed.data.topic_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      sortOrder = ((max?.sort_order as number | undefined) ?? 0) + 1
    }

    const { data, error } = await admin
      .from('help_articles')
      .insert({
        topic_id: parsed.data.topic_id,
        title: parsed.data.title,
        slug,
        summary: parsed.data.summary,
        content_html: sanitized,
        status: parsed.data.status,
        video_url: parsed.data.video_url ?? null,
        sort_order: sortOrder,
        read_time_minutes: readTime,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ein Artikel mit diesem Slug existiert bereits in diesem Thema.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[admin/help/articles] POST error:', error)
    return NextResponse.json(
      { error: 'Artikel konnte nicht angelegt werden.' },
      { status: 500 },
    )
  }
}
