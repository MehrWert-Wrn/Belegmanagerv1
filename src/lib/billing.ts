import { createAdminClient } from '@/lib/supabase/admin'

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'incomplete'
  | 'none'

export interface BillingStatus {
  hasAccess: boolean
  subscriptionStatus: SubscriptionStatus
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  currentPeriodEnd: string | null
}

// Simple in-memory cache (per-process, resets on cold start)
const cache = new Map<string, { value: BillingStatus; expiresAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min

export async function getBillingStatus(mandantId: string): Promise<BillingStatus> {
  const cached = cache.get(mandantId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('billing_subscriptions')
    .select('status, stripe_customer_id, stripe_subscription_id, current_period_end')
    .eq('mandant_id', mandantId)
    .maybeSingle()

  let status: SubscriptionStatus = 'none'
  if (sub) {
    if (sub.status === 'active' || sub.status === 'trialing') status = 'active'
    else if (sub.status === 'past_due') status = 'past_due'
    else if (sub.status === 'canceled' || sub.status === 'cancelled') status = 'cancelled'
    else status = 'incomplete'
  }

  const result: BillingStatus = {
    hasAccess: status === 'active' || status === 'none', // 'none' = noch kein Abo → Zugang offen (pre-launch)
    subscriptionStatus: status,
    stripeCustomerId: sub?.stripe_customer_id ?? null,
    stripeSubscriptionId: sub?.stripe_subscription_id ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
  }

  cache.set(mandantId, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
  return result
}

export function invalidateBillingCache(mandantId: string) {
  cache.delete(mandantId)
}
