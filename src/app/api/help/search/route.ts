import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchArticlesServer } from '@/lib/help/queries'

// Bug-017 fix: Einfaches In-Memory-Rate-Limit (10 Req/Min pro User-ID)
// Funktioniert per Serverless-Instance; für Multi-Instance-Deployments
// wäre Upstash Redis die skalierbare Lösung.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60_000

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(key)
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// GET /api/help/search?q=... – Volltextsuche ueber publizierte Artikel
// Bug-003 fix: Auth-Pflicht + max. 50 Zeichen Query-Länge
export async function GET(request: Request) {
  // Auth erforderlich (Hilfe-Center erfordert Login)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  // Bug-017: Rate-Limit pro User
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Zu viele Suchanfragen. Bitte warte eine Minute.' },
      { status: 429 },
    )
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''

  if (q.length < 2) {
    return NextResponse.json([])
  }

  // Bug-003 fix: 50 Zeichen Limit (statt 200) gegen ILIKE-DoS
  if (q.length > 50) {
    return NextResponse.json(
      { error: 'Suchbegriff ist zu lang (max. 50 Zeichen).' },
      { status: 400 },
    )
  }

  try {
    const results = await searchArticlesServer(q, 20)
    return NextResponse.json(results)
  } catch (error) {
    console.error('[help/search] GET error:', error)
    return NextResponse.json(
      { error: 'Suche fehlgeschlagen.' },
      { status: 500 },
    )
  }
}
