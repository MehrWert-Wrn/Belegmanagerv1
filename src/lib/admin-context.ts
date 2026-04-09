import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const IMPERSONATION_COOKIE = 'bm_admin_ctx'

export interface EffectiveContext {
  userId: string
  mandantId: string
  adminId: string | null
  isImpersonating: boolean
}

interface ImpersonationPayload {
  admin_id: string
  mandant_id: string
  started_at: string
}

/**
 * Get the effective context for the current request.
 * If the admin impersonation cookie is set, returns the impersonated mandant context
 * using the Service Role (bypasses RLS). Otherwise returns normal auth context.
 */
export async function getEffectiveContext(): Promise<EffectiveContext | null> {
  const cookieStore = await cookies()
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE)

  if (impersonationCookie) {
    try {
      const payload: ImpersonationPayload = JSON.parse(impersonationCookie.value)

      // Verify the admin is still a valid admin
      const admin = createAdminClient()
      const { data: profile } = await admin
        .from('profiles')
        .select('is_admin')
        .eq('id', payload.admin_id)
        .single()

      if (!profile?.is_admin) {
        return null
      }

      return {
        userId: payload.admin_id,
        mandantId: payload.mandant_id,
        adminId: payload.admin_id,
        isImpersonating: true,
      }
    } catch {
      // Invalid cookie, fall through to normal auth
    }
  }

  // Normal auth flow
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  // Check owner
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (mandant) {
    return {
      userId: user.id,
      mandantId: mandant.id,
      adminId: null,
      isImpersonating: false,
    }
  }

  // Check invited user
  const { data: mandantUser } = await admin
    .from('mandant_users')
    .select('mandant_id')
    .eq('user_id', user.id)
    .eq('aktiv', true)
    .maybeSingle()

  if (mandantUser) {
    return {
      userId: user.id,
      mandantId: mandantUser.mandant_id,
      adminId: null,
      isImpersonating: false,
    }
  }

  return null
}

/**
 * Check if the current request is from a verified admin user.
 * Returns the admin user ID if verified, null otherwise.
 */
export async function verifyAdmin(): Promise<{ adminId: string; email: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin, email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return null

  return { adminId: user.id, email: profile.email || user.email || '' }
}

/**
 * Log an admin action to the audit log.
 * Uses Service Role to bypass RLS.
 */
export async function logAdminAction(
  adminId: string,
  actionType: string,
  mandantId: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('admin_audit_log')
    .insert({
      admin_id: adminId,
      mandant_id: mandantId,
      action_type: actionType,
      metadata: metadata ?? null,
    })

  if (error) {
    console.error('[Admin Audit] Failed to log action:', error.message)
  }
}

/**
 * Set the impersonation cookie.
 */
export async function setImpersonationCookie(
  adminId: string,
  mandantId: string
): Promise<void> {
  const cookieStore = await cookies()
  const payload: ImpersonationPayload = {
    admin_id: adminId,
    mandant_id: mandantId,
    started_at: new Date().toISOString(),
  }

  cookieStore.set(IMPERSONATION_COOKIE, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 4, // 4 hours max
  })
}

/**
 * Clear the impersonation cookie.
 */
export async function clearImpersonationCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

/**
 * Get the current impersonation state (if any) from the cookie.
 */
export async function getImpersonationState(): Promise<ImpersonationPayload | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(IMPERSONATION_COOKIE)
  if (!cookie) return null

  try {
    return JSON.parse(cookie.value) as ImpersonationPayload
  } catch {
    return null
  }
}
