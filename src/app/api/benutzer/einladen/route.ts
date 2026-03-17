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

  const { email, rolle } = parsed.data

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

  // Insert mandant_users record
  const { data: newUser, error: insertError } = await supabase
    .from('mandant_users')
    .insert({
      mandant_id: mandantId,
      email: email.toLowerCase(),
      rolle,
    })
    .select('id, email, rolle, aktiv, eingeladen_am, einladung_angenommen_am, einladung_token')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Send invite email via Supabase Admin
  const adminClient = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '.vercel.app') || 'http://localhost:3000'

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email.toLowerCase(),
    {
      redirectTo: `${siteUrl}/login?invited=true`,
    }
  )

  // If invite fails because user already exists, that's okay
  if (inviteError && !inviteError.message.includes('already been registered')) {
    console.error('Invite email error:', inviteError.message)
    // Don't fail the request - the user record was created successfully
  }

  return NextResponse.json(
    {
      data: {
        id: newUser.id,
        user_id: null,
        email: newUser.email,
        rolle: newUser.rolle,
        aktiv: newUser.aktiv,
        eingeladen_am: newUser.eingeladen_am,
        einladung_angenommen_am: newUser.einladung_angenommen_am,
        last_sign_in_at: null,
      },
    },
    { status: 201 }
  )
}
