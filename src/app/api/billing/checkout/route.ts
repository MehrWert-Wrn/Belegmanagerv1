import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe, STRIPE_PRICE_ID } from '@/lib/stripe'
import { NextResponse } from 'next/server'

const rateLimit = new Map<string, number[]>()
function isRateLimited(userId: string, maxPerMinute = 5): boolean {
  const now = Date.now()
  const timestamps = (rateLimit.get(userId) ?? []).filter(t => now - t < 60_000)
  if (timestamps.length >= maxPerMinute) return true
  rateLimit.set(userId, [...timestamps, now])
  return false
}

// POST /api/billing/checkout – Stripe Checkout Session erstellen
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isRateLimited(user.id)) return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id, firmenname')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })

  // Prüfen ob bereits ein Stripe-Kunde existiert
  const { data: existingSub } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id, status')
    .eq('mandant_id', mandant.id)
    .maybeSingle()

  // Aktives Abo → kein neuer Checkout
  if (existingSub?.status === 'active') {
    return NextResponse.json({ error: 'Bereits aktives Abonnement vorhanden' }, { status: 409 })
  }

  let customerId = existingSub?.stripe_customer_id ?? null

  try {
    // Stripe Customer anlegen falls noch keiner existiert
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: mandant.firmenname,
        metadata: { mandant_id: mandant.id },
      })
      customerId = customer.id

      await admin.from('billing_subscriptions').upsert({
        mandant_id: mandant.id,
        stripe_customer_id: customerId,
        status: 'incomplete',
      }, { onConflict: 'mandant_id' })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${siteUrl}/settings/abonnement?success=1`,
      cancel_url: `${siteUrl}/settings/abonnement?cancelled=1`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      customer_update: { address: 'auto', name: 'auto' },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[billing/checkout]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
