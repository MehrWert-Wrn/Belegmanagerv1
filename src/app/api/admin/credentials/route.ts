import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'
import { decryptCredentialPayload } from '@/lib/credentials-crypto'
import { checkRateLimit } from '@/lib/rate-limit'

const PAGE_SIZE = 25

// GET /api/admin/credentials?page=0 – Paginated list with in-memory decryption
export async function GET(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // BUG-3: Rate limiting — max 30 requests per admin per minute
  const rl = checkRateLimit(`admin:credentials:get:${adminUser.adminId}`, 30, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 })
  }

  const encryptionKey = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!encryptionKey) {
    console.error('[Admin Credentials] Missing CREDENTIALS_ENCRYPTION_KEY')
    return NextResponse.json({ error: 'Serverkonfigurationsfehler' }, { status: 500 })
  }

  // BUG-9: Pagination
  const { searchParams } = new URL(request.url)
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0)
  const from = page * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const admin = createAdminClient()

  const { data: credentials, error } = await admin
    .from('mandant_credentials')
    .select('id, mandant_id, provider, payload_encrypted, submitted_at, acknowledged_at')
    .order('acknowledged_at', { ascending: true, nullsFirst: true })
    .order('submitted_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[Admin Credentials] Query failed:', error.message)
    // BUG-8: Generic error message to client
    return NextResponse.json({ error: 'Fehler beim Laden der Zugangsdaten' }, { status: 500 })
  }

  if (!credentials || credentials.length === 0) {
    return NextResponse.json({ data: [], page, hasMore: false })
  }

  // Fetch mandant names in one query
  const mandantIds = [...new Set(credentials.map((c) => c.mandant_id))]
  const { data: mandanten } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .in('id', mandantIds)

  const mandantMap = new Map((mandanten || []).map((m) => [m.id, m.firmenname]))

  // BUG-9 fix: Decrypt in-memory (Node.js) — no DB round-trips
  const result = credentials.map((cred) => {
    let payload: Record<string, unknown> | null = null
    try {
      payload = JSON.parse(decryptCredentialPayload(cred.payload_encrypted, encryptionKey))
    } catch (err) {
      console.error(`[Admin Credentials] Decryption failed for ${cred.id}:`, err instanceof Error ? err.message : err)
    }
    return {
      id: cred.id,
      mandant_id: cred.mandant_id,
      firmenname: mandantMap.get(cred.mandant_id) || 'Unbekannt',
      provider: cred.provider,
      payload,
      submitted_at: cred.submitted_at,
      acknowledged_at: cred.acknowledged_at,
    }
  })

  return NextResponse.json({
    data: result,
    page,
    hasMore: credentials.length === PAGE_SIZE,
  })
}
