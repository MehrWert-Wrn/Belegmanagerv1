import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

const statusSchema = z.object({
  aktiv: z.boolean(),
})

// PATCH /api/benutzer/[id]/status - Activate/deactivate a user
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params

  // Auth check
  const auth = await requireAuth(supabase)
  if (auth.error) return auth.error

  // Admin check
  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
  }

  const parsed = statusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler' },
      { status: 400 }
    )
  }

  const { aktiv } = parsed.data

  // Get mandant_id
  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  // Fetch the target user
  const { data: targetUser } = await supabase
    .from('mandant_users')
    .select('id, user_id, rolle, aktiv')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 })
  }

  // If deactivating an admin, check we're not removing the last admin
  if (!aktiv && targetUser.rolle === 'admin' && targetUser.aktiv) {
    const { count } = await supabase
      .from('mandant_users')
      .select('id', { count: 'exact', head: true })
      .eq('mandant_id', mandantId)
      .eq('rolle', 'admin')
      .eq('aktiv', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Der letzte aktive Admin kann nicht deaktiviert werden' },
        { status: 400 }
      )
    }
  }

  // Cannot deactivate self if last admin
  const currentUser = auth.user!
  if (!aktiv && targetUser.user_id === currentUser.id && targetUser.rolle === 'admin') {
    const { count } = await supabase
      .from('mandant_users')
      .select('id', { count: 'exact', head: true })
      .eq('mandant_id', mandantId)
      .eq('rolle', 'admin')
      .eq('aktiv', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Sie koennen sich nicht selbst deaktivieren, wenn Sie der letzte Admin sind' },
        { status: 400 }
      )
    }
  }

  // Update status in DB
  const { error: updateError } = await supabase
    .from('mandant_users')
    .update({ aktiv })
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Sync ban state in Supabase Auth so the user cannot log in while deactivated.
  // Only applies to users who have accepted their invite (user_id is set).
  if (targetUser.user_id) {
    const adminClient = createAdminClient()
    await adminClient.auth.admin.updateUserById(targetUser.user_id, {
      ban_duration: aktiv ? 'none' : '876600h',
    })
  }

  return NextResponse.json({ success: true })
}
