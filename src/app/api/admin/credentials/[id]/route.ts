import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin, logAdminAction } from '@/lib/admin-context'
import { checkRateLimit } from '@/lib/rate-limit'

interface RouteParams {
  params: Promise<{ id: string }>
}

// BUG-4: Simple UUID v4 format check
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value)
}

// PATCH /api/admin/credentials/[id] – Mark as acknowledged
export async function PATCH(request: Request, { params }: RouteParams) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // BUG-3: Rate limiting
  const rl = checkRateLimit(`admin:credentials:patch:${adminUser.adminId}`, 30, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 })
  }

  const { id } = await params

  // BUG-4: UUID validation
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: credential, error: fetchError } = await admin
    .from('mandant_credentials')
    .select('id, mandant_id, provider, acknowledged_at')
    .eq('id', id)
    .single()

  if (fetchError || !credential) {
    return NextResponse.json({ error: 'Zugangsdaten nicht gefunden' }, { status: 404 })
  }

  if (credential.acknowledged_at) {
    return NextResponse.json({ error: 'Bereits als eingerichtet markiert' }, { status: 409 })
  }

  const { error: updateError } = await admin
    .from('mandant_credentials')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    console.error('[Admin Credentials] Acknowledge failed:', updateError.message)
    // BUG-8: Generic error to client
    return NextResponse.json({ error: 'Aktualisierung fehlgeschlagen' }, { status: 500 })
  }

  await logAdminAction(
    adminUser.adminId,
    'credentials_acknowledged',
    credential.mandant_id,
    { provider: credential.provider, credential_id: id }
  )

  return NextResponse.json({ status: 'acknowledged' })
}

// DELETE /api/admin/credentials/[id] – Hard delete (only if acknowledged)
export async function DELETE(request: Request, { params }: RouteParams) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // BUG-3: Rate limiting
  const rl = checkRateLimit(`admin:credentials:delete:${adminUser.adminId}`, 20, 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Zu viele Anfragen.' }, { status: 429 })
  }

  const { id } = await params

  // BUG-4: UUID validation
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: credential, error: fetchError } = await admin
    .from('mandant_credentials')
    .select('id, mandant_id, provider, acknowledged_at')
    .eq('id', id)
    .single()

  if (fetchError || !credential) {
    return NextResponse.json({ error: 'Zugangsdaten nicht gefunden' }, { status: 404 })
  }

  if (!credential.acknowledged_at) {
    return NextResponse.json(
      { error: 'Credentials können erst nach Bestätigung der Einrichtung gelöscht werden.' },
      { status: 409 }
    )
  }

  const { error: deleteError } = await admin
    .from('mandant_credentials')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('[Admin Credentials] Delete failed:', deleteError.message)
    // BUG-8: Generic error to client
    return NextResponse.json({ error: 'Löschen fehlgeschlagen' }, { status: 500 })
  }

  await logAdminAction(
    adminUser.adminId,
    'credentials_deleted',
    credential.mandant_id,
    { provider: credential.provider, credential_id: id }
  )

  return NextResponse.json({ status: 'deleted' })
}
