import { NextResponse } from 'next/server'
import { getTopicBySlugWithArticles } from '@/lib/help/queries'

// GET /api/help/topics/[slug] – Thema + publizierte Artikel
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  if (!slug || typeof slug !== 'string') {
    return NextResponse.json({ error: 'Ungültiger Slug.' }, { status: 400 })
  }

  try {
    const topic = await getTopicBySlugWithArticles(slug)
    if (!topic) {
      return NextResponse.json({ error: 'Thema nicht gefunden.' }, { status: 404 })
    }
    return NextResponse.json(topic)
  } catch (error) {
    console.error('[help/topics/:slug] GET error:', error)
    return NextResponse.json(
      { error: 'Thema konnte nicht geladen werden.' },
      { status: 500 },
    )
  }
}
