/**
 * Kassabuch-Export-Helpers:
 * Laden von Monats-/Jahres-Daten + Saldo-Berechnung für PDF/CSV-Generierung.
 * Verwendet vom /api/kassabuch/export + /api/kassabuch/archiv/generieren.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import type { KassaBuchungPdfRow } from '@/lib/kassabuch-pdf'
import type { KassaBuchungRow } from '@/lib/kassabuch-csv'

interface TransaktionRaw {
  id: string
  datum: string
  betrag: number
  beschreibung: string | null
  lfd_nr_kassa: number | null
  kassa_buchungstyp: string | null
  storno_zu_id: string | null
  kategorie_id: string | null
}

interface KategorieMap {
  [id: string]: string
}

export interface LoadKassabuchDataResult {
  mandantName: string
  anfangssaldoMonat: number        // Saldo zu Beginn des gewählten Zeitraums
  endsaldoMonat: number            // Saldo am Ende des gewählten Zeitraums
  summeEinnahmen: number
  summeAusgaben: number
  buchungenPdf: KassaBuchungPdfRow[]
  buchungenCsv: KassaBuchungRow[]
  hinweisOffeneMonate: string[]    // nur Jahresbericht
  quartalsZwischensummen?: Array<{
    quartal: 1 | 2 | 3 | 4
    summeEinnahmen: number
    summeAusgaben: number
    endsaldo: number
    nachIndex: number
  }>
}

function dayRange(monatKey: string): { von: string; bis: string } {
  const [y, m] = monatKey.split('-').map(Number)
  const von = `${y}-${String(m).padStart(2, '0')}-01`
  const bis = new Date(y, m, 0).toISOString().split('T')[0]
  return { von, bis }
}

function jahrRange(jahr: number): { von: string; bis: string } {
  return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` }
}

async function loadMandantName(
  supabase: SupabaseClient,
  mandantId: string
): Promise<string> {
  const { data } = await supabase
    .from('mandanten')
    .select('firmenname')
    .eq('id', mandantId)
    .single()
  return data?.firmenname ?? 'Unbekannt'
}

async function loadKategorienMap(
  supabase: SupabaseClient,
  mandantId: string
): Promise<KategorieMap> {
  const { data } = await supabase
    .from('kassa_kategorien')
    .select('id, name')
    .eq('mandant_id', mandantId)
    .limit(200)

  const map: KategorieMap = {}
  for (const k of data ?? []) map[k.id] = k.name
  return map
}

/**
 * Lädt alle Kassabuch-Daten für einen Monat (YYYY-MM).
 */
export async function loadKassabuchMonatData(
  supabase: SupabaseClient,
  mandantId: string,
  monatKey: string
): Promise<LoadKassabuchDataResult> {
  const { von, bis } = dayRange(monatKey)

  const kasse = await getOrCreateKasseQuelle(supabase, mandantId)
  if (!kasse) throw new Error('Kassaquelle nicht gefunden')

  const [mandantName, kategorien] = await Promise.all([
    loadMandantName(supabase, mandantId),
    loadKategorienMap(supabase, mandantId),
  ])

  // Alle Buchungen VOR Zeitraum-Beginn für Anfangssaldo
  const { data: vorher } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)
    .lt('datum', von)
    .limit(100000)

  const summeVorher = (vorher ?? []).reduce((acc, t) => acc + Number(t.betrag), 0)
  const anfangssaldoMonat = Number(kasse.anfangssaldo ?? 0) + summeVorher

  // Buchungen des Monats
  const { data: monatsTx } = await supabase
    .from('transaktionen')
    .select(`
      id, datum, betrag, beschreibung, lfd_nr_kassa, kassa_buchungstyp,
      storno_zu_id, kategorie_id
    `)
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)
    .gte('datum', von)
    .lte('datum', bis)
    .order('datum', { ascending: true })
    .order('lfd_nr_kassa', { ascending: true })
    .limit(10000)

  const rows = (monatsTx ?? []) as TransaktionRaw[]

  return buildResult({
    rows,
    mandantName,
    kategorien,
    anfangssaldo: anfangssaldoMonat,
    zeitraumVon: von,
    zeitraumBis: bis,
  })
}

/**
 * Lädt alle Kassabuch-Daten für ein Jahr (YYYY).
 */
