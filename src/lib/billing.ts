import { unstable_cache, revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

export type BillingStatus = {
  trialActive: boolean
  trialEndsAt: string | null
  trialDaysLeft: number | null
  subscriptionActive: boolean
  subscriptionStatus: string | null
  subscriptionId: string | null
  gcSubscriptionId: string | null
  gcMandateId: string | null
  currentPeriodEnd: string | null
  paymentFailedAt: string | null
  hasAccess: boolean
  showTrialBanner: boolean
}

export type AccessStatus = 'trial' | 'active' | 'grace' | 'blocked'

function computeBillingStatus(
  trialEndsAt: string | null,
  sub: { status: string; id: string; gc_subscription_id: string | null; gc_mandate_id: string | null; current_period_end: string | null; payment_failed_at: string | null } | null
): BillingStatus {
  const now = new Date()

  // Trial
  const trialDate = trialEndsAt ? new Date(trialEndsAt) : null
  const trialActive = trialDate ? trialDate > now : false
  const trialDaysLeft = trialDate
    ? Math.max(0, Math.ceil((trialDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null

  // Subscription
  const subStatus = sub?.status ?? null
  const subscriptionActive = subStatus === 'active'

  // Grace period: payment_failed within last 3 days
  const gracePeriodActive =
    subStatus === 'payment_failed' &&
    sub?.payment_failed_at != null &&
    new Date(sub.payment_failed_at).getTime() > now.getTime() - 3 * 24 * 60 * 60 * 1000

  const hasAccess = trialActive || subscriptionActive || gracePeriodActive

  // Show trial banner: trial still running AND no active subscription
  const showTrialBanner = trialActive && !subscriptionActive

  return {
    trialActive,
    trialEndsAt,
    trialDaysLeft,
    subscriptionActive,
    subscriptionStatus: subStatus,
    subscriptionId: sub?.id ?? null,
    gcSubscriptionId: sub?.gc_subscription_id ?? null,
    gcMandateId: sub?.gc_mandate_id ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    paymentFailedAt: sub?.payment_failed_at ?? null,
    hasAccess,
    showTrialBanner,
  }
}

// Cached for 30 minutes per mandant_id (revalidated via tag on webhook)
export function getBillingStatus(mandantId: string): Promise<BillingStatus> {
  return unstable_cache(
    async () => {
      const admin = createAdminClient()

      const [{ data: mandant }, { data: sub }] = await Promise.all([
        admin
          .from('mandanten')
          .select('trial_ends_at')
          .eq('id', mandantId)
          .single(),
        admin
          .from('billing_subscriptions')
          .select('id, status, gc_subscription_id, gc_mandate_id, current_period_end, payment_failed_at')
          .eq('mandant_id', mandantId)
          .in('status', ['active', 'payment_failed', 'pending_mandate', 'paused'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      return computeBillingStatus(
        mandant?.trial_ends_at ?? null,
        sub ?? null
      )
    },
    [`billing-status-${mandantId}`],
    { revalidate: 1800 }
  )()
}

// Utility for webhook / API routes to invalidate cache after status change
// Revalidates the app layout so billing status is re-fetched on next request
export function invalidateBillingCache(_mandantId: string) {
  revalidatePath('/', 'layout')
}
