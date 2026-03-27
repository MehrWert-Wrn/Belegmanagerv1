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
    lieferant_iban: string | null
    rechnungsnummer: string | null
    bruttobetrag: number | null
    rechnungsdatum: string | null   // ISO date string
    mandatsreferenz: string | null
    zahlungsreferenz: string | null
    bestellnummer: string | null
  }
}

export type MatchResult = {
  transaktion_id: string
  beleg_id: string | null
  match_status: 'bestaetigt' | 'vorgeschlagen' | 'offen'
  match_score: number
  match_type: 'RN_MATCH' | 'SEPA_MATCH' | 'IBAN_GUARDED' | 'PAYPAL_ID_MATCH' | 'SCORE' | null
  betrag_warnung?: string | null  // gesetzt wenn Hard Match aber Betrag weicht ab
}

// --- Token-Extraktion ---

type ExtractedTokens = {
  mandate: string | null
  zahlungsreferenz: string | null
  rechnungsnummern: string[]
  ibans: string[]
  amazon: string | null
  kartenreferenz: string | null
  auftraggeberreferenz: string | null
}

function extractTokens(text: string | null): ExtractedTokens {
  if (!text) {
    return { mandate: null, zahlungsreferenz: null, rechnungsnummern: [], ibans: [], amazon: null, kartenreferenz: null, auftraggeberreferenz: null }
  }

  const mandate = text.match(/Mandat:\s*([^\s,;]+)/i)?.[1] ?? null

  const zahlungsreferenz = text.match(/(?:Zahlungsreferenz|Ref|Reference)[:\s]+([A-Z0-9\-\/]+)/i)?.[1] ?? null

  const rechnungsnummern = [...text.matchAll(/(?:RN|Rechnungsnr|Rechnungsnummer|Invoice)[:\s#]+([A-Z0-9\-]+)/gi)]
    .map(m => m[1])
    .filter(Boolean)

  const ibans = text.match(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g) ?? []

  const amazon = text.match(/\d{3}-\d{7,10}-\d{7}/)?.[0] ?? null

  const kartenreferenz = text.match(/\*([A-Z0-9]{6,12})\s/)?.[1] ?? null

  const auftraggeberreferenz = text.match(/Auftraggeberreferenz:\s*([^\s]+)/i)?.[1] ?? null

  return { mandate, zahlungsreferenz, rechnungsnummern, ibans, amazon, kartenreferenz, auftraggeberreferenz }
}

// --- Hilfsfunktionen ---

function normalize(text: string | null | undefined): string {
  return (text ?? '').toLowerCase().trim()
}

/** Betrag-Differenz in Prozent (abs). Gibt null zurück wenn kein belegBetrag vorhanden. */
function betragsAbweichung(transaktionBetrag: number, belegBetrag: number | null): number | null {
  if (belegBetrag === null || belegBetrag === 0) return null
  return Math.abs(Math.abs(transaktionBetrag) - belegBetrag) / belegBetrag
}

function amountScore(transaktionBetrag: number, belegBetrag: number | null): number {
  const abw = betragsAbweichung(transaktionBetrag, belegBetrag)
  if (abw === null) return 0
  if (abw === 0) return 40
  if (abw <= 0.01) return 20  // ±1%
  return 0
}

/**
 * Directional date scoring für SEPA-Buchungen:
 * Buchungsdatum liegt typischerweise 1–5 Werktage NACH dem Rechnungsdatum.
 * Buchungsdatum VOR Rechnungsdatum → 0 Punkte (kein Vorwärts-Match).
 */
function dateScore(transaktionDatum: string, belegDatum: string | null): number {
  if (!belegDatum) return 0
  const tDate = new Date(transaktionDatum).getTime()
  const bDate = new Date(belegDatum).getTime()
  const msPerDay = 1000 * 60 * 60 * 24
  const daysDiff = (tDate - bDate) / msPerDay  // positiv = Buchung nach Rechnung

  if (daysDiff < 0) return 0           // Buchung VOR Rechnungsdatum → kein Score
  if (daysDiff <= 3) return 15
  if (daysDiff <= 7) return 10
  if (daysDiff <= 14) return 5
  return 0
}

/**
 * Token-basiertes Lieferanten-Matching.
 * Jeden Token ≥ 4 Zeichen aus dem Lieferantennamen im Buchungstext suchen.
 * ≥ 1 Treffer = 20 Punkte.
 */
function lieferantScore(beschreibung: string | null, lieferant: string | null): number {
  if (!beschreibung || !lieferant) return 0
  const desc = normalize(beschreibung)
  const tokens = normalize(lieferant).split(/\s+/).filter(w => w.length >= 4)
  if (tokens.length === 0) return 0
  const hit = tokens.some(w => desc.includes(w))
  return hit ? 20 : 0
}

function beschreibungScore(beschreibung: string | null, rechnungsnummer: string | null): number {
  if (!beschreibung || !rechnungsnummer || rechnungsnummer.length < 4) return 0
  return normalize(beschreibung).includes(normalize(rechnungsnummer)) ? 10 : 0
}

// --- Stage 1: Hard Match ---

type HardMatchResult = {
  type: MatchResult['match_type']
  betragsWarnung: string | null
} | null

function tryHardMatch(input: MatchInput): HardMatchResult {
  const { transaktion, beleg } = input
  const desc = transaktion.beschreibung ?? ''
  const descNorm = normalize(desc)
  const ref = normalize(transaktion.buchungsreferenz)

  const tokens = extractTokens(desc)

  // Debug-Logging: was wurde extrahiert?
  console.log(`[Matching] TX ${transaktion.id} → Beleg ${beleg.id}`)
  console.log(`  Beschreibung: "${desc.slice(0, 120)}"`)
  console.log(`  Extrahierte Tokens:`, JSON.stringify(tokens))
  console.log(`  Beleg-Referenzfelder:`, {
    rechnungsnummer: beleg.rechnungsnummer,
    mandatsreferenz: beleg.mandatsreferenz,
    zahlungsreferenz: beleg.zahlungsreferenz,
    bestellnummer: beleg.bestellnummer,
    lieferant_iban: beleg.lieferant_iban,
  })

  const isPayPal = descNorm.includes('paypal')

  // Betrag-Warnung vorbereiten (für Hard Matches mit Betragsabweichung)
  function makeBetragsWarnung(): string | null {
    const abw = betragsAbweichung(transaktion.betrag, beleg.bruttobetrag)
    if (abw === null || abw < 0.001) return null
    return `Betrag weicht ab: Beleg €${beleg.bruttobetrag?.toFixed(2)} / Buchung €${Math.abs(transaktion.betrag).toFixed(2)} – bitte prüfen`
  }

  // PAYPAL_ID_MATCH
  if (isPayPal && beleg.rechnungsnummer && normalize(beleg.rechnungsnummer).length > 3) {
    if (descNorm.includes(normalize(beleg.rechnungsnummer))) {
      console.log(`  → PAYPAL_ID_MATCH`)
      return { type: 'PAYPAL_ID_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // SEPA_MATCH via extrahiertes Mandat
  if (tokens.mandate && beleg.mandatsreferenz) {
    if (normalize(tokens.mandate) === normalize(beleg.mandatsreferenz)) {
      console.log(`  → SEPA_MATCH (Mandat: ${tokens.mandate})`)
      return { type: 'SEPA_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // SEPA_MATCH via extrahierte Zahlungsreferenz gegen rechnungsnummer oder zahlungsreferenz
  if (tokens.zahlungsreferenz) {
    const zRef = normalize(tokens.zahlungsreferenz)
    if (
      (beleg.rechnungsnummer && zRef === normalize(beleg.rechnungsnummer)) ||
      (beleg.zahlungsreferenz && zRef === normalize(beleg.zahlungsreferenz))
    ) {
      console.log(`  → SEPA_MATCH (Zahlungsreferenz: ${tokens.zahlungsreferenz})`)
      return { type: 'SEPA_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // SEPA_MATCH via buchungsreferenz direkt
  if (transaktion.buchungsreferenz && beleg.rechnungsnummer) {
    if (ref === normalize(beleg.rechnungsnummer)) {
      console.log(`  → SEPA_MATCH (buchungsreferenz == rechnungsnummer)`)
      return { type: 'SEPA_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }
  if (transaktion.buchungsreferenz && beleg.zahlungsreferenz) {
    if (ref === normalize(beleg.zahlungsreferenz)) {
      console.log(`  → SEPA_MATCH (buchungsreferenz == zahlungsreferenz)`)
      return { type: 'SEPA_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // RN_MATCH: Rechnungsnummer im Buchungstext oder buchungsreferenz (nicht PayPal)
  if (!isPayPal && beleg.rechnungsnummer && normalize(beleg.rechnungsnummer).length > 3) {
    const rnNorm = normalize(beleg.rechnungsnummer)
    if (descNorm.includes(rnNorm) || ref.includes(rnNorm)) {
      console.log(`  → RN_MATCH (rechnungsnummer in Beschreibung)`)
      return { type: 'RN_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // RN_MATCH via extrahierte Rechnungsnummern aus Buchungstext
  if (tokens.rechnungsnummern.length > 0) {
    for (const rnToken of tokens.rechnungsnummern) {
      const rnNorm = normalize(rnToken)
      if (
        (beleg.rechnungsnummer && rnNorm === normalize(beleg.rechnungsnummer)) ||
        (beleg.zahlungsreferenz && rnNorm === normalize(beleg.zahlungsreferenz))
      ) {
        console.log(`  → RN_MATCH (extrahierte RN: ${rnToken})`)
        return { type: 'RN_MATCH', betragsWarnung: makeBetragsWarnung() }
      }
    }
  }

  // SEPA_MATCH via Auftraggeberreferenz
  if (tokens.auftraggeberreferenz) {
    const agRef = normalize(tokens.auftraggeberreferenz)
    if (
      (beleg.rechnungsnummer && agRef === normalize(beleg.rechnungsnummer)) ||
      (beleg.mandatsreferenz && agRef === normalize(beleg.mandatsreferenz)) ||
      (beleg.zahlungsreferenz && agRef === normalize(beleg.zahlungsreferenz))
    ) {
      console.log(`  → SEPA_MATCH (Auftraggeberreferenz: ${tokens.auftraggeberreferenz})`)
      return { type: 'SEPA_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // RN_MATCH via Amazon Bestellnummer
  if (tokens.amazon && beleg.bestellnummer) {
    if (normalize(tokens.amazon) === normalize(beleg.bestellnummer)) {
      console.log(`  → RN_MATCH (Amazon Bestellnummer: ${tokens.amazon})`)
      return { type: 'RN_MATCH', betragsWarnung: makeBetragsWarnung() }
    }
  }

  // IBAN_GUARDED: IBAN der Transaktion (direkt oder extrahiert) + Betrag ≤ 2% Abweichung
  const ibanKandidaten = [transaktion.iban_gegenseite, ...tokens.ibans].filter(Boolean) as string[]
  if (beleg.lieferant_iban && ibanKandidaten.length > 0) {
    const belegIban = normalize(beleg.lieferant_iban)
    const ibanHit = ibanKandidaten.some(i => normalize(i) === belegIban)
    if (ibanHit) {
      const abw = betragsAbweichung(transaktion.betrag, beleg.bruttobetrag)
      if (abw !== null && abw <= 0.02) {
        console.log(`  → IBAN_GUARDED`)
        return { type: 'IBAN_GUARDED', betragsWarnung: abw > 0.001 ? makeBetragsWarnung() : null }
      }
    }
  }

  console.log(`  → Kein Hard Match`)
  return null
}

// --- Stage 2: Score Matching ---

function calcScore(input: MatchInput): number {
  const { transaktion, beleg } = input
  const score =
    amountScore(transaktion.betrag, beleg.bruttobetrag) +
    dateScore(transaktion.datum, beleg.rechnungsdatum) +
    lieferantScore(transaktion.beschreibung, beleg.lieferant) +
    beschreibungScore(transaktion.beschreibung, beleg.rechnungsnummer)

  console.log(`  [Score] TX ${transaktion.id} / Beleg ${beleg.id}: ${score} Punkte`)
  return score
}

// --- Haupt-Matching-Funktion (1 Transaktion gegen N Belege) ---

export function matchTransaktion(
  transaktion: MatchInput['transaktion'],
  belege: MatchInput['beleg'][]
): MatchResult {
  let bestBeleg: MatchInput['beleg'] | null = null
  let bestScore = 0
  let bestMatchType: MatchResult['match_type'] = null
  let bestBetragsWarnung: string | null = null
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
        bestMatchType = hardMatch.type
        bestBetragsWarnung = hardMatch.betragsWarnung
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
      bestBetragsWarnung = null
      tieScore = false
    } else if (score === bestScore && score > 0) {
      tieScore = true
    }
  }

  // Kein Kandidat
  if (!bestBeleg || bestScore === 0) {
    return { transaktion_id: transaktion.id, beleg_id: null, match_status: 'offen', match_score: 0, match_type: null }
  }

  // Tie → Gelb für manuelle Auflösung (gilt für Hard Match und Score-Ties bei >= 80)
  const effectiveScore = tieScore && bestScore >= 80 ? 79 : bestScore

  let match_status: MatchResult['match_status']
  if (effectiveScore >= 80) match_status = 'bestaetigt'
  else if (effectiveScore >= 30) match_status = 'vorgeschlagen'
  else match_status = 'offen'

  return {
    transaktion_id: transaktion.id,
    beleg_id: bestBeleg.id,
    match_status,
    match_score: bestScore,
    match_type: bestMatchType,
    betrag_warnung: bestBetragsWarnung,
  }
}

// --- Batch-Matching (alle Transaktionen eines Mandanten) ---

export function runMatchingBatch(
  transaktionen: MatchInput['transaktion'][],
  belege: MatchInput['beleg'][]
): MatchResult[] {
  return transaktionen.map(t => matchTransaktion(t, belege))
}
