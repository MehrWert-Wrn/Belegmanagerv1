/**
 * PROJ-31: GET /api/referral/code
 *
 * Liefert (oder generiert lazy) den eindeutigen Empfehlungs-Code des
 * aktuellen Mandanten. Erfordert authentifizierten User mit aktivem Abo.
 *
 * Response:
 *  200 → { code: "BM-XY7K2A", referral_link: "https://.../ref/BM-XY7K2A" }
 *  401 → nicht authentifiziert
 *  403 → kein aktives Abo (Widget versteckt sich dann)
 *  404 → kein Mandant gefunden
 *  500 → Code konnte nicht erzeugt werden
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBillingStatus } from '@/lib/billing'
import { getOrCreateReferralCode } from '@/lib/referral'

export const runtime = 'nodejs'

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

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

  // Feature-Gate: Widget nur fuer Mandanten mit aktivem Abo
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

  const referralLink = `${getSiteUrl()}/ref/${referralCode.code}`

  return NextResponse.json({
    code: referralCode.code,
    referral_link: referralLink,
  })
}
