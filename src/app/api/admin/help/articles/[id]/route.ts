import { NextResponse } from 'next/server'
import { z } from 'zod'
import slugify from 'slugify'
import { verifyAdmin } from '@/lib/admin-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeArticleHtml, estimateReadTimeMinutes } from '@/lib/help/sanitize'
import { adminGetArticleById } from '@/lib/help/queries'

const articleUpdateSchema = z.object({
  topic_id: z.string().min(1).optional(),
  title: z.string().trim().min(2).max(200).optional(),
  slug: z.string().trim().min(2).max(200).optional(),
  summary: z.string().max(1000).optional(),
  content_html: z.string().optional(),
  status: z.enum(['draft', 'published']).optional(),
  video_url: z.string().url().max(500).nullable().optional(),
  video_storage_path: z.string().max(500).nullable().optional(),
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

// GET /api/admin/help/articles/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const article = await adminGetArticleById(id)
  if (!article) {
    return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 })
  }
  return NextResponse.json(article)
}

// PUT /api/admin/help/articles/[id] – Artikel aktualisieren
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = articleUpdateSchema.safeParse(body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const fieldMessages = Object.entries(flat.fieldErrors)
      .map(([f, msgs]) => `${f}: ${(msgs ?? []).join(', ')}`)
      .join('; ')
    const msg = fieldMessages || flat.formErrors.join('; ') || 'Unbekanntes Feld'
    console.error('[admin/help/articles/:id] Zod validation failed:', JSON.stringify(flat, null, 2))
    return NextResponse.json(
      { error: `Ungültige Daten – ${msg}`, details: flat },
      { status: 400 },
    )
  }

  if (parsed.data.video_url !== undefined && !validateYoutubeUrl(parsed.data.video_url)) {
    return NextResponse.json({ error: 'Ungültige YouTube-URL.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { ...parsed.data }

  if (parsed.data.slug) {
    update.slug = slugify(parsed.data.slug, { lower: true, strict: true })
  }

  if (parsed.data.content_html !== undefined) {
    const sanitized = sanitizeArticleHtml(parsed.data.content_html)
    update.content_html = sanitized
    update.read_time_minutes = estimateReadTimeMinutes(sanitized)
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('help_articles')
      .update(update)
      .eq('id', id)
      .is('deleted_at', null)
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

    if (!data) {
      return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[admin/help/articles/:id] PUT error:', error)
    return NextResponse.json(
      { error: 'Artikel konnte nicht aktualisiert werden.' },
      { status: 500 },
    )
  }
}

// DELETE /api/admin/help/articles/[id] – Soft-Delete
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('help_articles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/help/articles/:id] DELETE error:', error)
    return NextResponse.json(
      { error: 'Artikel konnte nicht gelöscht werden.' },
      { status: 500 },
    )
  }
}
