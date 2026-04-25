/**
 * PROJ-31: GET /api/referral/stats
 *
 * Liefert Statistiken + Liste der Referrals fuer Dashboard-Widget und
 * Full Page (/referral). Nur eigene Referrals dank RLS.
 *
 * Response:
 *  200 → {
 *    total_referrals, active_rewards, saved_months, saved_euros,
 *    referrals: [{ id, clicked_at, registered_at, rewarded_at,
 *                  referred_email, status, same_domain_flag }, ...]
 *  }
 *  401 → nicht authentifiziert
 *  403 → kein aktives Abo
 *  404 → kein Mandant gefunden
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBillingStatus } from '@/lib/billing'
import {
  getOrCreateReferralCode,
  rewardedToMonths,
  rewardedToEuros,
} from '@/lib/referral'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  const billing = await getBillingStatus(mandant.id)
  const hasActive =
    billing.subscriptionStatus === 'active' || billing.adminOverrideActive
  if (!hasActive) {
    return NextResponse.json(
      { error: 'Empfehlungsprogramm erfordert ein aktives Abo' },
      { status: 403 },
    )
  }

  const referralCode = await getOrCreateReferralCode(admin, mandant.id)
  if (!referralCode) {
    return NextResponse.json(
      { error: 'Empfehlungs-Code konnte nicht erzeugt werden' },
      { status: 500 },
    )
  }

  // Referrals laden – sortiert nach clicked_at desc, limitiert auf 200
  const { data: referrals, error: refError } = await admin
    .from('referrals')
    .select(
      'id, clicked_at, registered_at, rewarded_at, referred_email, status, same_domain_flag',
    )
    .eq('referral_code_id', referralCode.id)
    .order('clicked_at', { ascending: false })
    .limit(200)

  if (refError) {
    console.error('[/api/referral/stats] referrals load failed:', refError)
    return NextResponse.json(
      { error: 'Empfehlungen konnten nicht geladen werden' },
      { status: 500 },
    )
  }

  const all = referrals ?? []
  const totalReferrals = all.length
  const activeRewards = all.filter((r) => r.status === 'rewarded').length
  const savedMonths = rewardedToMonths(activeRewards)
  const savedEuros = rewardedToEuros(activeRewards)

  return NextResponse.json({
    total_referrals: totalReferrals,
    active_rewards: activeRewards,
    saved_months: savedMonths,
    saved_euros: savedEuros,
    referrals: all,
  })
}
