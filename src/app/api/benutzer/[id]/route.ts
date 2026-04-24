import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

// DELETE /api/benutzer/[id] - Remove a user from the mandant
export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params

  const auth = await requireAuth(supabase)
  if (auth.error) return auth.error

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  const { data: targetUser } = await supabase
    .from('mandant_users')
    .select('id, user_id, rolle, aktiv')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 })
  }

  // Cannot delete yourself
  if (targetUser.user_id === auth.user!.id) {
    return NextResponse.json(
      { error: 'Sie können sich nicht selbst löschen' },
      { status: 400 }
    )
  }

  // Cannot delete the last active admin
  if (targetUser.rolle === 'admin' && targetUser.aktiv) {
    const { count } = await supabase
      .from('mandant_users')
      .select('id', { count: 'exact', head: true })
      .eq('mandant_id', mandantId)
      .eq('rolle', 'admin')
      .eq('aktiv', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Der letzte aktive Admin kann nicht gelöscht werden' },
        { status: 400 }
      )
    }
  }

  // Remove from mandant_users
  const { error: deleteError } = await supabase
    .from('mandant_users')
    .delete()
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // Delete auth user if they accepted the invitation
  if (targetUser.user_id) {
    const adminClient = createAdminClient()
    await adminClient.auth.admin.deleteUser(targetUser.user_id)
  }

  return NextResponse.json({ success: true })
}
