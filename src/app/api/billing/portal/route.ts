import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { NextResponse } from 'next/server'

const rateLimit = new Map<string, number[]>()
function isRateLimited(userId: string, maxPerMinute = 5): boolean {
  const now = Date.now()
  const timestamps = (rateLimit.get(userId) ?? []).filter(t => now - t < 60_000)
  if (timestamps.length >= maxPerMinute) return true
  rateLimit.set(userId, [...timestamps, now])
  return false
}

// POST /api/billing/portal – Stripe Customer Portal Session erstellen
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (isRateLimited(user.id)) return NextResponse.json({ error: 'Zu viele Anfragen' }, { status: 429 })

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })

  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('stripe_customer_id')
    .eq('mandant_id', mandant.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: 'Kein Stripe-Kunde vorhanden' }, { status: 404 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${siteUrl}/settings/abonnement`,
  })

  return NextResponse.json({ url: session.url })
}
