import crypto from 'node:crypto'
import { ServerClient } from 'postmark'

/**
 * Postmark Inbound webhook payload – only the fields we actually use.
 * Full reference: https://postmarkapp.com/developer/webhooks/inbound-webhook
 */
export interface PostmarkInboundAttachment {
  Name: string
  Content: string // base64-encoded file contents
  ContentType: string
  ContentLength: number
}

export interface PostmarkInboundPayload {
  MessageID: string
  From: string
  FromFull?: { Email: string; Name?: string }
  FromName?: string
  Subject?: string
  Attachments?: PostmarkInboundAttachment[]
}

/**
 * Verify that a webhook request is actually from Postmark.
 *
 * Postmark uses HTTP Basic-Auth on the webhook URL, OR (optionally) an
 * `X-Postmark-Signature` header. We accept either of the two, depending on
 * what the Postmark server is configured to send. Both values come from
 * `POSTMARK_INBOUND_TOKEN`.
 *
 * - Basic-Auth variant: URL contains `https://user:TOKEN@host/...` → the
 *   request carries `Authorization: Basic base64(user:TOKEN)`. The user part
 *   is ignored; only the token is compared.
 * - Signature variant: `X-Postmark-Signature` header contains either the raw
 *   token or an HMAC-SHA256 of the raw request body. We first try the raw
 *   token, then the HMAC.
 *
 * Uses timingSafeEqual to avoid timing attacks.
 */
export function verifyPostmarkRequest(params: {
  token: string
  rawBody: string
  authorizationHeader: string | null
  signatureHeader: string | null
}): boolean {
  const { token, rawBody, authorizationHeader, signatureHeader } = params

  if (!token) return false

  // 1. Basic-Auth variant
  if (authorizationHeader && authorizationHeader.startsWith('Basic ')) {
    const encoded = authorizationHeader.slice('Basic '.length).trim()
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8')
      const colonIdx = decoded.indexOf(':')
      const provided = colonIdx >= 0 ? decoded.slice(colonIdx + 1) : decoded
      if (safeEqual(provided, token)) return true
    } catch {
      // fall through to signature check
    }
  }

  // 2. Signature header – raw token or HMAC-SHA256
  if (signatureHeader) {
    if (safeEqual(signatureHeader, token)) return true

    const hmac = crypto.createHmac('sha256', token).update(rawBody).digest('base64')
    if (safeEqual(signatureHeader, hmac)) return true
  }

  return false
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Send a bounce-style notification email back to the sender when we cannot
 * process their inbound email.
 */
export async function sendBounceEmail(params: {
  toEmail: string
  reason: string
  details?: string
}): Promise<void> {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN
  if (!serverToken) {
    console.error('[Postmark] POSTMARK_SERVER_TOKEN not configured – cannot send bounce')
    return
  }

  const sender = process.env.POSTMARK_BOUNCE_SENDER || 'noreply@belegmanager.at'
  const { toEmail, reason, details } = params

  const textLines = [
    'Hallo,',
    '',
    reason,
    '',
    details ?? '',
    '',
    'Bitte melden Sie sich an unter https://belegmanager.at und verwenden Sie die dort hinterlegte E-Mail-Adresse, um Belege einzusenden.',
    '',
    'Belegmanager',
  ].filter(Boolean)

  try {
    const client = new ServerClient(serverToken)
    await client.sendEmail({
      From: sender,
      To: toEmail,
      Subject: 'Ihre E-Mail an Belegmanager konnte nicht verarbeitet werden',
      TextBody: textLines.join('\n'),
      MessageStream: 'outbound',
    })
  } catch (error) {
    // Do not throw – bounce failures must not break the webhook response.
    console.error('[Postmark] Failed to send bounce email:', error)
  }
}

/**
 * Extract the cleaned sender email from a Postmark Inbound payload.
 * Falls back through `FromFull.Email` → `From` (which may contain a name).
 */
export function extractSenderEmail(payload: PostmarkInboundPayload): string | null {
  const raw = payload.FromFull?.Email || payload.From || ''
  if (!raw) return null

  // Strip anything in angle brackets like "Jane <jane@example.com>"
  const match = raw.match(/<([^>]+)>/)
  const email = (match ? match[1] : raw).trim().toLowerCase()

  // Basic sanity check – we do NOT attempt full RFC 5322 validation here.
  if (!email.includes('@')) return null
  return email
}
