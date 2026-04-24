/**
 * PROJ-20: BanksAPI Verbindung Detail
 * DELETE /api/banksapi/verbindungen/[id] – Soft-Delete: status -> 'getrennt'
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungueltige ID' }, { status: 400 })
  }

  // Pruefen, ob die Verbindung dem Mandanten gehoert
  const { data: verbindung } = await supabase
    .from('banksapi_verbindungen')
    .select('id, status, mandant_id')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!verbindung) {
    return NextResponse.json({ error: 'Verbindung nicht gefunden' }, { status: 404 })
  }

  if (verbindung.status === 'getrennt') {
    return NextResponse.json({ error: 'Verbindung ist bereits getrennt' }, { status: 400 })
  }

  // Soft-Delete: nur Status setzen, Transaktionen bleiben erhalten
  const { error } = await supabase
    .from('banksapi_verbindungen')
    .update({ status: 'getrennt' })
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
