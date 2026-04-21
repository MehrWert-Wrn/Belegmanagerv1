import { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getEffectiveContext } from '@/lib/admin-context'

/**
 * Check if the current user is authenticated and return user object.
 * Returns NextResponse with 401 if not authenticated.
 */
export async function requireAuth(supabase: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 }) }
  }
  return { user, error: null }
}

/**
 * Check if the current user has admin role in their mandant.
 * Returns NextResponse with 403 if not admin.
 * System admins impersonating a mandant always pass this check.
 */
export async function requireAdmin(supabase: SupabaseClient) {
  const ctx = await getEffectiveContext()
  if (ctx?.isImpersonating) return { isAdmin: true, error: null }

  const { data, error } = await supabase.rpc('get_user_rolle')
  if (error || data !== 'admin') {
    return { isAdmin: false, error: NextResponse.json({ error: 'Keine Berechtigung. Nur Admins haben Zugriff.' }, { status: 403 }) }
  }
  return { isAdmin: true, error: null }
}

/**
 * Get the mandant_id for the current user.
 * When impersonating, returns the impersonated mandant_id.
 */
export async function getMandantId(supabase: SupabaseClient): Promise<string | null> {
  const ctx = await getEffectiveContext()
  if (ctx?.isImpersonating) return ctx.mandantId

  const { data, error } = await supabase.rpc('get_mandant_id')
  if (error || !data) return null
  return data as string
}
