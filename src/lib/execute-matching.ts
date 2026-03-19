/**
 * Server-side matching execution helper.
 * Shared by /api/matching/run and /api/belege (post-upload trigger).
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { runMatchingBatch } from '@/lib/matching'

export type MatchingStats = {
  matched: number
  suggested: number
  unmatched: number
  total: number
}

/**
 * Runs the matching batch for all open/vorgeschlagen transactions of a mandant.
 * Optionally scoped to a single quelle_id.
 */
export async function executeMatching(
  supabase: SupabaseClient,
  mandantId: string,
  quelleId?: string
): Promise<MatchingStats> {
  // Load open transactions
  let transaktionenQuery = supabase
    .from('transaktionen')
    .select('id, datum, betrag, beschreibung, iban_gegenseite, buchungsreferenz, match_abgelehnte_beleg_ids')
    .eq('mandant_id', mandantId)
    .in('match_status', ['offen', 'vorgeschlagen'])

  if (quelleId) transaktionenQuery = transaktionenQuery.eq('quelle_id', quelleId)

  const { data: transaktionen, error: tErr } = await transaktionenQuery
  if (tErr) throw new Error(tErr.message)

  // Load open belege
  const { data: belege, error: bErr } = await supabase
    .from('belege')
    .select('id, lieferant, lieferant_iban, rechnungsnummer, bruttobetrag, rechnungsdatum')
    .eq('mandant_id', mandantId)
    .eq('zuordnungsstatus', 'offen')
    .is('geloescht_am', null)

  if (bErr) throw new Error(bErr.message)

  if (!transaktionen?.length || !belege?.length) {
    return { matched: 0, suggested: 0, unmatched: 0, total: transaktionen?.length ?? 0 }
  }

  const results = runMatchingBatch(
    transaktionen.map(t => ({
      ...t,
      match_abgelehnte_beleg_ids: t.match_abgelehnte_beleg_ids ?? [],
    })),
    belege
  )

  // Track which belege are already assigned in this batch run (deduplication)
  const assignedBelegIds = new Set<string>()

  let matched = 0, suggested = 0, unmatched = 0

  for (const result of results) {
    // BUG-PROJ5-004/010: beleg already taken → flag as vorgeschlagen (orange) for manual resolution
    if (result.beleg_id && assignedBelegIds.has(result.beleg_id)) {
      await supabase
        .from('transaktionen')
        .update({ match_status: 'vorgeschlagen', match_score: result.match_score, match_type: result.match_type, beleg_id: result.beleg_id })
        .eq('id', result.transaktion_id)
      suggested++
      continue
    }

    await supabase
      .from('transaktionen')
      .update({
        match_status: result.match_status,
        match_score: result.match_score,
        match_type: result.match_type,
        beleg_id: result.beleg_id,
      })
      .eq('id', result.transaktion_id)

    if (result.match_status === 'bestaetigt') {
      matched++
      if (result.beleg_id) {
        assignedBelegIds.add(result.beleg_id)
        await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', result.beleg_id)
      }
    } else if (result.match_status === 'vorgeschlagen') {
      suggested++
    } else {
      unmatched++
    }
  }

  return { matched, suggested, unmatched, total: results.length }
}
