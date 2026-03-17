/**
 * Matching-Engine – PROJ-5
 * Pure TypeScript, deterministisch, source-agnostisch.
 * Keine externen API-Calls, keine Supabase-Abhängigkeiten.
 */

export type MatchInput = {
  transaktion: {
    id: string
    datum: string           // ISO date string
    betrag: number          // negativ = Ausgabe
    beschreibung: string | null
    iban_gegenseite: string | null
    buchungsreferenz: string | null
    match_abgelehnte_beleg_ids: string[]
  }
  beleg: {
    id: string
    lieferant: string | null
    rechnungsnummer: string | null
    bruttobetrag: number | null
    rechnungsdatum: string | null // ISO date string
    // Zukünftig: lieferant_iban für IBAN_GUARDED
  }
}

export type MatchResult = {
  transaktion_id: string
  beleg_id: string | null
  match_status: 'bestaetigt' | 'vorgeschlagen' | 'offen'
  match_score: number
  match_type: 'RN_MATCH' | 'SEPA_MATCH' | 'IBAN_GUARDED' | 'PAYPAL_ID_MATCH' | 'SCORE' | null
}

// --- Hilfsfunktionen ---

function normalize(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().trim()
}

function daysDiff(a: string, b: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay
}

function amountMatches(transaktionBetrag: number, belegBetrag: number | null): number {
  if (belegBetrag === null) return 0
  const abs = Math.abs(transaktionBetrag)
  const diff = Math.abs(abs - belegBetrag)
  if (diff === 0) return 40
  if (diff / belegBetrag <= 0.01) return 20 // ±1%
  return 0
}

function dateScore(transaktionDatum: string, belegDatum: string | null): number {
  if (!belegDatum) return 0
  const days = daysDiff(transaktionDatum, belegDatum)
  if (days <= 3) return 15
  if (days <= 7) return 10
  if (days <= 30) return 5
  return 0
}

function lieferantScore(beschreibung: string | null, lieferant: string | null): number {
  if (!beschreibung || !lieferant) return 0
  const desc = normalize(beschreibung)
  // Lieferant-Name in Wörter aufteilen für bessere Trefferquote
  const words = normalize(lieferant).split(/\s+/).filter(w => w.length > 3)
  if (words.length === 0) return 0
  const matchedWords = words.filter(w => desc.includes(w))
  return matchedWords.length / words.length >= 0.5 ? 25 : 0
}

function beschreibungScore(beschreibung: string | null, rechnungsnummer: string | null): number {
  if (!beschreibung || !rechnungsnummer) return 0
  return normalize(beschreibung).includes(normalize(rechnungsnummer)) ? 10 : 0
}

// --- Stage 1: Hard Match ---

function tryHardMatch(input: MatchInput): string | null {
  const { transaktion, beleg } = input
  const desc = normalize(transaktion.beschreibung)
  const ref = normalize(transaktion.buchungsreferenz)

  // RN_MATCH: Rechnungsnummer in Verwendungszweck
  if (beleg.rechnungsnummer && normalize(beleg.rechnungsnummer).length > 3) {
    if (desc.includes(normalize(beleg.rechnungsnummer)) ||
        ref.includes(normalize(beleg.rechnungsnummer))) {
      return 'RN_MATCH'
    }
  }

  // SEPA_MATCH: SEPA-Referenz stimmt mit buchungsreferenz überein
  if (beleg.rechnungsnummer && transaktion.buchungsreferenz) {
    if (normalize(transaktion.buchungsreferenz) === normalize(beleg.rechnungsnummer)) {
      return 'SEPA_MATCH'
    }
  }

  // PAYPAL_ID_MATCH: PayPal-ID im Verwendungszweck
  if (transaktion.beschreibung?.toLowerCase().includes('paypal') && beleg.rechnungsnummer) {
    if (desc.includes(normalize(beleg.rechnungsnummer))) {
      return 'PAYPAL_ID_MATCH'
    }
  }

  return null
}

// --- Stage 2: Score Matching ---

function calcScore(input: MatchInput): number {
  const { transaktion, beleg } = input
  return (
    amountMatches(transaktion.betrag, beleg.bruttobetrag) +
    dateScore(transaktion.datum, beleg.rechnungsdatum) +
    lieferantScore(transaktion.beschreibung, beleg.lieferant) +
    beschreibungScore(transaktion.beschreibung, beleg.rechnungsnummer)
  )
}

// --- Haupt-Matching-Funktion (1 Transaktion gegen N Belege) ---

export function matchTransaktion(
  transaktion: MatchInput['transaktion'],
  belege: MatchInput['beleg'][]
): MatchResult {
  let bestBeleg: MatchInput['beleg'] | null = null
  let bestScore = 0
  let bestMatchType: MatchResult['match_type'] = null
  let tieScore = false

  for (const beleg of belege) {
    // Abgelehnte Belege überspringen
    if (transaktion.match_abgelehnte_beleg_ids.includes(beleg.id)) continue

    const input: MatchInput = { transaktion, beleg }

    // Stage 1: Hard Match
    const hardMatch = tryHardMatch(input)
    if (hardMatch) {
      if (bestScore === 100) {
        tieScore = true // Zwei Hard Matches → Gelb
      } else {
        bestBeleg = beleg
        bestScore = 100
        bestMatchType = hardMatch as MatchResult['match_type']
        tieScore = false
      }
      continue
    }

    // Stage 2: Score
    const score = calcScore(input)
    if (score > bestScore) {
      bestBeleg = beleg
      bestScore = score
      bestMatchType = 'SCORE'
      tieScore = false
    } else if (score === bestScore && score > 0) {
      tieScore = true
    }
  }

  // Kein Kandidat
  if (!bestBeleg || bestScore === 0) {
    return { transaktion_id: transaktion.id, beleg_id: null, match_status: 'offen', match_score: 0, match_type: null }
  }

  // Tie bei Hard Match → Gelb für manuelle Auflösung
  const effectiveScore = tieScore && bestScore === 100 ? 79 : bestScore

  let match_status: MatchResult['match_status']
  if (effectiveScore >= 80) match_status = 'bestaetigt'
  else if (effectiveScore >= 50) match_status = 'vorgeschlagen'
  else match_status = 'offen'

  return {
    transaktion_id: transaktion.id,
    beleg_id: bestBeleg.id,
    match_status,
    match_score: bestScore,
    match_type: bestMatchType,
  }
}

// --- Batch-Matching (alle Transaktionen eines Mandanten) ---

export function runMatchingBatch(
  transaktionen: MatchInput['transaktion'][],
  belege: MatchInput['beleg'][]
): MatchResult[] {
  return transaktionen.map(t => matchTransaktion(t, belege))
}
