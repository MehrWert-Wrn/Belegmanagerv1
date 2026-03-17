import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

// POST /api/benutzer/[id]/einladung-erneut - Resend invitation
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { id } = await params

  // Auth check
  const auth = await requireAuth(supabase)
  if (auth.error) return auth.error

  // Admin check
  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  // Get mandant_id
  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  // Fetch the target user
  const { data: targetUser } = await supabase
    .from('mandant_users')
    .select('id, email, einladung_angenommen_am')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!targetUser) {
    return NextResponse.json({ error: 'Benutzer nicht gefunden' }, { status: 404 })
  }

  // Only resend if invitation hasn't been accepted yet
  if (targetUser.einladung_angenommen_am) {
    return NextResponse.json(
      { error: 'Die Einladung wurde bereits angenommen' },
      { status: 400 }
    )
  }

  // Reset token and extend validity
  const { error: updateError } = await supabase
    .from('mandant_users')
    .update({
      einladung_token: crypto.randomUUID(),
      einladung_gueltig_bis: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Resend invite email
  const adminClient = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    targetUser.email,
    {
      redirectTo: `${siteUrl}/login?invited=true`,
    }
  )

  if (inviteError && !inviteError.message.includes('already been registered')) {
    console.error('Resend invite email error:', inviteError.message)
  }

  return NextResponse.json({ success: true })
}
