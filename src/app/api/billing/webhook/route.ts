import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'gocardless-nodejs/webhooks'
import { createAdminClient } from '@/lib/supabase/admin'
import { gc } from '@/lib/gocardless'
import { invalidateBillingCache } from '@/lib/billing'

// GoCardless requires the raw body for signature verification
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.GOCARDLESS_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[billing/webhook] GOCARDLESS_WEBHOOK_SECRET not configured')
    return new NextResponse('Server misconfigured', { status: 500 })
  }

  const signature = request.headers.get('Webhook-Signature')
  if (!signature) {
    return new NextResponse('Missing signature', { status: 401 })
  }

  const rawBody = await request.text()

  let events
  try {
    events = parse(rawBody, webhookSecret, signature)
  } catch {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const admin = createAdminClient()

  for (const event of events) {
    try {
      await handleEvent(admin, event)
    } catch (err) {
      console.error(`[billing/webhook] Error handling event ${event.id} (${event.action}):`, err)
      // Don't fail the whole request – GoCardless will retry
    }
  }

  return new NextResponse('OK', { status: 200 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvent(admin: ReturnType<typeof createAdminClient>, event: any) {
  const resourceType = event.resource_type
  const action = event.action
  const links = event.links ?? {}

  switch (`${resourceType}.${action}`) {
    // ── Mandate fulfilled: mandate ID is now available ──────────────
    case 'billing_requests.fulfilled': {
      const billingRequestId = links.billing_request
      const mandateId = links.mandate

      if (!billingRequestId || !mandateId) break

      const { data: sub } = await admin
        .from('billing_subscriptions')
        .select('id, mandant_id, plan_id')
        .eq('gc_billing_request_id', billingRequestId)
        .maybeSingle()

      if (!sub) break

      // Get the plan amount
      const { data: plan } = await admin
        .from('billing_plans')
        .select('amount_cents, currency')
        .eq('id', sub.plan_id)
        .maybeSingle()

      const amountCents = plan?.amount_cents ?? 2900
      const currency = plan?.currency ?? 'EUR'

      // Create GoCardless subscription referencing the Subscription Template
      const templateId = process.env.GOCARDLESS_SUBSCRIPTION_TEMPLATE_ID
      let gcSubscriptionId: string | null = null
      try {
        const gcSub = await gc.subscriptions.create({
          amount: String(amountCents),
          currency,
          name: 'Belegmanager.at-Software - automatisierte Belegerfassung',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          interval_unit: 'monthly' as any,
          day_of_month: '1',
          metadata: templateId ? { subscription_template: templateId } : undefined,
          links: { mandate: mandateId },
        })
        gcSubscriptionId = gcSub.id ?? null
      } catch (err) {
        console.error('[billing/webhook] Failed to create subscription:', err)
      }

      await admin
        .from('billing_subscriptions')
        .update({
          status: 'active',
          gc_mandate_id: mandateId,
          gc_subscription_id: gcSubscriptionId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sub.id)

      invalidateBillingCache(sub.mandant_id)
      break
    }

    // ── Payment paid out ─────────────────────────────────────────────
    case 'payments.paid_out': {
      const gcPaymentId = links.payment
      if (!gcPaymentId) break

      // Find the subscription via payment details from GC
      const gcPayment = await gc.payments.find(gcPaymentId).catch(() => null)
      if (!gcPayment) break

      const gcSubscriptionId = gcPayment.links?.subscription
      if (!gcSubscriptionId) break

      const { data: sub } = await admin
        .from('billing_subscriptions')
        .select('id, mandant_id')
        .eq('gc_subscription_id', gcSubscriptionId)
        .maybeSingle()

      if (!sub) break

      // Upsert payment (idempotent via gc_payment_id UNIQUE)
      await admin.from('billing_payments').upsert({
        mandant_id: sub.mandant_id,
        subscription_id: sub.id,
        gc_payment_id: gcPaymentId,
        amount_cents: gcPayment.amount ?? 0,
        currency: gcPayment.currency ?? 'EUR',
        status: 'paid_out',
        charge_date: gcPayment.charge_date ?? null,
      }, { onConflict: 'gc_payment_id' })

      await admin
        .from('billing_subscriptions')
        .update({ status: 'active', payment_failed_at: null, updated_at: new Date().toISOString() })
        .eq('id', sub.id)

      invalidateBillingCache(sub.mandant_id)
      break
    }

    // ── Payment failed ───────────────────────────────────────────────
    case 'payments.failed': {
      const gcPaymentId = links.payment
      if (!gcPaymentId) break

      const gcPayment = await gc.payments.find(gcPaymentId).catch(() => null)
      if (!gcPayment) break

      const gcSubscriptionId = gcPayment.links?.subscription
      if (!gcSubscriptionId) break

      const { data: sub } = await admin
        .from('billing_subscriptions')
        .select('id, mandant_id')
        .eq('gc_subscription_id', gcSubscriptionId)
        .maybeSingle()

      if (!sub) break

      const now = new Date().toISOString()

      await admin.from('billing_payments').upsert({
        mandant_id: sub.mandant_id,
        subscription_id: sub.id,
        gc_payment_id: gcPaymentId,
        amount_cents: gcPayment.amount ?? 0,
        currency: gcPayment.currency ?? 'EUR',
        status: 'failed',
        charge_date: gcPayment.charge_date ?? null,
      }, { onConflict: 'gc_payment_id' })

      await admin
        .from('billing_subscriptions')
        .update({ status: 'payment_failed', payment_failed_at: now, updated_at: now })
        .eq('id', sub.id)

      // TODO: Send payment failure e-mail to mandant (Resend / Supabase Auth email)
      // Planned in spec US-4, implement when email provider is set up

      invalidateBillingCache(sub.mandant_id)
      break
    }

    // ── Subscription cancelled (e.g. by GoCardless) ──────────────────
    case 'subscriptions.cancelled': {
      const gcSubscriptionId = links.subscription
      if (!gcSubscriptionId) break

      const { data: sub } = await admin
        .from('billing_subscriptions')
        .select('id, mandant_id')
        .eq('gc_subscription_id', gcSubscriptionId)
        .maybeSingle()

      if (!sub) break

      await admin
        .from('billing_subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', sub.id)

      invalidateBillingCache(sub.mandant_id)
      break
    }

    // ── Mandate cancelled / expired ──────────────────────────────────
    case 'mandates.cancelled':
    case 'mandates.expired': {
      const gcMandateId = links.mandate
      if (!gcMandateId) break

      const { data: sub } = await admin
        .from('billing_subscriptions')
        .select('id, mandant_id')
        .eq('gc_mandate_id', gcMandateId)
        .maybeSingle()

      if (!sub) break

      const now = new Date().toISOString()
      await admin
        .from('billing_subscriptions')
        .update({ status: 'payment_failed', payment_failed_at: now, updated_at: now })
        .eq('id', sub.id)

      // TODO: Send mandate expired e-mail to mandant

      invalidateBillingCache(sub.mandant_id)
      break
    }

    default:
      // Ignore unhandled events
      break
  }
}
