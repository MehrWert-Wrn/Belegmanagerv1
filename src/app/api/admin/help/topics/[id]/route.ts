import { NextResponse } from 'next/server'
import { z } from 'zod'
import slugify from 'slugify'
import { verifyAdmin } from '@/lib/admin-context'
import { createAdminClient } from '@/lib/supabase/admin'

const topicUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  slug: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  icon: z.string().trim().min(1).max(60).optional(),
  sort_order: z.number().int().min(0).max(1000).optional(),
})

// PUT /api/admin/help/topics/[id] – Thema aktualisieren
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

  const parsed = topicUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const update: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.slug) {
    update.slug = slugify(parsed.data.slug, { lower: true, strict: true })
  } else if (parsed.data.title && !parsed.data.slug) {
    // nur bei explizitem Slug ueberschreiben
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('help_topics')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Ein Thema mit diesem Slug existiert bereits.' },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[admin/help/topics/:id] PUT error:', error)
    return NextResponse.json(
      { error: 'Thema konnte nicht aktualisiert werden.' },
      { status: 500 },
    )
  }
}

// DELETE /api/admin/help/topics/[id] – Thema soft-deleten (Artikel bleiben erhalten,
// werden aber durch ON DELETE CASCADE bei echtem Delete entfernt → hier soft-delete)
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
      .from('help_topics')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[admin/help/topics/:id] DELETE error:', error)
    return NextResponse.json(
      { error: 'Thema konnte nicht gelöscht werden.' },
      { status: 500 },
    )
  }
}
