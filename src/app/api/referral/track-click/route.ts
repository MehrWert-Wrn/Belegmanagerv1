/**
 * PROJ-31: POST /api/referral/track-click
 *
 * Oeffentlicher Endpoint zum Tracken eines Klicks auf einen Referral-Link.
 * Wird primaer von der Server-Component /ref/[code] verwendet, kann aber
 * auch direkt vom Client (z. B. fuer Tests) aufgerufen werden.
 *
 * Body: { code: "BM-XXXXXX" }
 *
 * Response:
 *  200 → { ok: true, total_clicks: number }
 *  400 → Validierungsfehler
 *  404 → Code existiert nicht (silent, keine Code-Enumeration)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { REFERRAL_CODE_REGEX } from '@/lib/referral'

export const runtime = 'nodejs'

const schema = z.object({
  code: z.string().regex(REFERRAL_CODE_REGEX, 'Ungueltiges Code-Format'),
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
    return NextResponse.json({ error: 'Validierung fehlgeschlagen' }, { status: 400 })
  }

  const code = parsed.data.code.toUpperCase()
  const admin = createAdminClient()

  // RPC erhoeht atomar total_clicks und liefert die referral_codes.id zurueck
  const { data: codeId, error: rpcError } = await admin.rpc(
    'increment_referral_clicks',
    { p_code: code },
  )

  if (rpcError) {
    console.error('[/api/referral/track-click] rpc failed:', rpcError)
    return NextResponse.json({ error: 'Tracking fehlgeschlagen' }, { status: 500 })
  }

  if (!codeId) {
    // Stille Antwort – Code existiert nicht
    return NextResponse.json({ ok: true, total_clicks: 0 })
  }

  // Optional: Referral-Eintrag mit Status 'clicked' anlegen
  await admin.from('referrals').insert({
    referral_code_id: codeId,
    status: 'clicked',
    clicked_at: new Date().toISOString(),
  })

  // Aktuellen Stand zurueckgeben
  const { data: codeRow } = await admin
    .from('referral_codes')
    .select('total_clicks')
    .eq('id', codeId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    total_clicks: codeRow?.total_clicks ?? 0,
  })
}
