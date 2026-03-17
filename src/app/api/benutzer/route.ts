import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'

// GET /api/benutzer - List all mandant_users for current mandant
export async function GET() {
  const supabase = await createClient()

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

  // Fetch mandant_users for this mandant
  const { data: users, error } = await supabase
    .from('mandant_users')
    .select('id, user_id, email, rolle, aktiv, eingeladen_am, einladung_angenommen_am')
    .eq('mandant_id', mandantId)
    .order('eingeladen_am', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch last_sign_in_at from auth.users via admin client
  const adminClient = createAdminClient()
  const userIds = (users ?? []).filter(u => u.user_id).map(u => u.user_id as string)

  const signInMap: Record<string, string | null> = {}
  if (userIds.length > 0) {
    // Fetch all users from auth in one call
    const { data: authData } = await adminClient.auth.admin.listUsers({
      perPage: 100,
    })
    if (authData?.users) {
      for (const authUser of authData.users) {
        if (userIds.includes(authUser.id)) {
          signInMap[authUser.id] = authUser.last_sign_in_at ?? null
        }
      }
    }
  }

  const result = (users ?? []).map(u => ({
    id: u.id,
    user_id: u.user_id,
    email: u.email,
    rolle: u.rolle,
    aktiv: u.aktiv,
    eingeladen_am: u.eingeladen_am,
    einladung_angenommen_am: u.einladung_angenommen_am,
    last_sign_in_at: u.user_id ? (signInMap[u.user_id] ?? null) : null,
  }))

  return NextResponse.json({ data: result })
}
