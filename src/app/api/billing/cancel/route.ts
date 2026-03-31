import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gc } from '@/lib/gocardless'
import { invalidateBillingCache } from '@/lib/billing'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })

  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('id, gc_subscription_id')
    .eq('mandant_id', mandant.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!sub) return NextResponse.json({ error: 'Kein aktives Abonnement gefunden' }, { status: 404 })

  try {
    if (sub.gc_subscription_id) {
      await gc.subscriptions.cancel(sub.gc_subscription_id, {})
    }

    await admin
      .from('billing_subscriptions')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id)

    await invalidateBillingCache(mandant.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[billing/cancel] GoCardless error:', err)
    return NextResponse.json(
      { error: 'Zahlungsservice momentan nicht verfügbar' },
      { status: 502 }
    )
  }
}
