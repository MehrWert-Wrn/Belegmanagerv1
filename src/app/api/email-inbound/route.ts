import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { performOcr } from '@/lib/ocr'
import { sanitizeFilename } from '@/lib/ear-buchungsnummern'
import { executeMatching } from '@/lib/execute-matching'
import {
  extractSenderEmail,
  sendBounceEmail,
  verifyPostmarkRequest,
  type PostmarkInboundAttachment,
  type PostmarkInboundPayload,
} from '@/lib/postmark'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max attachment size: 10 MB (matches belege storage bucket limit). */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Maximum attachments processed per email. Rest are ignored. */
const MAX_ATTACHMENTS_PER_EMAIL = 10

/** MIME types accepted as belege. */
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
])

/** Extensions accepted as a fallback when MIME type is missing/generic. */
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png'])

// Route config: Postmark inbound webhooks can be up to ~35 MB. Use the Node
// runtime (not Edge) so we can use Buffer and the Anthropic SDK.
export const runtime = 'nodejs'
export const maxDuration = 300 // seconds – OCR for 10 attachments can take time

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const token = process.env.POSTMARK_INBOUND_TOKEN
  if (!token) {
    console.error('[email-inbound] POSTMARK_INBOUND_TOKEN not configured')
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 })
  }

  // Read the raw body once – we need it both for signature validation and JSON parsing.
  const rawBody = await request.text()

  const verified = verifyPostmarkRequest({
    token,
    rawBody,
    authorizationHeader: request.headers.get('authorization'),
    signatureHeader: request.headers.get('x-postmark-signature'),
  })

  if (!verified) {
    console.warn('[email-inbound] Unauthorized webhook request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: PostmarkInboundPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.MessageID) {
    return NextResponse.json({ error: 'Missing MessageID' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // ── Idempotency: bail out if this MessageID was already processed. ──────
  const { data: alreadyProcessed } = await supabase
    .from('verarbeitete_email_nachrichten')
    .select('id, status')
    .eq('message_id', payload.MessageID)
    .maybeSingle()

  if (alreadyProcessed) {
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      previous_status: alreadyProcessed.status,
    })
  }

  const senderEmail = extractSenderEmail(payload)
  if (!senderEmail) {
    await logProcessed(supabase, {
      messageId: payload.MessageID,
      mandantId: null,
      fromEmail: null,
      anhangAnzahl: 0,
      status: 'skipped',
      fehlermeldung: 'No sender email in payload',
    })
    return NextResponse.json({ ok: true, reason: 'no_sender' })
  }

  // ── Mandant-Lookup via profiles.email ──────────────────────────────────
  const mandantLookup = await resolveMandantForEmail(supabase, senderEmail)
  if (!mandantLookup) {
    // Unknown sender → bounce + log.
    await sendBounceEmail({
      toEmail: senderEmail,
      reason: `Ihre E-Mail-Adresse (${senderEmail}) ist nicht in Belegmanager registriert.`,
      details: 'Bitte melden Sie sich an unter belegmanager.at und verwenden Sie die dort hinterlegte E-Mail-Adresse.',
    })
    await logProcessed(supabase, {
      messageId: payload.MessageID,
      mandantId: null,
      fromEmail: senderEmail,
      anhangAnzahl: 0,
      status: 'bounced',
      fehlermeldung: 'Sender not registered',
    })
    return NextResponse.json({ ok: true, reason: 'sender_not_registered' })
  }

  const { mandantId } = mandantLookup
  const attachments = Array.isArray(payload.Attachments) ? payload.Attachments : []

  // Classify attachments before processing so we can report skipped ones in bounce.
  const classified = classifyAttachments(attachments)

  if (classified.accepted.length === 0) {
    await sendBounceEmail({
      toEmail: senderEmail,
      reason: 'Ihre E-Mail enthielt keine verarbeitbaren Anhaenge.',
      details: buildSkipDetails(classified) ||
        'Erlaubt sind PDF, JPG oder PNG bis jeweils 10 MB.',
    })
    await logProcessed(supabase, {
      messageId: payload.MessageID,
      mandantId,
      fromEmail: senderEmail,
      anhangAnzahl: 0,
      status: 'bounced',
      fehlermeldung: 'No processable attachments',
    })
    return NextResponse.json({ ok: true, reason: 'no_valid_attachments' })
  }

  // ── Process each accepted attachment sequentially ───────────────────────
  const importedBelege: string[] = []
  const duplicateFilenames: string[] = []
  const failedFilenames: string[] = []

  for (const attachment of classified.accepted) {
    try {
      const result = await processAttachment({
        supabase,
        mandantId,
        attachment,
      })
      if (result.status === 'duplicate' && result.filename) {
        duplicateFilenames.push(result.filename)
      } else if (result.status === 'created' && result.belegId) {
        importedBelege.push(result.belegId)
      }
    } catch (error) {
      console.error(
        `[email-inbound] Failed to process attachment "${attachment.Name}":`,
        error
      )
      failedFilenames.push(attachment.Name)
    }
  }

  await logProcessed(supabase, {
    messageId: payload.MessageID,
    mandantId,
    fromEmail: senderEmail,
    anhangAnzahl: importedBelege.length,
    status: 'processed',
    fehlermeldung:
      failedFilenames.length > 0
        ? `Fehlerhaft: ${failedFilenames.join(', ')}`
        : null,
  })

  // Trigger matching for newly imported belege (fire-and-forget, non-fatal).
  if (importedBelege.length > 0) {
    executeMatching(supabase, mandantId).catch((err) =>
      console.error('[email-inbound] Post-import matching failed:', err)
    )
  }

  // Optional: send info-bounce if there were skipped/duplicate files.
  if (
    classified.skipped.length > 0 ||
    duplicateFilenames.length > 0 ||
    failedFilenames.length > 0
  ) {
    const details = [
      ...buildSkipDetailsList(classified),
      ...duplicateFilenames.map((f) => `"${f}" wurde uebersprungen (bereits vorhanden).`),
      ...failedFilenames.map((f) => `"${f}" konnte nicht verarbeitet werden.`),
    ].join('\n')

    await sendBounceEmail({
      toEmail: senderEmail,
      reason: `${importedBelege.length} Beleg(e) wurden importiert. Einige Anhaenge wurden nicht verarbeitet:`,
      details,
    })
  }

  return NextResponse.json({
    ok: true,
    imported: importedBelege.length,
    duplicates: duplicateFilenames.length,
    failed: failedFilenames.length,
    skipped: classified.skipped.length,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface LogParams {
  messageId: string
  mandantId: string | null
  fromEmail: string | null
  anhangAnzahl: number
  status: 'processed' | 'bounced' | 'skipped'
  fehlermeldung: string | null
}

async function logProcessed(
  supabase: ReturnType<typeof createAdminClient>,
  params: LogParams
) {
  const { error } = await supabase
    .from('verarbeitete_email_nachrichten')
    .insert({
      message_id: params.messageId,
      mandant_id: params.mandantId,
      from_email: params.fromEmail,
      anhang_anzahl: params.anhangAnzahl,
      status: params.status,
      fehlermeldung: params.fehlermeldung,
    })
  if (error && !isDuplicateKey(error)) {
    console.error('[email-inbound] Failed to log processed message:', error.message)
  }
}

function isDuplicateKey(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key/i.test(error.message || '')
}

async function resolveMandantForEmail(
  supabase: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ mandantId: string; userId: string } | null> {
  // Try profiles.email first (primary source per Tech Design).
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', email)
    .maybeSingle()

  if (profile?.id) {
    const { data: mu } = await supabase
      .from('mandant_users')
      .select('mandant_id, user_id')
      .eq('user_id', profile.id)
      .eq('aktiv', true)
      .limit(1)
      .maybeSingle()
    if (mu?.mandant_id) {
      return { mandantId: mu.mandant_id as string, userId: profile.id as string }
    }
  }

  // Fallback: invited users whose einladung is accepted but profile email
  // may differ from the invitation email.
  const { data: mu2 } = await supabase
    .from('mandant_users')
    .select('mandant_id, user_id')
    .ilike('email', email)
    .eq('aktiv', true)
    .not('einladung_angenommen_am', 'is', null)
    .limit(1)
    .maybeSingle()

  if (mu2?.mandant_id && mu2.user_id) {
    return { mandantId: mu2.mandant_id as string, userId: mu2.user_id as string }
  }
  return null
}

interface ClassifiedAttachments {
  accepted: PostmarkInboundAttachment[]
  skipped: Array<{ name: string; reason: 'too_large' | 'unsupported' | 'over_limit' }>
}

function classifyAttachments(atts: PostmarkInboundAttachment[]): ClassifiedAttachments {
  const accepted: PostmarkInboundAttachment[] = []
  const skipped: ClassifiedAttachments['skipped'] = []

  for (const att of atts) {
    if (accepted.length >= MAX_ATTACHMENTS_PER_EMAIL) {
      skipped.push({ name: att.Name, reason: 'over_limit' })
      continue
    }
    const mime = (att.ContentType || '').toLowerCase()
    const ext = (att.Name.split('.').pop() || '').toLowerCase()
    // Require extension to always be whitelisted. Also require MIME to be
    // whitelisted unless it is generic/missing (application/octet-stream or
    // empty), which is common for email attachments.
    const extOk = ALLOWED_EXTENSIONS.has(ext)
    const mimeGeneric = mime === '' || mime === 'application/octet-stream'
    const mimeOk = ALLOWED_MIME_TYPES.has(mime) || mimeGeneric
    const typeAllowed = extOk && mimeOk
    if (!typeAllowed) {
      skipped.push({ name: att.Name, reason: 'unsupported' })
      continue
    }
    if (att.ContentLength > MAX_ATTACHMENT_BYTES) {
      skipped.push({ name: att.Name, reason: 'too_large' })
      continue
    }
    accepted.push(att)
  }
  return { accepted, skipped }
}

function buildSkipDetailsList(classified: ClassifiedAttachments): string[] {
  return classified.skipped.map((s) => {
    switch (s.reason) {
      case 'too_large':
        return `"${s.name}" wurde uebersprungen - Maximum ist 10 MB.`
      case 'unsupported':
        return `"${s.name}" wurde uebersprungen - Dateityp wird nicht unterstuetzt (erlaubt: PDF, JPG, PNG).`
      case 'over_limit':
        return `"${s.name}" wurde uebersprungen - maximal ${MAX_ATTACHMENTS_PER_EMAIL} Anhaenge pro E-Mail.`
    }
  })
}

function buildSkipDetails(classified: ClassifiedAttachments): string {
  return buildSkipDetailsList(classified).join('\n')
}

interface ProcessResult {
  status: 'created' | 'duplicate' | 'failed'
  belegId?: string
  filename?: string
}

async function processAttachment(params: {
  supabase: ReturnType<typeof createAdminClient>
  mandantId: string
  attachment: PostmarkInboundAttachment
}): Promise<ProcessResult> {
  const { supabase, mandantId, attachment } = params

  // Decode base64 payload and re-check actual size (ContentLength is client-supplied).
  const buffer = Buffer.from(attachment.Content, 'base64')
  if (buffer.length === 0) {
    return { status: 'failed', filename: attachment.Name }
  }
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return { status: 'failed', filename: attachment.Name }
  }

  // Compute SHA-256 hash for duplicate detection (matches client behaviour).
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

  // Duplicate check – respects soft-delete.
  const { data: existing } = await supabase
    .from('belege')
    .select('id')
    .eq('mandant_id', mandantId)
    .eq('file_hash', fileHash)
    .is('geloescht_am', null)
    .limit(1)
    .maybeSingle()

  if (existing) {
    return { status: 'duplicate', filename: attachment.Name }
  }

  // Determine file extension + MIME type.
  const extRaw = (attachment.Name.split('.').pop() || '').toLowerCase()
  const ext = extRaw === 'jpeg' ? 'jpg' : extRaw
  const dateityp: 'pdf' | 'jpg' | 'png' =
    ext === 'png' ? 'png' : ext === 'jpg' ? 'jpg' : 'pdf'
  const mimeType =
    dateityp === 'pdf'
      ? 'application/pdf'
      : dateityp === 'png'
        ? 'image/png'
        : 'image/jpeg'

  // Upload to Supabase Storage under mandant folder with a unique object id.
  const objectId = crypto.randomUUID()
  const initialPath = `${mandantId}/${objectId}.${dateityp}`

  const { error: uploadError } = await supabase.storage
    .from('belege')
    .upload(initialPath, buffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (uploadError) {
    console.error(
      `[email-inbound] Storage upload failed for "${attachment.Name}":`,
      uploadError.message
    )
    return { status: 'failed', filename: attachment.Name }
  }

  // Run OCR – errors are non-fatal; we still create the beleg without metadata.
  let ocrResult: Awaited<ReturnType<typeof performOcr>> | null = null
  if (buffer.length <= 5 * 1024 * 1024) {
    try {
      ocrResult = await performOcr(buffer, mimeType)
    } catch (err) {
      console.error('[email-inbound] OCR threw unexpectedly:', err)
    }
  }

  // Build rechnungsname per PROJ-15 convention when OCR succeeded.
  const rechnungsname = buildRechnungsname(ocrResult)

  // Optionally rename the storage object to a readable name when we have one.
  let storagePath = initialPath
  let originalFilename = attachment.Name
  if (rechnungsname) {
    const safeName = sanitizeFilename(rechnungsname)
    const newPath = `${mandantId}/${safeName}_${objectId.slice(0, 8)}.${dateityp}`
    const { error: copyError } = await supabase.storage
      .from('belege')
      .copy(initialPath, newPath)
    if (!copyError) {
      await supabase.storage.from('belege').remove([initialPath])
      storagePath = newPath
      originalFilename = `${safeName}.${dateityp}`
    }
  }

  // Insert beleg row – RLS is bypassed because we use the service role key.
  // We must therefore explicitly set mandant_id.
  const insertPayload: Record<string, unknown> = {
    mandant_id: mandantId,
    storage_path: storagePath,
    original_filename: originalFilename,
    dateityp,
    file_hash: fileHash,
    rechnungstyp: 'eingangsrechnung',
    quelle: 'email',
  }

  if (ocrResult) {
    if (ocrResult.lieferant) insertPayload.lieferant = ocrResult.lieferant
    if (ocrResult.rechnungsnummer) insertPayload.rechnungsnummer = ocrResult.rechnungsnummer
    if (ocrResult.bruttobetrag !== null) insertPayload.bruttobetrag = ocrResult.bruttobetrag
    if (ocrResult.nettobetrag !== null) insertPayload.nettobetrag = ocrResult.nettobetrag
    if (ocrResult.mwst_satz !== null) insertPayload.mwst_satz = ocrResult.mwst_satz
    if (ocrResult.rechnungsdatum) insertPayload.rechnungsdatum = ocrResult.rechnungsdatum
    if (ocrResult.steuerzeilen) insertPayload.steuerzeilen = ocrResult.steuerzeilen
    if (rechnungsname) insertPayload.rechnungsname = rechnungsname
  }

  const { data, error } = await supabase
    .from('belege')
    .insert(insertPayload)
    .select('id')
    .single()

  if (error || !data) {
    // Clean up the storage object we already created to avoid orphans.
    await supabase.storage.from('belege').remove([storagePath])
    console.error(
      `[email-inbound] DB insert failed for "${attachment.Name}":`,
      error?.message
    )
    return { status: 'failed', filename: attachment.Name }
  }

  return { status: 'created', belegId: data.id as string, filename: attachment.Name }
}

function buildRechnungsname(
  ocr: Awaited<ReturnType<typeof performOcr>> | null
): string | null {
  if (!ocr) return null
  const parts: string[] = []
  if (ocr.rechnungsdatum) {
    const [y, m, d] = ocr.rechnungsdatum.split('-')
    parts.push(`${d}.${m}.${y}`)
  }
  if (ocr.lieferant) parts.push(ocr.lieferant)
  if (ocr.rechnungsnummer) parts.push(ocr.rechnungsnummer)
  if (parts.length === 0) return null
  return parts.join(' - ')
}
