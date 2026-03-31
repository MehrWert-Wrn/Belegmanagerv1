import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { gc } from '@/lib/gocardless'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Get mandant
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })

  // Idempotency: if a pending_mandate subscription already exists, reuse it
  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('id, gc_billing_request_id')
    .eq('mandant_id', mandant.id)
    .eq('status', 'pending_mandate')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Get the plan
  const { data: plan } = await admin
    .from('billing_plans')
    .select('id')
    .eq('active', true)
    .limit(1)
    .single()

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.belegmanager.at'

  try {
    // Create GoCardless Billing Request (mandate only – subscription created in webhook)
    const billingRequest = await gc.billingRequests.create({
      mandate_request: {
        scheme: 'sepa_core',
        description: 'Belegmanager Monatsabo',
      },
    })

    // Create Billing Request Flow (hosted IBAN entry page)
    const flow = await gc.billingRequestFlows.create({
      redirect_uri: `${siteUrl}/settings/abonnement?success=true`,
      exit_uri: `${siteUrl}/settings/abonnement?cancelled=true`,
      prefilled_customer: {
        email: user.email,
      },
      links: {
        billing_request: billingRequest.id!,
      },
    })

    // Upsert subscription record in DB
    if (existing) {
      await admin
        .from('billing_subscriptions')
        .update({ gc_billing_request_id: billingRequest.id, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await admin.from('billing_subscriptions').insert({
        mandant_id: mandant.id,
        plan_id: plan?.id ?? null,
        status: 'pending_mandate',
        gc_billing_request_id: billingRequest.id,
      })
    }

    return NextResponse.json({ authorisation_url: flow.authorisation_url })
  } catch (err) {
    console.error('[billing/setup] GoCardless error:', err)
    return NextResponse.json(
      { error: 'Zahlungsservice momentan nicht verfügbar' },
      { status: 502 }
    )
  }
}
