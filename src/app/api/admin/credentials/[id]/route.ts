import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin, logAdminAction } from '@/lib/admin-context'

interface RouteParams {
  params: Promise<{ id: string }>
}

// PATCH /api/admin/credentials/[id] – Mark as acknowledged (eingerichtet)
export async function PATCH(request: Request, { params }: RouteParams) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const admin = createAdminClient()

  // Check credential exists
  const { data: credential, error: fetchError } = await admin
    .from('mandant_credentials')
    .select('id, mandant_id, provider, acknowledged_at')
    .eq('id', id)
    .single()

  if (fetchError || !credential) {
    return NextResponse.json({ error: 'Zugangsdaten nicht gefunden' }, { status: 404 })
  }

  if (credential.acknowledged_at) {
    return NextResponse.json(
      { error: 'Bereits als eingerichtet markiert' },
      { status: 409 }
    )
  }

  // Set acknowledged_at
  const { error: updateError } = await admin
    .from('mandant_credentials')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError) {
    console.error('[Admin Credentials] Acknowledge failed:', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Audit log
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

  const { id } = await params
  const admin = createAdminClient()

  // Check credential exists and is acknowledged
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
      { error: 'Credentials koennen erst nach Bestätigung der Einrichtung geloescht werden.' },
      { status: 409 }
    )
  }

  // Hard delete
  const { error: deleteError } = await admin
    .from('mandant_credentials')
    .delete()
    .eq('id', id)

  if (deleteError) {
    console.error('[Admin Credentials] Delete failed:', deleteError.message)
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Audit log
  await logAdminAction(
    adminUser.adminId,
    'credentials_deleted',
    credential.mandant_id,
    { provider: credential.provider, credential_id: id }
  )

  return NextResponse.json({ status: 'deleted' })
}
