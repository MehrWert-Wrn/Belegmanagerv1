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

  // Split into valid (have file + known mime type) and invalid belege
  const valid: NonNullable<typeof belege> = []
  for (const beleg of belege ?? []) {
    const mimeType = MIME_TYPE_MAP[beleg.dateityp?.toLowerCase() ?? '']
    if (!beleg.storage_path || !mimeType) {
      skipped.push(beleg.id)
    } else {
      valid.push(beleg)
    }
  }

  // Process in parallel batches of 3
  const CONCURRENCY = 3

  for (let i = 0; i < valid.length; i += CONCURRENCY) {
    const batch = valid.slice(i, i + CONCURRENCY)

    // Consume one rate-limit slot per item in this batch (sequential — no race on counter)
    let allowedCount = 0
    for (let j = 0; j < batch.length; j++) {
      const { allowed } = checkRateLimit(`ocr:${userId}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)
      if (!allowed) {
        rateLimited = valid.length - i - j
        break
      }
      allowedCount++
    }

    await Promise.all(batch.slice(0, allowedCount).map(async (beleg) => {
      const mimeType = MIME_TYPE_MAP[beleg.dateityp!.toLowerCase()]

      const { data: blob, error: downloadError } = await supabase.storage
        .from('belege')
        .download(beleg.storage_path!)

      if (downloadError || !blob) {
        errors.push({ id: beleg.id, error: 'Dokument konnte nicht geladen werden' })
        return
      }

      const buffer = Buffer.from(await blob.arrayBuffer())

      let ocr: Awaited<ReturnType<typeof performOcr>>
      try {
        ocr = await performOcr(buffer, mimeType)
      } catch {
        errors.push({ id: beleg.id, error: 'OCR fehlgeschlagen' })
        return
      }

      const update: Record<string, unknown> = {}

      if (isEmpty(beleg.lieferant) && ocr.lieferant) update.lieferant = ocr.lieferant
      if (isEmpty(beleg.rechnungsnummer) && ocr.rechnungsnummer) update.rechnungsnummer = ocr.rechnungsnummer
      if (isEmpty(beleg.rechnungsdatum) && ocr.rechnungsdatum) update.rechnungsdatum = ocr.rechnungsdatum

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
        succeeded++
        return
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
    }))

    if (allowedCount < batch.length) break
  }

  return NextResponse.json({ succeeded, skipped: skipped.length, rateLimited, errors })
}
