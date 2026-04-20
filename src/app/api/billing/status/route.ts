import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBillingStatus } from '@/lib/billing'
import { NextResponse } from 'next/server'

// GET /api/billing/status – Aktuellen Billing-Status zurückgeben
export async function GET() {
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

  const status = await getBillingStatus(mandant.id)

  // Check admin override
  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('admin_override_type, admin_override_until, stripe_price_id')
    .eq('mandant_id', mandant.id)
    .maybeSingle()

  let adminOverrideActive = false
  if (sub?.admin_override_type === 'permanent') {
    adminOverrideActive = true
  } else if (sub?.admin_override_type === 'until_date' && sub.admin_override_until) {
    adminOverrideActive = new Date(sub.admin_override_until) > new Date()
  }

  // Zahlungshistorie
  const { data: payments } = await admin
    .from('billing_payments')
    .select('amount_cents, currency, status, charge_date, stripe_invoice_id')
    .eq('mandant_id', mandant.id)
    .order('charge_date', { ascending: false })
    .limit(12)

  return NextResponse.json({
    ...status,
    admin_override_active: adminOverrideActive,
    adminOverrideActive,
    adminOverrideType: sub?.admin_override_type ?? null,
    adminOverrideUntil: sub?.admin_override_until ?? null,
    stripePriceId: sub?.stripe_price_id ?? null,
    payments: payments ?? [],
  })
}
