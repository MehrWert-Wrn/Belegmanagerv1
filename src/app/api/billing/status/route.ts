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

  // Zahlungshistorie
  const { data: payments } = await admin
    .from('billing_payments')
    .select('amount_cents, currency, status, charge_date, stripe_invoice_id')
    .eq('mandant_id', mandant.id)
    .order('charge_date', { ascending: false })
    .limit(12)

  return NextResponse.json({ ...status, payments: payments ?? [] })
}
