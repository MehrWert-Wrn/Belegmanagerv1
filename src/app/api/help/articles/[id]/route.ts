import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/help/articles/[id] – Einzelner publizierter Artikel per ID
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ungültige ID.' }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('help_articles')
      .select(
        'id, topic_id, title, slug, summary, content_html, status, video_url, video_storage_path, sort_order, read_time_minutes, created_at, updated_at, deleted_at',
      )
      .eq('id', id)
      .eq('status', 'published')
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Artikel nicht gefunden.' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[help/articles/:id] GET error:', error)
    return NextResponse.json(
      { error: 'Artikel konnte nicht geladen werden.' },
      { status: 500 },
    )
  }
}
