import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateBillingCache } from '@/lib/billing'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

export const runtime = 'nodejs'

// POST /api/billing/webhook – Stripe Webhook Handler
export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook signature fehlt' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Webhook signature ungültig' }, { status: 400 })
  }

  const admin = createAdminClient()

  async function getMandantId(customerId: string): Promise<string | null> {
    const { data } = await admin
      .from('billing_subscriptions')
      .select('mandant_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    return data?.mandant_id ?? null
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode !== 'subscription') break
      const customerId = session.customer as string
      const subscriptionId = session.subscription as string

      const subscription = await stripe.subscriptions.retrieve(subscriptionId)

      const mandantId = await getMandantId(customerId)
      if (!mandantId) break

      await admin.from('billing_subscriptions').upsert({
        mandant_id: mandantId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: subscription.items.data[0]?.price.id ?? null,
        status: subscription.status,
        current_period_end: subscription.items.data[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mandant_id' })

      invalidateBillingCache(mandantId)
      break
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      const mandantId = await getMandantId(customerId)
      if (!mandantId) break

      await admin.from('billing_subscriptions').update({
        status: subscription.status,
        stripe_price_id: subscription.items.data[0]?.price.id ?? null,
        current_period_end: subscription.items.data[0]?.current_period_end
          ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
          : null,
        cancelled_at: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }).eq('mandant_id', mandantId)

      invalidateBillingCache(mandantId)
      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const mandantId = await getMandantId(customerId)
      if (!mandantId) break

      await admin.from('billing_payments').upsert({
        mandant_id: mandantId,
        stripe_invoice_id: invoice.id,
        stripe_payment_intent_id: null,
        amount_cents: invoice.amount_paid,
        currency: invoice.currency,
        status: 'paid',
        charge_date: invoice.created
          ? new Date(invoice.created * 1000).toISOString().split('T')[0]
          : null,
      }, { onConflict: 'stripe_invoice_id' })

      // payment_failed zurücksetzen
      await admin.from('billing_subscriptions').update({
        payment_failed_at: null,
        updated_at: new Date().toISOString(),
      }).eq('mandant_id', mandantId)

      invalidateBillingCache(mandantId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      const mandantId = await getMandantId(customerId)
      if (!mandantId) break

      await admin.from('billing_subscriptions').update({
        payment_failed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('mandant_id', mandantId)

      invalidateBillingCache(mandantId)
      break
    }
  }

  return NextResponse.json({ received: true })
}
