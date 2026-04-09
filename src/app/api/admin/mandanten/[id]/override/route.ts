import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin, logAdminAction } from '@/lib/admin-context'
import { invalidateBillingCache } from '@/lib/billing'

const overrideSchema = z.object({
  override_type: z.enum(['permanent', 'until_date']).nullable(),
  override_until: z.string().datetime().nullable().optional(),
}).refine(
  (data) => {
    // If type is until_date, override_until must be set
    if (data.override_type === 'until_date' && !data.override_until) return false
    // If type is permanent, override_until should be null
    if (data.override_type === 'permanent' && data.override_until) return false
    return true
  },
  { message: 'until_date erfordert ein Ablaufdatum; permanent darf keins haben' }
)

// PATCH /api/admin/mandanten/[id]/override – Set or remove admin override
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: mandantId } = await params

  const body = await request.json()
  const parsed = overrideSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { override_type, override_until } = parsed.data

  const admin = createAdminClient()

  // Verify mandant exists
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .eq('id', mandantId)
    .single()

  if (!mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  // Update billing_subscriptions
  const { data: existingSub } = await admin
    .from('billing_subscriptions')
    .select('id')
    .eq('mandant_id', mandantId)
    .maybeSingle()

  if (existingSub) {
    const { error } = await admin
      .from('billing_subscriptions')
      .update({
        admin_override_type: override_type,
        admin_override_until: override_until || null,
        updated_at: new Date().toISOString(),
      })
      .eq('mandant_id', mandantId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  } else {
    // Create a billing_subscriptions row if none exists
    const { error } = await admin
      .from('billing_subscriptions')
      .insert({
        mandant_id: mandantId,
        status: 'none',
        admin_override_type: override_type,
        admin_override_until: override_until || null,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Log to audit
  const actionType = override_type ? 'override_set' : 'override_removed'
  await logAdminAction(adminUser.adminId, actionType, mandantId, {
    override_type,
    override_until: override_until || null,
    mandant_name: mandant.firmenname,
  })

  // Invalidate billing cache
  invalidateBillingCache(mandantId)

  return NextResponse.json({
    success: true,
    admin_override_type: override_type,
    admin_override_until: override_until || null,
  })
}
