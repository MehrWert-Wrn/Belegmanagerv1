import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

const rolleSchema = z.object({
  rolle: z.enum(['admin', 'buchhalter'], {
    error: 'Rolle muss "admin" oder "buchhalter" sein',
  }),
})

// PATCH /api/benutzer/[id]/rolle - Change a user's role
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

  const parsed = rolleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler' },
      { status: 400 }
    )
  }

  const { rolle: newRolle } = parsed.data

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

  // If demoting from admin to buchhalter, check we're not removing the last admin
  if (targetUser.rolle === 'admin' && newRolle === 'buchhalter') {
    const { count } = await supabase
      .from('mandant_users')
      .select('id', { count: 'exact', head: true })
      .eq('mandant_id', mandantId)
      .eq('rolle', 'admin')
      .eq('aktiv', true)

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'Der letzte Admin kann nicht zum Buchhalter herabgestuft werden' },
        { status: 400 }
      )
    }
  }

  // Update role
  const { error: updateError } = await supabase
    .from('mandant_users')
    .update({ rolle: newRolle })
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
