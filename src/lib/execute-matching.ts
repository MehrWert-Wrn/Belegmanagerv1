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
  kein_beleg: number
  total: number
}

const PARALLEL_CHUNK = 50 // max concurrent Supabase update calls per batch

/**
 * Runs the matching batch for all open/vorgeschlagen transactions of a mandant.
 * Optionally scoped to a single quelle_id.
 */
export async function executeMatching(
  supabase: SupabaseClient,
  mandantId: string,
  quelleId?: string
): Promise<MatchingStats> {
  // Load kein_beleg_regeln for this mandant
  const { data: regeln } = await supabase
    .from('kein_beleg_regeln')
    .select('pattern')
    .eq('mandant_id', mandantId)
  const patterns = (regeln ?? []).map(r => r.pattern.toLowerCase())

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
    .select('id, lieferant, rechnungsempfaenger, lieferant_iban, rechnungsnummer, bruttobetrag, rechnungsdatum, mandatsreferenz, zahlungsreferenz, bestellnummer')
    .eq('mandant_id', mandantId)
    .eq('zuordnungsstatus', 'offen')
    .is('geloescht_am', null)

  if (bErr) throw new Error(bErr.message)

  if (!transaktionen?.length) {
    return { matched: 0, suggested: 0, unmatched: 0, kein_beleg: 0, total: 0 }
  }

  // Apply kein_beleg_regeln: collect IDs first, then do a single batch update
  let keinBelegCount = 0
  const matchingTransaktionen = []
  const keinBelegIds: string[] = []

  if (patterns.length > 0) {
    for (const t of transaktionen) {
      const desc = (t.beschreibung ?? '').toLowerCase()
      const matchesRule = patterns.some(p => desc.includes(p))
      if (matchesRule) {
        keinBelegIds.push(t.id)
        keinBelegCount++
      } else {
        matchingTransaktionen.push(t)
      }
    }
  } else {
    matchingTransaktionen.push(...transaktionen)
  }

  // Single batch update for all kein_beleg transactions
  if (keinBelegIds.length > 0) {
    await supabase
      .from('transaktionen')
      .update({ match_status: 'kein_beleg', beleg_id: null, match_score: 0, match_type: null })
      .in('id', keinBelegIds)
  }

  if (!matchingTransaktionen.length || !belege?.length) {
    return { matched: 0, suggested: 0, unmatched: matchingTransaktionen.length, kein_beleg: keinBelegCount, total: transaktionen.length }
  }

  const results = runMatchingBatch(
    matchingTransaktionen.map(t => ({
      ...t,
      match_abgelehnte_beleg_ids: t.match_abgelehnte_beleg_ids ?? [],
    })),
    belege.map(b => ({
      ...b,
      rechnungsempfaenger: b.rechnungsempfaenger ?? null,
      mandatsreferenz: b.mandatsreferenz ?? null,
      zahlungsreferenz: b.zahlungsreferenz ?? null,
      bestellnummer: b.bestellnummer ?? null,
    }))
  )

  // Determine final state for each transaction in memory (no sequential DB calls yet)
  type TransaktionUpdate = {
    id: string
    match_status: 'bestaetigt' | 'vorgeschlagen' | 'offen'
    match_score: number
    match_type: string | null
    beleg_id: string | null
  }

  const transaktionUpdates: TransaktionUpdate[] = []
  const belegIdsToZugeordnet: string[] = []
  const assignedBelegIds = new Set<string>()
  let matched = 0, suggested = 0, unmatched = 0

  for (const result of results) {
    // BUG-PROJ5-004/010: beleg already taken → flag as vorgeschlagen for manual resolution
    if (result.beleg_id && assignedBelegIds.has(result.beleg_id)) {
      transaktionUpdates.push({
        id: result.transaktion_id,
        match_status: 'vorgeschlagen',
        match_score: result.match_score,
        match_type: result.match_type,
        beleg_id: result.beleg_id,
      })
      suggested++
      continue
    }

    transaktionUpdates.push({
      id: result.transaktion_id,
      match_status: result.match_status,
      match_score: result.match_score,
      match_type: result.match_type,
      beleg_id: result.beleg_id,
    })

    if (result.match_status === 'bestaetigt') {
      matched++
      if (result.beleg_id) {
        assignedBelegIds.add(result.beleg_id)
        belegIdsToZugeordnet.push(result.beleg_id)
      }
    } else if (result.match_status === 'vorgeschlagen') {
      suggested++
    } else {
      unmatched++
    }
  }

  // Batch update transactions in parallel chunks (avoids N sequential round-trips)
  for (let i = 0; i < transaktionUpdates.length; i += PARALLEL_CHUNK) {
    const chunk = transaktionUpdates.slice(i, i + PARALLEL_CHUNK)
    await Promise.all(
      chunk.map(u =>
        supabase
          .from('transaktionen')
          .update({
            match_status: u.match_status,
            match_score: u.match_score,
            match_type: u.match_type,
            beleg_id: u.beleg_id,
          })
          .eq('id', u.id)
      )
    )
  }

  // Single batch update for all newly-assigned belege
  if (belegIdsToZugeordnet.length > 0) {
    await supabase
      .from('belege')
      .update({ zuordnungsstatus: 'zugeordnet' })
      .in('id', belegIdsToZugeordnet)
  }

  // BUG-PROJ5-R4-004: Post-processing to resolve duplicate beleg assignments from concurrent runs.
  if (assignedBelegIds.size > 0) {
    const { data: conflicts } = await supabase
      .from('transaktionen')
      .select('id, beleg_id, match_score')
      .in('beleg_id', [...assignedBelegIds])
      .eq('match_status', 'bestaetigt')
      .is('geloescht_am', null)

    if (conflicts && conflicts.length > 0) {
      const grouped = new Map<string, Array<{ id: string; match_score: number | null }>>()
      for (const t of conflicts) {
        if (!t.beleg_id) continue
        const list = grouped.get(t.beleg_id) ?? []
        list.push(t)
        grouped.set(t.beleg_id, list)
      }

      const loserIds: string[] = []
      for (const txs of grouped.values()) {
        if (txs.length <= 1) continue
        const sorted = [...txs].sort((a, b) => (b.match_score ?? 0) - (a.match_score ?? 0))
        for (const loser of sorted.slice(1)) {
          loserIds.push(loser.id)
          matched = Math.max(0, matched - 1)
          suggested++
        }
      }

      // Single batch update for all losers
      if (loserIds.length > 0) {
        await supabase
          .from('transaktionen')
          .update({ match_status: 'vorgeschlagen' })
          .in('id', loserIds)
      }
    }
  }

  return { matched, suggested, unmatched, kein_beleg: keinBelegCount, total: transaktionen.length }
}
