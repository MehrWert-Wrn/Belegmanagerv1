/**
 * PROJ-31: POST /api/referral/register
 *
 * Wird vom Signup-Flow aufgerufen, sobald ein neuer Account angelegt wurde.
 * Verknuepft den (per Cookie/URL gelesenen) Referral-Code mit der Anmeldung
 * und setzt den Status auf "registered".
 *
 * Body: { code: "BM-XXXXXX", referred_email: "max@firma.at" }
 *
 * Response:
 *  200 → { ok: true, status: "registered" | "blocked_self_referral" | "duplicate" | "ignored" }
 *  400 → Validierungsfehler (Body, Code-Format)
 *  404 → Code existiert nicht
 *
 * Hinweis: Endpoint ist OEFFENTLICH erreichbar, da er waehrend des Signups
 * vor erfolgreicher Auth aufgerufen werden kann (E-Mail-Verifizierung steht
 * noch aus). Wir laufen dafuer mit Service-Role und validieren nur Format.
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { REFERRAL_CODE_REGEX, sameEmailDomain } from '@/lib/referral'

export const runtime = 'nodejs'

const schema = z.object({
  code: z.string().regex(REFERRAL_CODE_REGEX, 'Ungueltiges Code-Format'),
  referred_email: z.string().email('Ungueltige E-Mail'),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON-Body erforderlich' }, { status: 400 })
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validierung fehlgeschlagen', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const code = parsed.data.code.toUpperCase()
  const referredEmail = parsed.data.referred_email.toLowerCase()

  const admin = createAdminClient()

  // 1) Code laden
  const { data: codeRow, error: codeError } = await admin
    .from('referral_codes')
    .select('id, mandant_id')
    .eq('code', code)
    .maybeSingle()

  if (codeError) {
    console.error('[/api/referral/register] code lookup failed:', codeError)
    return NextResponse.json({ error: 'Datenbank-Fehler' }, { status: 500 })
  }
  if (!codeRow) {
    // Stille Antwort – kein 404, damit User keine Code-Existenz erraten
    return NextResponse.json({ ok: true, status: 'ignored' })
  }

  // 2) Self-Referral pruefen: Wenn die referred_email bereits zum Referrer-Mandant
  //    gehoert, kein Eintrag.
  const { data: referrerMandant } = await admin
    .from('mandanten')
    .select('id, owner_id')
    .eq('id', codeRow.mandant_id)
    .maybeSingle()

  if (referrerMandant?.owner_id) {
    const { data: referrerUser } = await admin.auth.admin.getUserById(
      referrerMandant.owner_id,
    )
    if (
      referrerUser?.user?.email &&
      referrerUser.user.email.toLowerCase() === referredEmail
    ) {
      return NextResponse.json({ ok: true, status: 'blocked_self_referral' })
    }
  }

  // 2b) Verify referred_email is a freshly created auth user (≤10 min ago).
  //     Prevents fake registrations with arbitrary email addresses (BUG-002).
  const { data: isRecentUser, error: recentUserError } = await admin.rpc(
    'check_recent_auth_user',
    { p_email: referredEmail, p_minutes: 10 },
  )
  if (recentUserError) {
    console.error('[/api/referral/register] check_recent_auth_user failed:', recentUserError)
    return NextResponse.json({ error: 'Verifizierung fehlgeschlagen' }, { status: 500 })
  }
  if (!isRecentUser) {
    return NextResponse.json({ ok: true, status: 'ignored' })
  }

  // 3) Duplikat pruefen – gleiche E-Mail + gleicher Code → kein neuer Eintrag (BUG-006: check error too)
  const { data: duplicate, error: dupError } = await admin
    .from('referrals')
    .select('id')
    .eq('referral_code_id', codeRow.id)
    .eq('referred_email', referredEmail)
    .not('status', 'eq', 'clicked')
    .limit(1)
    .maybeSingle()

  if (dupError) {
    console.error('[/api/referral/register] duplicate check failed:', dupError)
    return NextResponse.json({ error: 'Datenbank-Fehler' }, { status: 500 })
  }
  if (duplicate) {
    return NextResponse.json({ ok: true, status: 'duplicate' })
  }

  // 4) same_domain_flag berechnen (Referrer-E-Mail vs. referee)
  let sameDomainFlag = false
  if (referrerMandant?.owner_id) {
    const { data: rUser } = await admin.auth.admin.getUserById(
      referrerMandant.owner_id,
    )
    sameDomainFlag = sameEmailDomain(rUser?.user?.email ?? null, referredEmail)
  }

  // 5) Existierenden 'clicked'-Eintrag (vom Landing-Page-Klick) auf 'registered'
  //    upgraden; sonst neuen Eintrag mit Status 'registered'.
  const { data: existingClick } = await admin
    .from('referrals')
    .select('id')
    .eq('referral_code_id', codeRow.id)
    .eq('status', 'clicked')
    .is('referred_email', null)
    .order('clicked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingClick) {
    const { error: updError } = await admin
      .from('referrals')
      .update({
        status: 'registered',
        registered_at: new Date().toISOString(),
        referred_email: referredEmail,
        same_domain_flag: sameDomainFlag,
      })
      .eq('id', existingClick.id)

    if (updError) {
      console.error('[/api/referral/register] update failed:', updError)
      return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
    }
  } else {
    const { error: insError } = await admin.from('referrals').insert({
      referral_code_id: codeRow.id,
      status: 'registered',
      clicked_at: new Date().toISOString(),
      registered_at: new Date().toISOString(),
      referred_email: referredEmail,
      same_domain_flag: sameDomainFlag,
    })

    if (insError) {
      console.error('[/api/referral/register] insert failed:', insError)
      return NextResponse.json({ error: 'Insert fehlgeschlagen' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, status: 'registered' })
}
