import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateBillingCache } from '@/lib/billing'
import { sendReferralPendingEmail } from '@/lib/resend'
import { maskEmail, sameEmailDomain } from '@/lib/referral'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

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

      // PROJ-31: Referral-Conversion-Logik
      // Wenn der gerade gewonnene Mandant ueber einen Referral-Link kam,
      // setzen wir den Referral auf "pending" und senden E-Mail 1 an den Referrer.
      try {
        await processReferralConversion(admin, mandantId, customerId)
      } catch (refErr) {
        console.error('[webhook] referral conversion failed:', refErr)
        // Nicht blockierend
      }
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
        stripe_payment_intent_id: null, // TODO BUG-007: payment_intent field not available in Stripe API 2026-03-25.dahlia
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

// ---------------------------------------------------------------------------
// PROJ-31: Referral-Conversion bei checkout.session.completed
// ---------------------------------------------------------------------------

/**
 * Wird vom Stripe-Webhook bei "checkout.session.completed" aufgerufen,
 * sobald ein Mandant ein kostenpflichtiges Abo abschliesst.
 *
 * Flow:
 *  1) Pruefen, ob ein passender Referral mit Status "registered" existiert
 *     (Match ueber referred_email == primaere E-Mail des neuen Mandanten).
 *  2) Self-Referral pruefen (gleiche Mandant-ID) -> blocked.
 *  3) Payment-Method-Fingerprint pruefen -> blocked, wenn schon einmal verwendet.
 *  4) Sonst: Status "pending", converted_at gesetzt, referred_mandant_id gesetzt,
 *     reward_eligible_at = now + 14 Tage. E-Mail 1 an Referrer.
 */
async function processReferralConversion(
  admin: SupabaseClient,
  refereeMandantId: string,
  customerId: string,
): Promise<void> {
  // 1) Primary E-Mail des geworbenen Mandanten ermitteln
  const { data: refereeMandant } = await admin
    .from('mandanten')
    .select('owner_id')
    .eq('id', refereeMandantId)
    .maybeSingle()

  if (!refereeMandant?.owner_id) return

  const { data: refereeUserResp } = await admin.auth.admin.getUserById(
    refereeMandant.owner_id,
  )
  const refereeEmail = refereeUserResp?.user?.email?.toLowerCase()
  if (!refereeEmail) return

  // 2) Passenden Referral-Eintrag finden (status registered + gleiche E-Mail)
  const { data: referrals } = await admin
    .from('referrals')
    .select('id, referral_code_id, referred_email, status')
    .eq('referred_email', refereeEmail)
    .in('status', ['registered', 'clicked'])
    .order('clicked_at', { ascending: false })
    .limit(1)

  const referral = referrals?.[0]
  if (!referral) return

  // 3) Referrer-Mandant ueber den Code finden
  const { data: codeRow } = await admin
    .from('referral_codes')
    .select('mandant_id')
    .eq('id', referral.referral_code_id)
    .maybeSingle()

  if (!codeRow?.mandant_id) return

  // 4) Self-Referral – gleiche Mandant-ID -> blocked
  if (codeRow.mandant_id === refereeMandantId) {
    await admin
      .from('referrals')
      .update({ status: 'blocked', blocked_reason: 'self_referral' })
      .eq('id', referral.id)
    return
  }

  // 5) Payment-Method-Fingerprint laden (Fraud Check)
  let fingerprint: string | null = null
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })
    if (
      customer &&
      !('deleted' in customer && customer.deleted) &&
      customer.invoice_settings?.default_payment_method &&
      typeof customer.invoice_settings.default_payment_method !== 'string' &&
      customer.invoice_settings.default_payment_method.card?.fingerprint
    ) {
      fingerprint =
        customer.invoice_settings.default_payment_method.card.fingerprint
    }
  } catch (err) {
    console.error('[webhook] could not load payment method fingerprint:', err)
  }

  if (fingerprint) {
    const { data: existingFp } = await admin
      .from('referrals')
      .select('id')
      .eq('payment_method_fingerprint', fingerprint)
      .neq('id', referral.id)
      .limit(1)
      .maybeSingle()

    if (existingFp) {
      await admin
        .from('referrals')
        .update({
          status: 'blocked',
          blocked_reason: 'payment_method',
          payment_method_fingerprint: fingerprint,
        })
        .eq('id', referral.id)
      return
    }
  }

  // 6) Referrer-E-Mail fuer Domain-Check + spaetere E-Mail-Notification
  const { data: referrerMandant } = await admin
    .from('mandanten')
    .select('owner_id')
    .eq('id', codeRow.mandant_id)
    .maybeSingle()

  let referrerEmail: string | null = null
  if (referrerMandant?.owner_id) {
    const { data: rUser } = await admin.auth.admin.getUserById(
      referrerMandant.owner_id,
    )
    referrerEmail = rUser?.user?.email ?? null
  }

  const sameDomainFlag = sameEmailDomain(referrerEmail, refereeEmail)

  // 7) Eligibility-Datum (heute + 14 Tage)
  const now = new Date()
  const eligible = new Date(now)
  eligible.setUTCDate(eligible.getUTCDate() + 14)

  const { error: updError } = await admin
    .from('referrals')
    .update({
      status: 'pending',
      converted_at: now.toISOString(),
      reward_eligible_at: eligible.toISOString(),
      referred_mandant_id: refereeMandantId,
      payment_method_fingerprint: fingerprint,
      same_domain_flag: sameDomainFlag,
    })
    .eq('id', referral.id)

  if (updError) {
    console.error('[webhook] referral status -> pending failed:', updError)
    return
  }

  // 8) E-Mail 1 an Referrer
  if (referrerEmail) {
    await sendReferralPendingEmail({
      recipientEmail: referrerEmail,
      referredEmailMasked: maskEmail(refereeEmail),
    })
  }
}
