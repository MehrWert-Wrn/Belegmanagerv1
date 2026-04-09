import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'

// GET /api/admin/mandanten/[id] – Mandant detail
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const admin = createAdminClient()

  // Get mandant
  const { data: mandant, error } = await admin
    .from('mandanten')
    .select(`
      id,
      firmenname,
      owner_id,
      rechtsform,
      uid_nummer,
      strasse,
      plz,
      ort,
      land,
      erstellt_am
    `)
    .eq('id', id)
    .single()

  if (error || !mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  // Get owner info
  const { data: { user: owner } } = await admin.auth.admin.getUserById(mandant.owner_id)

  // Get subscription
  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('status, stripe_customer_id, stripe_subscription_id, stripe_price_id, current_period_end, admin_override_type, admin_override_until')
    .eq('mandant_id', id)
    .maybeSingle()

  // Get open ticket count
  const { count } = await admin
    .from('support_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', id)
    .in('status', ['open', 'in_progress'])

  return NextResponse.json({
    id: mandant.id,
    firmenname: mandant.firmenname,
    owner_id: mandant.owner_id,
    owner_email: owner?.email || '',
    rechtsform: mandant.rechtsform,
    uid_nummer: mandant.uid_nummer,
    strasse: mandant.strasse,
    plz: mandant.plz,
    ort: mandant.ort,
    land: mandant.land,
    erstellt_am: mandant.erstellt_am,
    last_sign_in_at: owner?.last_sign_in_at || null,
    subscription_status: sub?.status || null,
    stripe_customer_id: sub?.stripe_customer_id || null,
    stripe_subscription_id: sub?.stripe_subscription_id || null,
    current_period_end: sub?.current_period_end || null,
    admin_override_type: sub?.admin_override_type || null,
    admin_override_until: sub?.admin_override_until || null,
    open_ticket_count: count || 0,
  })
}
