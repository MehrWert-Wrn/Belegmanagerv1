import { NextResponse } from 'next/server'
import { z } from 'zod'
import slugify from 'slugify'
import { verifyAdmin } from '@/lib/admin-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { adminGetAllTopics } from '@/lib/help/queries'

const topicCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(120).optional(),
  description: z.string().max(500).optional().default(''),
  icon: z.string().trim().min(1).max(60).optional().default('HelpCircle'),
  sort_order: z.number().int().min(0).max(1000).optional(),
})

// GET /api/admin/help/topics – Admin-Liste (inkl. leere Themen)
export async function GET() {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const topics = await adminGetAllTopics()
    return NextResponse.json(topics)
  } catch (error) {
    console.error('[admin/help/topics] GET error:', error)
    return NextResponse.json(
      { error: 'Themen konnten nicht geladen werden.' },
      { status: 500 },
    )
  }
}

// POST /api/admin/help/topics – Neues Thema anlegen
export async function POST(request: Request) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = topicCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const slug = (
    parsed.data.slug || slugify(parsed.data.title, { lower: true, strict: true })
  ).trim()

  if (!slug) {
    return NextResponse.json({ error: 'Ungültiger Slug.' }, { status: 400 })
  }

  try {
    const adminClient = createAdminClient()

    // Max sort_order fuer Default
    let sortOrder = parsed.data.sort_order
    if (sortOrder === undefined) {
      const { data: max } = await adminClient
        .from('help_topics')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()
      sortOrder = ((max?.sort_order as number | undefined) ?? 0) + 1
    }

    const { data, error } = await adminClient
      .from('help_topics')
      .insert({
        title: parsed.data.title,
        slug,
        description: parsed.data.description,
        icon: parsed.data.icon,
        sort_order: sortOrder,
      })
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

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[admin/help/topics] POST error:', error)
    return NextResponse.json(
      { error: 'Thema konnte nicht angelegt werden.' },
      { status: 500 },
    )
  }
}
