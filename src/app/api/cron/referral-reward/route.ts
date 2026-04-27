/**
 * PROJ-31: Taeglicher Cron-Job fuer Referral-Rewards
 * GET /api/cron/referral-reward
 *
 * Wird taeglich um 06:00 UTC von Vercel Cron aufgerufen.
 * Prueft alle Referrals mit Status "pending":
 *   - converted_at >= 14 Tage zurueck
 *   - Stripe-Abo des geworbenen Mandanten ist noch aktiv
 * Bei Eligibility:
 *   - Stripe Credit Balance -5000 Cent (50 EUR) auf Referrer-Mandant
 *   - Status -> "rewarded", rewarded_at gesetzt
 *   - E-Mail 2 an Referrer
 * Falls Abo nicht mehr aktiv -> Status "expired".
 *
 * Authentifizierung via CRON_SECRET (Authorization: Bearer <secret>).
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import {
  REFERRAL_HOLDING_DAYS,
  REFERRAL_REWARD_AMOUNT_CENTS,
  maskEmail,
} from '@/lib/referral'
import { sendReferralRewardedEmail } from '@/lib/resend'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Cutoff: alle "pending" Referrals deren converted_at >= 14 Tage zurueck liegt
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - REFERRAL_HOLDING_DAYS)
  const cutoffIso = cutoff.toISOString()

  const { data: pending, error: loadError } = await admin
    .from('referrals')
    .select(
      'id, referral_code_id, referred_mandant_id, referred_email, converted_at',
    )
    .eq('status', 'pending')
    .not('converted_at', 'is', null)
    .lte('converted_at', cutoffIso)

  if (loadError) {
    console.error('[CRON referral-reward] load failed:', loadError)
    return NextResponse.json({ error: loadError.message }, { status: 500 })
  }

  type Result = {
    referral_id: string
    status: 'rewarded' | 'expired' | 'error' | 'skipped'
    fehler?: string
  }
  const results: Result[] = []

  for (const ref of pending ?? []) {
    try {
      // 1) Referrer-Mandant + dessen Stripe Customer ermitteln
      const { data: codeRow } = await admin
        .from('referral_codes')
        .select('mandant_id')
        .eq('id', ref.referral_code_id)
        .maybeSingle()

      if (!codeRow?.mandant_id) {
        results.push({ referral_id: ref.id, status: 'skipped', fehler: 'Referral-Code-Mandant nicht gefunden' })
        continue
      }

      const { data: refSub } = await admin
        .from('billing_subscriptions')
        .select('stripe_customer_id')
        .eq('mandant_id', codeRow.mandant_id)
        .maybeSingle()

      if (!refSub?.stripe_customer_id) {
        // Referrer ist noch Trial-User ohne Stripe Customer → pending lassen.
        // Guthaben wird gutgeschrieben sobald sie ein Abo abschliessen.
        results.push({ referral_id: ref.id, status: 'skipped', fehler: 'Referrer noch kein Stripe Customer' })
        continue
      }

      // 2) Pruefen, ob das Abo des geworbenen Mandanten noch aktiv ist
      if (!ref.referred_mandant_id) {
        await admin
          .from('referrals')
          .update({ status: 'expired' })
          .eq('id', ref.id)
        results.push({ referral_id: ref.id, status: 'expired', fehler: 'Kein geworbener Mandant' })
        continue
      }

      const { data: refereeSub } = await admin
        .from('billing_subscriptions')
        .select('status')
        .eq('mandant_id', ref.referred_mandant_id)
        .maybeSingle()

      const refereeActive =
        refereeSub?.status === 'active' || refereeSub?.status === 'trialing'

      if (!refereeActive) {
        await admin
          .from('referrals')
          .update({ status: 'expired' })
          .eq('id', ref.id)
        results.push({ referral_id: ref.id, status: 'expired', fehler: 'Referee-Abo nicht aktiv' })
        continue
      }

      // 3) Stripe Credit Balance Transaction anlegen (-5000 Cent = 50 EUR)
      const balanceTx = await stripe.customers.createBalanceTransaction(
        refSub.stripe_customer_id,
        {
          amount: -REFERRAL_REWARD_AMOUNT_CENTS,
          currency: 'eur',
          description: `Referral Reward – 50 EUR (Referral ${ref.id})`,
          metadata: {
            referral_id: ref.id,
            mandant_id: codeRow.mandant_id,
          },
        },
      )

      // 4) Referral aktualisieren
      const { error: updError } = await admin
        .from('referrals')
        .update({
          status: 'rewarded',
          rewarded_at: new Date().toISOString(),
          stripe_credit_transaction_id: balanceTx.id,
        })
        .eq('id', ref.id)

      if (updError) {
        console.error('[CRON referral-reward] update failed:', updError)
        results.push({ referral_id: ref.id, status: 'error', fehler: updError.message })
        continue
      }

      // 5) E-Mail 2 an Referrer
      try {
        const { data: referrerMandant } = await admin
          .from('mandanten')
          .select('owner_id')
          .eq('id', codeRow.mandant_id)
          .maybeSingle()

        if (referrerMandant?.owner_id) {
          const { data: referrerUser } = await admin.auth.admin.getUserById(
            referrerMandant.owner_id,
          )
          const recipientEmail = referrerUser?.user?.email
          if (recipientEmail) {
            await sendReferralRewardedEmail({
              recipientEmail,
              referredEmailMasked: maskEmail(ref.referred_email),
            })
          }
        }
      } catch (mailErr) {
        console.error('[CRON referral-reward] email send failed:', mailErr)
        // Mail-Fehler nicht blockierend
      }

      results.push({ referral_id: ref.id, status: 'rewarded' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      console.error('[CRON referral-reward] reward failed:', message)
      results.push({ referral_id: ref.id, status: 'error', fehler: message })
    }
  }

  const total = results.length
  const rewarded = results.filter((r) => r.status === 'rewarded').length
  const expired = results.filter((r) => r.status === 'expired').length
  const errors = results.filter((r) => r.status === 'error').length
  const skipped = results.filter((r) => r.status === 'skipped').length

  console.log(
    `[CRON referral-reward] geprueft=${total} | belohnt=${rewarded} | abgelaufen=${expired} | fehler=${errors} | uebersprungen=${skipped}`,
  )

  return NextResponse.json({
    geprueft: total,
    belohnt: rewarded,
    abgelaufen: expired,
    fehler: errors,
    uebersprungen: skipped,
    details: results,
  })
}
