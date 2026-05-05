import { getEffectiveSupabase } from '@/lib/admin-context'
import { performOcr } from '@/lib/ocr'
import { checkRateLimit } from '@/lib/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const MIME_TYPE_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Shared rate limit: 10 OCR requests per minute per user */
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 1000

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(50),
})

function isEmpty(v: unknown): boolean {
  return v == null || v === ''
}

export async function POST(request: Request) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  const { db: supabase, mandantId, userId } = ctx

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ids } = parsed.data

  const { data: belege, error: fetchError } = await supabase
    .from('belege')
    .select('id, storage_path, dateityp, lieferant, rechnungsnummer, rechnungsdatum, bruttobetrag, nettobetrag, mwst_satz, steuerzeilen')
    .in('id', ids)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let succeeded = 0
  let rateLimited = 0
  const skipped: string[] = []
  const errors: { id: string; error: string }[] = []

  for (const beleg of belege ?? []) {
    if (!beleg.storage_path) {
      skipped.push(beleg.id)
      continue
    }

    const mimeType = MIME_TYPE_MAP[beleg.dateityp?.toLowerCase() ?? '']
    if (!mimeType) {
      skipped.push(beleg.id)
      continue
    }

    // Check rate limit before each OCR call
    const { allowed, retryAfterMs } = checkRateLimit(
      `ocr:${userId}`,
      RATE_LIMIT_MAX,
      RATE_LIMIT_WINDOW_MS
    )
    if (!allowed) {
      rateLimited = (belege?.length ?? 0) - succeeded - skipped.length - errors.length
      break
    }

    // Download file from storage
    const { data: blob, error: downloadError } = await supabase.storage
      .from('belege')
      .download(beleg.storage_path)

    if (downloadError || !blob) {
      errors.push({ id: beleg.id, error: 'Dokument konnte nicht geladen werden' })
      continue
    }

    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let ocr: Awaited<ReturnType<typeof performOcr>>
    try {
      ocr = await performOcr(buffer, mimeType)
    } catch {
      errors.push({ id: beleg.id, error: 'OCR fehlgeschlagen' })
      continue
    }

    // Build update object – only fill empty fields
    const update: Record<string, unknown> = {}

    if (isEmpty(beleg.lieferant) && ocr.lieferant) update.lieferant = ocr.lieferant
    if (isEmpty(beleg.rechnungsnummer) && ocr.rechnungsnummer) update.rechnungsnummer = ocr.rechnungsnummer
    if (isEmpty(beleg.rechnungsdatum) && ocr.rechnungsdatum) update.rechnungsdatum = ocr.rechnungsdatum

    // Apply amounts only if beleg has none yet
    const hasAmounts = !isEmpty(beleg.bruttobetrag) || !isEmpty(beleg.nettobetrag)
    if (!hasAmounts) {
      const ocrRows = ocr.steuerzeilen?.length
        ? ocr.steuerzeilen
        : (ocr.bruttobetrag != null || ocr.nettobetrag != null)
          ? [{ nettobetrag: ocr.nettobetrag, mwst_satz: ocr.mwst_satz, bruttobetrag: ocr.bruttobetrag }]
          : null

      if (ocrRows) {
        update.steuerzeilen = ocrRows
        if (ocrRows.length === 1) {
          if (ocrRows[0].bruttobetrag != null) update.bruttobetrag = ocrRows[0].bruttobetrag
          if (ocrRows[0].nettobetrag != null) update.nettobetrag = ocrRows[0].nettobetrag
          if (ocrRows[0].mwst_satz != null) update.mwst_satz = ocrRows[0].mwst_satz
        }
      }
    }

    if (Object.keys(update).length === 0) {
      // Nothing to update – beleg already has all data
      succeeded++
      continue
    }

    const { error: updateError } = await supabase
      .from('belege')
      .update(update)
      .eq('id', beleg.id)
      .eq('mandant_id', mandantId)

    if (updateError) {
      errors.push({ id: beleg.id, error: updateError.message })
    } else {
      succeeded++
    }
  }

  return NextResponse.json({ succeeded, skipped: skipped.length, rateLimited, errors })
}
