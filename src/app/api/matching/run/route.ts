import { createClient } from '@/lib/supabase/server'
import { runMatchingBatch } from '@/lib/matching'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  quelle_id: z.string().uuid().optional(), // optional: nur eine Quelle matchen
})

// POST /api/matching/run – Matching für alle offenen Transaktionen des Mandanten
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { quelle_id } = schema.parse(body)

  // Mandant ermitteln
  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Ungematchte Transaktionen laden (offen oder vorgeschlagen – beide neu berechnen)
  let transaktionenQuery = supabase
    .from('transaktionen')
    .select('id, datum, betrag, beschreibung, iban_gegenseite, buchungsreferenz, match_abgelehnte_beleg_ids')
    .eq('mandant_id', mandant.id)
    .in('match_status', ['offen', 'vorgeschlagen'])

  if (quelle_id) transaktionenQuery = transaktionenQuery.eq('quelle_id', quelle_id)

  const { data: transaktionen, error: tErr } = await transaktionenQuery
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Offene Belege laden (nicht gelöscht, nicht zugeordnet)
  const { data: belege, error: bErr } = await supabase
    .from('belege')
    .select('id, lieferant, rechnungsnummer, bruttobetrag, rechnungsdatum')
    .eq('mandant_id', mandant.id)
    .eq('zuordnungsstatus', 'offen')
    .is('geloescht_am', null)

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  if (!transaktionen?.length || !belege?.length) {
    return NextResponse.json({ matched: 0, suggested: 0, unmatched: 0, total: transaktionen?.length ?? 0 })
  }

  // Matching-Batch ausführen
  const results = runMatchingBatch(
    transaktionen.map(t => ({
      ...t,
      match_abgelehnte_beleg_ids: t.match_abgelehnte_beleg_ids ?? [],
    })),
    belege
  )

  // Ergebnisse in DB schreiben
  let matched = 0, suggested = 0, unmatched = 0

  for (const result of results) {
    const update: Record<string, unknown> = {
      match_status: result.match_status,
      match_score: result.match_score,
      match_type: result.match_type,
      beleg_id: result.beleg_id,
    }

    await supabase
      .from('transaktionen')
      .update(update)
      .eq('id', result.transaktion_id)

    if (result.match_status === 'bestaetigt') {
      matched++
      // Beleg als zugeordnet markieren
      if (result.beleg_id) {
        await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', result.beleg_id)
      }
    } else if (result.match_status === 'vorgeschlagen') suggested++
    else unmatched++
  }

  return NextResponse.json({
    matched,
    suggested,
    unmatched,
    total: results.length,
    match_quote: Math.round((matched / results.length) * 100),
  })
}
