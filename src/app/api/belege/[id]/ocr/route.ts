import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-helpers'
import { performOcr } from '@/lib/ocr'
import { checkRateLimit } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

const MIME_TYPE_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Rate limit: 10 OCR requests per minute per user */
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 1000

/**
 * POST /api/belege/[id]/ocr
 *
 * Re-runs OCR on the stored document for a given beleg.
 * Returns extracted invoice fields — the caller decides which empty
 * form fields to fill (no overwrite of existing data).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  // Rate limiting
  const { allowed, retryAfterMs } = checkRateLimit(
    `ocr:${user.id}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS
  )
  if (!allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)) },
      }
    )
  }

  const { id } = await params

  // Load beleg – only needs storage_path and dateityp
  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('storage_path, dateityp')
    .eq('id', id)
    .is('geloescht_am', null)
    .single()

  if (fetchError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  if (!beleg.storage_path) {
    return NextResponse.json({ error: 'Kein Dokument vorhanden' }, { status: 422 })
  }

  const mimeType = MIME_TYPE_MAP[beleg.dateityp?.toLowerCase() ?? '']
  if (!mimeType) {
    return NextResponse.json(
      { error: `Dateityp nicht unterstützt: ${beleg.dateityp}` },
      { status: 422 }
    )
  }

  // Download file from Supabase Storage
  const { data: blob, error: downloadError } = await supabase.storage
    .from('belege')
    .download(beleg.storage_path)

  if (downloadError || !blob) {
    return NextResponse.json({ error: 'Dokument konnte nicht geladen werden' }, { status: 500 })
  }

  const arrayBuffer = await blob.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const result = await performOcr(buffer, mimeType)

  return NextResponse.json(result)
}
