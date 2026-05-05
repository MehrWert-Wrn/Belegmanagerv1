import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth-helpers'
import { performOcr, TAGESLOSUNG_OCR_PROMPT, OCR_MAX_FILE_SIZE, OcrResult } from '@/lib/ocr'
import { convertToEur } from '@/lib/exchange-rate'
import { checkRateLimit } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'

/** Allowed MIME types for OCR */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
])

/** Rate limit: 10 requests per minute per mandant */
const RATE_LIMIT_PER_MIN = 10
const RATE_LIMIT_WINDOW_MS = 60 * 1000

/** Daily quota: 200 OCR calls per mandant */
const RATE_LIMIT_PER_DAY = 200
const RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000

/**
 * POST /api/belege/ocr
 *
 * Accepts a single file via multipart/form-data and returns
 * OCR-extracted invoice fields using Claude Haiku Vision.
 *
 * The file is NOT stored — it is only used for recognition.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')
  // 1. Authentication
  const supabase = await createClient()
  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  // 2. Resolve mandant_id for per-mandant rate limiting
  const { data: mandant } = await supabase.from('mandanten').select('id').single()
  const mandantId = mandant?.id ?? user.id

  // 3. Rate limiting – per-minute and daily per-mandant
  const { allowed: allowedMinute, retryAfterMs } = checkRateLimit(
    `ocr:min:${mandantId}`,
    RATE_LIMIT_PER_MIN,
    RATE_LIMIT_WINDOW_MS
  )
  if (!allowedMinute) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((retryAfterMs ?? 60000) / 1000)),
        },
      }
    )
  }
  const { allowed: allowedDay } = checkRateLimit(
    `ocr:day:${mandantId}`,
    RATE_LIMIT_PER_DAY,
    RATE_LIMIT_DAY_MS
  )
  if (!allowedDay) {
    return NextResponse.json(
      { error: 'Tägliches OCR-Limit erreicht. Bitte morgen erneut versuchen.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    )
  }

  // 3. Parse multipart form data
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { error: 'Ungueltige Anfrage. Multipart/form-data erwartet.' },
      { status: 400 }
    )
  }

  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Keine Datei gefunden. Feld "file" ist erforderlich.' },
      { status: 400 }
    )
  }

  // 4. Validate file type
  const mimeType = file.type.toLowerCase()
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `Dateityp nicht unterstuetzt: ${mimeType}. Erlaubt: PDF, JPG, PNG.` },
      { status: 400 }
    )
  }

  // 5. Validate file size
  if (file.size > OCR_MAX_FILE_SIZE) {
    const maxMB = OCR_MAX_FILE_SIZE / (1024 * 1024)
    return NextResponse.json(
      { error: `Datei zu gross (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum: ${maxMB} MB.` },
      { status: 400 }
    )
  }

  // 6. Perform OCR
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const ocrPrompt = mode === 'tageslosung' ? TAGESLOSUNG_OCR_PROMPT : undefined
  const result = await performOcr(buffer, mimeType, ocrPrompt)

  // 7. Currency conversion: if invoice is not in EUR, convert amounts to EUR
  if (result.waehrung && result.waehrung !== 'EUR') {
    const response = await applyForeignCurrencyConversion(result)
    return NextResponse.json(response)
  }

  return NextResponse.json(result)
}

/**
 * Converts all monetary amounts in the OCR result from the detected foreign
 * currency to EUR using the current ECB exchange rate.
 *
 * The original foreign-currency bruttobetrag is preserved in
 * `bruttobetrag_fremdwährung` and the rate in `wechselkurs` so the calling
 * code can store them alongside the converted EUR values.
 */
async function applyForeignCurrencyConversion(result: OcrResult): Promise<OcrResult & {
  bruttobetrag_fremdwaehrung: number | null
  wechselkurs: number | null
}> {
  const base = {
    ...result,
    bruttobetrag_fremdwaehrung: result.bruttobetrag,
    wechselkurs: null as number | null,
  }

  if (result.bruttobetrag === null && result.nettobetrag === null) return base

  const referenceAmount = result.bruttobetrag ?? result.nettobetrag!
  const converted = await convertToEur(referenceAmount, result.waehrung)
  if (!converted) return base // rate unavailable – keep original amounts, caller handles it

  const { rate } = converted
  const round2 = (n: number | null) => n !== null ? Math.round(n * rate * 100) / 100 : null

  return {
    ...result,
    bruttobetrag: round2(result.bruttobetrag),
    nettobetrag: round2(result.nettobetrag),
    steuerzeilen: result.steuerzeilen?.map(z => ({
      nettobetrag: round2(z.nettobetrag),
      mwst_satz: z.mwst_satz,
      bruttobetrag: round2(z.bruttobetrag),
    })),
    bruttobetrag_fremdwaehrung: result.bruttobetrag,
    wechselkurs: rate,
  }
}