export async function loadKassabuchJahrData(
  supabase: SupabaseClient,
  mandantId: string,
  jahr: number
): Promise<LoadKassabuchDataResult> {
  const { von, bis } = jahrRange(jahr)

  const kasse = await getOrCreateKasseQuelle(supabase, mandantId)
  if (!kasse) throw new Error('Kassaquelle nicht gefunden')

  const [mandantName, kategorien] = await Promise.all([
    loadMandantName(supabase, mandantId),
    loadKategorienMap(supabase, mandantId),
  ])

  // Anfangssaldo = alles VOR dem Jahr
  const { data: vorher } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)
    .lt('datum', von)
    .limit(100000)

  const summeVorher = (vorher ?? []).reduce((acc, t) => acc + Number(t.betrag), 0)
  const anfangssaldoJahr = Number(kasse.anfangssaldo ?? 0) + summeVorher

  // Buchungen des Jahres
  const { data: jahrTx } = await supabase
    .from('transaktionen')
    .select(`
      id, datum, betrag, beschreibung, lfd_nr_kassa, kassa_buchungstyp,
      storno_zu_id, kategorie_id
    `)
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)
    .gte('datum', von)
    .lte('datum', bis)
    .order('datum', { ascending: true })
    .order('lfd_nr_kassa', { ascending: true })
    .limit(50000)

  const rows = (jahrTx ?? []) as TransaktionRaw[]

  // Monatsabschlüsse laden für Hinweis auf offene Monate
  const { data: abschluesse } = await supabase
    .from('monatsabschluesse')
    .select('jahr, monat, status')
    .eq('mandant_id', mandantId)
    .eq('jahr', jahr)
    .limit(24)

  const abgeschlosseneMonate = new Set(
    (abschluesse ?? [])
      .filter(a => a.status === 'abgeschlossen')
      .map(a => a.monat)
  )

  const offeneMonate: string[] = []
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  // Betrachte alle Monate die bereits begonnen haben
  const maxMonat = jahr < currentYear ? 12 : currentMonth
  for (let m = 1; m <= maxMonat; m++) {
    if (!abgeschlosseneMonate.has(m)) {
      offeneMonate.push(`${String(m).padStart(2, '0')}/${jahr}`)
    }
  }

  // Quartals-Zwischensummen: am Ende jedes Quartals eine Summary-Zeile
  const quartalsData: Array<{
    quartal: 1 | 2 | 3 | 4
    summeEinnahmen: number
    summeAusgaben: number
    endsaldo: number
    nachIndex: number
  }> = []

  const result = buildResult({
    rows,
    mandantName,
    kategorien,
    anfangssaldo: anfangssaldoJahr,
    zeitraumVon: von,
    zeitraumBis: bis,
    hinweisOffeneMonate: offeneMonate,
  })

  // Quartalssummen berechnen (auf Basis der bereits laufenden Salden in result.buchungenPdf)
  for (let q = 1; q <= 4; q++) {
    const qEndeMonat = q * 3
    const qEndeDatum = new Date(jahr, qEndeMonat, 0).toISOString().split('T')[0]
    const qStartDatum = `${jahr}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`

    let summeEinnahmenQ = 0
    let summeAusgabenQ = 0
    let lastIdxInQ = -1

    result.buchungenPdf.forEach((b, idx) => {
      if (b.datum >= qStartDatum && b.datum <= qEndeDatum) {
        if (b.einnahme) summeEinnahmenQ += b.einnahme
        if (b.ausgabe)  summeAusgabenQ += b.ausgabe
        lastIdxInQ = idx
      }
    })

    if (lastIdxInQ >= 0) {
      quartalsData.push({
        quartal: q as 1 | 2 | 3 | 4,
        summeEinnahmen: summeEinnahmenQ,
        summeAusgaben: summeAusgabenQ,
        endsaldo: result.buchungenPdf[lastIdxInQ].laufender_saldo,
        nachIndex: lastIdxInQ,
      })
    }
  }

  result.quartalsZwischensummen = quartalsData

  return result
}

interface BuildArgs {
  rows: TransaktionRaw[]
  mandantName: string
  kategorien: KategorieMap
  anfangssaldo: number
  zeitraumVon: string
  zeitraumBis: string
  hinweisOffeneMonate?: string[]
}

function buildResult(args: BuildArgs): LoadKassabuchDataResult {
  const { rows, mandantName, kategorien, anfangssaldo, zeitraumBis, hinweisOffeneMonate } = args

  let laufenderSaldo = anfangssaldo
  let summeEinnahmen = 0
  let summeAusgaben = 0

  const buchungenPdf: KassaBuchungPdfRow[] = []
  const buchungenCsv: KassaBuchungRow[] = []

  // storno_zu_id Set → markiere Original als storniert (is_storno nur für Storno-Zeile selbst)
  for (const b of rows) {
    const betrag = Number(b.betrag)
    laufenderSaldo += betrag

    const isEinnahme = betrag > 0
    const einnahme = isEinnahme ? betrag : null
    const ausgabe  = !isEinnahme ? Math.abs(betrag) : null

    if (einnahme) summeEinnahmen += einnahme
    if (ausgabe)  summeAusgaben  += ausgabe

    const kategorieName = b.kategorie_id ? kategorien[b.kategorie_id] ?? null : null
    const isStorno = b.kassa_buchungstyp === 'STORNO'

    buchungenPdf.push({
      lfd_nr_kassa: b.lfd_nr_kassa,
      datum: b.datum,
      kassa_buchungstyp: b.kassa_buchungstyp,
      beschreibung: b.beschreibung,
      einnahme,
      ausgabe,
      laufender_saldo: laufenderSaldo,
      kategorie: kategorieName,
      is_storno: isStorno,
    })

    buchungenCsv.push({
      lfd_nr_kassa: b.lfd_nr_kassa,
      datum: b.datum,
      kassa_buchungstyp: b.kassa_buchungstyp,
      beschreibung: b.beschreibung,
      betrag,
      laufender_saldo: laufenderSaldo,
      kategorie: kategorieName,
    })
  }

  return {
    mandantName,
    anfangssaldoMonat: anfangssaldo,
    endsaldoMonat: laufenderSaldo,
    summeEinnahmen,
    summeAusgaben,
    buchungenPdf,
    buchungenCsv,
    hinweisOffeneMonate: hinweisOffeneMonate ?? [],
  }
  // zeitraumBis not used separately here but will be used as endsaldoDatum by caller
  void zeitraumBis
}
