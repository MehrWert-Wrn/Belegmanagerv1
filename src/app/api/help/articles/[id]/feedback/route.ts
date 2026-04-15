import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const feedbackSchema = z.object({
  rating: z.enum(['helpful', 'not_helpful']),
})

// POST /api/help/articles/[id]/feedback – User-Feedback (Daumen hoch/runter)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ungültige Artikel-ID.' }, { status: 400 })
  }

  // Auth Pruefung
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  // Input-Validierung
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body.' }, { status: 400 })
  }

  const parsed = feedbackSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Daten.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const admin = createAdminClient()

    // Artikel muss existieren und published sein
    const { data: article } = await admin
      .from('help_articles')
      .select('id, status, deleted_at')
      .eq('id', id)
      .maybeSingle()

    if (!article || article.status !== 'published' || article.deleted_at) {
      return NextResponse.json(
        { error: 'Artikel nicht gefunden.' },
        { status: 404 },
      )
    }

    // Bug-004 fix: Upsert statt Insert – verhindert Duplikate (UNIQUE article_id, user_id)
    const { error } = await admin
      .from('help_article_feedback')
      .upsert(
        { article_id: id, user_id: user.id, rating: parsed.data.rating },
        { onConflict: 'article_id,user_id' },
      )

    if (error) {
      console.error('[help/feedback] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[help/feedback] POST error:', error)
    return NextResponse.json(
      { error: 'Feedback konnte nicht gespeichert werden.' },
      { status: 500 },
    )
  }
}
