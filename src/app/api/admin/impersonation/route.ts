import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  verifyAdmin,
  logAdminAction,
  setImpersonationCookie,
  clearImpersonationCookie,
  getImpersonationState,
} from '@/lib/admin-context'

const startSchema = z.object({
  mandant_id: z.string().uuid(),
})

// POST /api/admin/impersonation – Start impersonation session
export async function POST(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = startSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { mandant_id } = parsed.data

  // Verify mandant exists
  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .eq('id', mandant_id)
    .single()

  if (!mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  // Set impersonation cookie
  await setImpersonationCookie(adminUser.adminId, mandant_id)

  // Log to audit
  await logAdminAction(adminUser.adminId, 'impersonation_start', mandant_id, {
    mandant_name: mandant.firmenname,
  })

  return NextResponse.json({
    success: true,
    mandant_id,
    mandant_name: mandant.firmenname,
  })
}

// DELETE /api/admin/impersonation – Stop impersonation session
export async function DELETE() {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get current impersonation state for audit log
  const state = await getImpersonationState()

  // Clear cookie
  await clearImpersonationCookie()

  // Log to audit
  if (state) {
    await logAdminAction(adminUser.adminId, 'impersonation_stop', state.mandant_id)
  }

  return NextResponse.json({ success: true })
}
