import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'

// GET /api/admin/credentials – List all pending credential submissions (decrypted)
export async function GET() {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.error('[Admin Credentials] Missing CREDENTIALS_ENCRYPTION_KEY')
    return NextResponse.json({ error: 'Serverkonfigurationsfehler' }, { status: 500 })
  }

  const admin = createAdminClient()

  // Get all submissions (unacknowledged first, then acknowledged)
  const { data: credentials, error } = await admin
    .from('mandant_credentials')
    .select('id, mandant_id, provider, payload_encrypted, submitted_at, acknowledged_at')
    .order('acknowledged_at', { ascending: true, nullsFirst: true })
    .order('submitted_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[Admin Credentials] Query failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!credentials || credentials.length === 0) {
    return NextResponse.json([])
  }

  // Get mandant info for all credentials
  const mandantIds = [...new Set(credentials.map((c) => c.mandant_id))]
  const { data: mandanten } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .in('id', mandantIds)

  const mandantMap = new Map(
    (mandanten || []).map((m) => [m.id, m.firmenname])
  )

  // Decrypt each payload
  const result = await Promise.all(
    credentials.map(async (cred) => {
      let decryptedPayload: Record<string, unknown> | null = null

      try {
        const { data: decrypted, error: decryptError } = await admin.rpc(
          'decrypt_credential_payload',
          {
            encrypted_text: cred.payload_encrypted,
            encryption_key: encryptionKey,
          }
        )

        if (!decryptError && decrypted) {
          decryptedPayload = JSON.parse(decrypted as string)
        } else {
          console.error(
            `[Admin Credentials] Decryption failed for ${cred.id}:`,
            decryptError?.message
          )
        }
      } catch (err) {
        console.error(`[Admin Credentials] Parse error for ${cred.id}:`, err)
      }

      return {
        id: cred.id,
        mandant_id: cred.mandant_id,
        firmenname: mandantMap.get(cred.mandant_id) || 'Unbekannt',
        provider: cred.provider,
        payload: decryptedPayload,
        submitted_at: cred.submitted_at,
        acknowledged_at: cred.acknowledged_at,
      }
    })
  )

  return NextResponse.json(result)
}
