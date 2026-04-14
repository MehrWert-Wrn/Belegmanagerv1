/**
 * PROJ-20: FinAPI Verbindung Detail API
 * DELETE /api/finapi/verbindungen/[id] – Disconnect a bank connection (soft delete: status → getrennt)
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { getUserToken, deleteBankConnection } from '@/lib/finapi'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  // Fetch the connection
  const { data: verbindung } = await supabase
    .from('finapi_verbindungen')
    .select('id, finapi_user_id, finapi_user_password_encrypted, finapi_bank_connection_id, status')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!verbindung) {
    return NextResponse.json({ error: 'Verbindung nicht gefunden' }, { status: 404 })
  }

  if (verbindung.status === 'getrennt') {
    return NextResponse.json({ error: 'Verbindung ist bereits getrennt' }, { status: 400 })
  }

  try {
    // Try to delete the bank connection at FinAPI (best effort)
    if (verbindung.finapi_bank_connection_id) {
      try {
        const userToken = await getUserToken(
          verbindung.finapi_user_id,
          verbindung.finapi_user_password_encrypted
        )
        await deleteBankConnection(userToken, verbindung.finapi_bank_connection_id)
      } catch (err) {
        // Log but don't fail – the user still wants to disconnect locally
        console.warn('[PROJ-20] Could not delete bank connection at FinAPI:', err)
      }
    }

    // Soft delete: mark as getrennt (transactions remain)
    const { error } = await supabase
      .from('finapi_verbindungen')
      .update({ status: 'getrennt' })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[PROJ-20] DELETE /api/finapi/verbindungen/[id] error:', err)
    return NextResponse.json({ error: 'Fehler beim Trennen der Verbindung' }, { status: 500 })
  }
}
