import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

const einladungSchema = z.object({
  email: z.string().email('Ungueltige E-Mail-Adresse'),
  rolle: z.enum(['admin', 'buchhalter'], {
    error: 'Rolle muss "admin" oder "buchhalter" sein',
  }),
  name: z.string().max(255).optional(),
})

// POST /api/benutzer/einladen - Invite a new user to the mandant
export async function POST(request: Request) {
  const supabase = await createClient()

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

  const parsed = einladungSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler' },
      { status: 400 }
    )
  }

  const { email, rolle, name } = parsed.data

  // Get mandant_id
  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  // Check MVP limit: max 10 active users per mandant
  const { count } = await supabase
    .from('mandant_users')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .eq('aktiv', true)

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Maximale Anzahl von 10 aktiven Benutzern erreicht' },
      { status: 400 }
    )
  }

  // Check no existing active mandant_user with same email
  const { data: existing } = await supabase
    .from('mandant_users')
    .select('id, aktiv')
    .eq('mandant_id', mandantId)
    .eq('email', email.toLowerCase())
    .eq('aktiv', true)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'Ein Benutzer mit dieser E-Mail ist bereits aktiv in diesem Mandanten' },
      { status: 409 }
    )
  }

  const adminClient = createAdminClient()

  // BUG-005: Proactively check if an auth user with this email already exists.
  // Doing this before calling inviteUserByEmail avoids relying on a fragile error
  // message match and ensures user_id is set immediately for existing accounts.
  const { data: existingAuthUser } = await adminClient
    .schema('auth')
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle()

  const now = new Date().toISOString()
  const insertPayload: Record<string, unknown> = {
    mandant_id: mandantId,
    email: email.toLowerCase(),
    rolle,
    ...(name ? { name } : {}),
  }

  // If the auth user already exists, link immediately so mandant_users.user_id is
  // never NULL for this case. No invite email is needed – the user can log in now.
  if (existingAuthUser?.id) {
    insertPayload.user_id = existingAuthUser.id
    insertPayload.einladung_angenommen_am = now
  }

  // Insert mandant_users record
  const { data: newUser, error: insertError } = await supabase
    .from('mandant_users')
    .insert(insertPayload)
    .select('id, email, rolle, aktiv, eingeladen_am, einladung_angenommen_am, einladung_token')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Only send an invite email when the user does not yet have an auth account.
  // For existing accounts the admin should notify the user out-of-band.
  if (!existingAuthUser?.id) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email.toLowerCase(),
      {
        redirectTo: `${siteUrl}/auth/callback?type=invite&next=/dashboard`,
      }
    )
    if (inviteError) {
      console.error('Invite email error:', inviteError.message)
    }
  }

  return NextResponse.json(
    {
      data: {
        id: newUser.id,
        user_id: existingAuthUser?.id ?? null,
        email: newUser.email,
        rolle: newUser.rolle,
        aktiv: newUser.aktiv,
        eingeladen_am: newUser.eingeladen_am,
        einladung_angenommen_am: existingAuthUser?.id ? now : null,
        last_sign_in_at: null,
      },
    },
    { status: 201 }
  )
}
