import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'

export async function GET(request: Request) {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Ungültiges Jahr' }, { status: 400 })
  }

  const supabase = await createClient()

  const vonDatum = `${year}-01-01`
  const bisDatum = `${year}-12-31`

  // Query 1: belege mit rechnungsdatum im Jahr
  let q1 = supabase
    .from('belege')
    .select('rechnungsdatum, bruttobetrag, zuordnungsstatus, rechnungstyp, erstellt_am')
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .not('rechnungsdatum', 'is', null)
    .gte('rechnungsdatum', vonDatum)
    .lte('rechnungsdatum', bisDatum)

  // Query 2: belege ohne rechnungsdatum, erstellt im Jahr (Fallback)
  let q2 = supabase
    .from('belege')
    .select('rechnungsdatum, bruttobetrag, zuordnungsstatus, rechnungstyp, erstellt_am')
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .is('rechnungsdatum', null)
    .gte('erstellt_am', `${vonDatum}T00:00:00`)
    .lte('erstellt_am', `${bisDatum}T23:59:59`)

  // Query 3: alle Belege-Daten für verfügbare Jahre (nur Datumsspalten, leichtgewichtig)
  const q3 = supabase
    .from('belege')
    .select('rechnungsdatum, erstellt_am')
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)

  const [r1, r2, r3] = await Promise.all([q1, q2, q3])

  if (r1.error || r2.error || r3.error) {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }

  const rows = [...(r1.data ?? []), ...(r2.data ?? [])]
  const monate = aggregateByMonth(rows)
  const availableYears = extractYears(r3.data ?? [])

  return NextResponse.json({ monate, availableYears, year })
}

type BelegRow = {
  rechnungsdatum: string | null
  bruttobetrag: number | null
  zuordnungsstatus: string
  rechnungstyp: string
  erstellt_am: string
}

export type TypBreakdown = {
  rechnungstyp: string
  anzahl: number
  brutto: number
}

export type MonatsOrdner = {
  monat: string
  anzahl: number
  offene: number
  brutto_ausgaben: number
  brutto_einnahmen: number
  typen: TypBreakdown[]
}

function aggregateByMonth(rows: BelegRow[]): MonatsOrdner[] {
  const map = new Map<string, MonatsOrdner>()

  for (const row of rows) {
    const datumStr = row.rechnungsdatum ?? row.erstellt_am
    const monat = datumStr.slice(0, 7)

    if (!map.has(monat)) {
      map.set(monat, { monat, anzahl: 0, offene: 0, brutto_ausgaben: 0, brutto_einnahmen: 0, typen: [] })
    }

    const entry = map.get(monat)!
    entry.anzahl++

    if (row.zuordnungsstatus !== 'zugeordnet') entry.offene++

    const betrag = Number(row.bruttobetrag) || 0
    if (row.rechnungstyp === 'ausgangsrechnung') {
      entry.brutto_einnahmen += betrag
    } else {
      entry.brutto_ausgaben += betrag
    }

    const typ = entry.typen.find((t) => t.rechnungstyp === row.rechnungstyp)
    if (typ) {
      typ.anzahl++
      typ.brutto += betrag
    } else {
      entry.typen.push({ rechnungstyp: row.rechnungstyp, anzahl: 1, brutto: betrag })
    }
  }

  for (const entry of map.values()) {
    entry.typen.sort((a, b) => b.anzahl - a.anzahl)
  }

  return Array.from(map.values()).sort((a, b) => b.monat.localeCompare(a.monat))
}

function extractYears(rows: { rechnungsdatum: string | null; erstellt_am: string }[]): number[] {
  const years = new Set<number>()
  for (const row of rows) {
    const datumStr = row.rechnungsdatum ?? row.erstellt_am
    const y = parseInt(datumStr.slice(0, 4), 10)
    if (!isNaN(y)) years.add(y)
  }
  return Array.from(years).sort((a, b) => b - a)
}
