import { NextResponse } from 'next/server'
import { getTopicsWithCounts } from '@/lib/help/queries'

// GET /api/help/topics – Liste aller Themen mit Artikel-Anzahl (nur published)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const includeEmpty = searchParams.get('includeEmpty') === 'true'

  try {
    const topics = await getTopicsWithCounts({ includeEmpty })
    return NextResponse.json(topics)
  } catch (error) {
    console.error('[help/topics] GET error:', error)
    return NextResponse.json(
      { error: 'Themen konnten nicht geladen werden.' },
      { status: 500 },
    )
  }
}
