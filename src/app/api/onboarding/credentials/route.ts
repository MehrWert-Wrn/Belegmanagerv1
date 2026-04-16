import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEffectiveContext } from '@/lib/admin-context'
import { sendCredentialNotificationEmail } from '@/lib/resend'

// --- Zod Schemas ---

const imapFieldsSchema = z.object({
  host: z.string().min(1, 'Host ist erforderlich').max(253, 'Host darf maximal 253 Zeichen haben'),
  port: z.number().int().min(1).max(65535).default(993),
  ssl: z.boolean().default(true),
  email: z.string().email('Ungueltige E-Mail-Adresse').max(500),
  password: z.string().min(1, 'Passwort ist erforderlich').max(500),
})

const microsoft365FieldsSchema = z.object({
  tenant_id: z.string().min(1, 'Tenant ID ist erforderlich').max(500),
  client_id: z.string().min(1, 'Client ID ist erforderlich').max(500),
  client_secret: z.string().min(1, 'Client Secret ist erforderlich').max(500),
})

const gmailFieldsSchema = z.object({
  email: z.string().email('Ungueltige E-Mail-Adresse').max(500),
  client_id: z.string().min(1, 'Client ID ist erforderlich').max(500),
  client_secret: z.string().min(1, 'Client Secret ist erforderlich').max(500),
})

const credentialsSubmitSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('imap'),
    fields: imapFieldsSchema,
  }),
  z.object({
    provider: z.literal('microsoft365'),
    fields: microsoft365FieldsSchema,
  }),
  z.object({
    provider: z.literal('gmail'),
    fields: gmailFieldsSchema,
  }),
])

// --- POST: Submit credentials ---
export async function POST(request: Request) {
  const ctx = await getEffectiveContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request Body' }, { status: 400 })
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

  // Check if submission already exists for this mandant+provider
  const { data: existing } = await admin
    .from('mandant_credentials')
    .select('id')
    .eq('mandant_id', mandantId)
    .eq('provider', provider)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Zugangsdaten fuer diesen Anbieter wurden bereits uebermittelt.' },
      { status: 409 }
    )
  }

  // Encrypt payload via pgcrypto RPC function (Service Role only)
  const payloadJson = JSON.stringify(fields)
  const { data: encryptedPayload, error: encryptError } = await admin.rpc(
    'encrypt_credential_payload',
    { payload_text: payloadJson, encryption_key: encryptionKey }
  )

  if (encryptError || !encryptedPayload) {
    console.error('[Credentials] Encryption failed:', encryptError?.message)
    return NextResponse.json({ error: 'Verschluesselung fehlgeschlagen' }, { status: 500 })
  }

  // Insert encrypted credential
  const { error: insertError } = await admin
    .from('mandant_credentials')
    .insert({
      mandant_id: mandantId,
      provider,
      payload_encrypted: encryptedPayload,
    })

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

  // Get firmenname for email notification
  const { data: mandant } = await admin
    .from('mandanten')
    .select('firmenname')
    .eq('id', mandantId)
    .single()

  const submittedAt = new Date().toISOString()

  // Send notification email (fire-and-forget, non-blocking)
  sendCredentialNotificationEmail({
    firmenname: mandant?.firmenname || 'Unbekannt',
    provider,
    submittedAt,
  }).catch((err) => {
    console.error('[Credentials] Email notification failed:', err)
  })

  return NextResponse.json({
    status: 'submitted',
    submitted_at: submittedAt,
  })
}

// --- GET: Check submission status ---
export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  // Use normal supabase client (RLS enforced – mandant can only see own rows)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mandant_credentials')
    .select('provider, submitted_at, acknowledged_at')
    .eq('mandant_id', ctx.mandantId)
    .limit(10)

  if (error) {
    console.error('[Credentials] GET failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
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
