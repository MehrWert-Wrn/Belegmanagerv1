import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'
import { sendCredentialNotificationEmail } from '@/lib/resend'
import { encryptCredentialPayload } from '@/lib/credentials-crypto'
import { checkRateLimit } from '@/lib/rate-limit'

// --- Zod Schemas ---

const imapFieldsSchema = z.object({
  host: z.string().min(1, 'Host ist erforderlich').max(253),
  port: z.number().int().min(1).max(65535).default(993),
  ssl: z.boolean().default(true),
  email: z.string().email('Ungültige E-Mail-Adresse').max(500),
  password: z.string().min(1, 'Passwort ist erforderlich').max(500),
})

const microsoft365FieldsSchema = z.object({
  tenant_id: z.string().min(1, 'Tenant ID ist erforderlich').max(500),
  client_id: z.string().min(1, 'Client ID ist erforderlich').max(500),
  client_secret: z.string().min(1, 'Client Secret ist erforderlich').max(500),
})

const gmailFieldsSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse').max(500),
  client_id: z.string().min(1, 'Client ID ist erforderlich').max(500),
  client_secret: z.string().min(1, 'Client Secret ist erforderlich').max(500),
})

const credentialsSubmitSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('imap'), fields: imapFieldsSchema }),
  z.object({ provider: z.literal('microsoft365'), fields: microsoft365FieldsSchema }),
  z.object({ provider: z.literal('gmail'), fields: gmailFieldsSchema }),
])

// --- POST: Submit credentials ---
export async function POST(request: Request) {
  const ctx = await getEffectiveContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // BUG-5 fix: Admins müssen niemals im Namen von Mandanten Credentials einreichen
  if (ctx.isImpersonating) {
    return NextResponse.json(
      { error: 'Zugangsdaten können während der Impersonation nicht eingereicht werden.' },
      { status: 403 }
    )
  }

  // BUG-3: Rate limiting — max 5 submissions per user per 10 minutes
  const rl = checkRateLimit(`credentials:post:${ctx.userId}`, 5, 10 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request Body' }, { status: 400 })
  }

  const parsed = credentialsSubmitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierungsfehler', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { provider, fields } = parsed.data
  const mandantId = ctx.mandantId

  const encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.error('[Credentials] Missing CREDENTIALS_ENCRYPTION_KEY')
    return NextResponse.json({ error: 'Serverkonfigurationsfehler' }, { status: 500 })
  }

  const admin = createAdminClient()

  // Check for existing submission
  const { data: existing } = await admin
    .from('mandant_credentials')
    .select('id')
    .eq('mandant_id', mandantId)
    .eq('provider', provider)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Zugangsdaten für diesen Anbieter wurden bereits übermittelt.' },
      { status: 409 }
    )
  }

  // BUG-2 fix: Encrypt in Node.js — plaintext never reaches the DB tier
  let payloadEncrypted: string
  try {
    payloadEncrypted = encryptCredentialPayload(JSON.stringify(fields), encryptionKey)
  } catch (err) {
    console.error('[Credentials] Encryption failed:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Verschlüsselung fehlgeschlagen' }, { status: 500 })
  }

  // Insert encrypted credential
  const { error: insertError } = await admin
    .from('mandant_credentials')
    .insert({ mandant_id: mandantId, provider, payload_encrypted: payloadEncrypted })

  if (insertError) {
    console.error('[Credentials] Insert failed:', insertError.message)
    return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 })
  }

  // Update onboarding_progress (non-critical)
  const { error: progressError } = await admin
    .from('onboarding_progress')
    .update({ email_connection_done: true })
    .eq('mandant_id', mandantId)

  if (progressError) {
    console.error('[Credentials] Failed to update onboarding progress:', progressError.message)
  }

  // Get firmenname for notification email
  const { data: mandant } = await admin
    .from('mandanten')
    .select('firmenname')
    .eq('id', mandantId)
    .single()

  const submittedAt = new Date().toISOString()

  // Notification email (fire-and-forget)
  sendCredentialNotificationEmail({
    firmenname: mandant?.firmenname || 'Unbekannt',
    provider,
    submittedAt,
  }).catch((err) => {
    console.error('[Credentials] Email notification failed:', err)
  })

  return NextResponse.json({ status: 'submitted', submitted_at: submittedAt })
}

// --- GET: Check submission status ---
export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // BUG-3: Rate limiting — max 20 status checks per user per minute
  const rl = checkRateLimit(`credentials:get:${ctx.userId}`, 20, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 })
  }

  // Use session client (RLS enforced) — payload_encrypted blocked via column revoke
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mandant_credentials')
    .select('provider, submitted_at, acknowledged_at')
    .eq('mandant_id', ctx.mandantId)
    .limit(10)

  if (error) {
    console.error('[Credentials] GET failed:', error.message)
    return NextResponse.json({ error: 'Fehler beim Laden des Status' }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Keine Zugangsdaten vorhanden' }, { status: 404 })
  }

  return NextResponse.json(
    data.map((row) => ({
      provider: row.provider,
      submitted_at: row.submitted_at,
      acknowledged_at: row.acknowledged_at,
    }))
  )
}
