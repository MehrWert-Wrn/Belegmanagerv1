import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'

export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('belege')
    .select('rechnungsdatum, bruttobetrag, zuordnungsstatus, rechnungstyp, erstellt_am')
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .gte('erstellt_am', getStartDate())
    .order('erstellt_am', { ascending: false })

  if (error) return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })

  return NextResponse.json({ monate: aggregateByMonth(data ?? []) })
}

function getStartDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 11)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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

  // Sort types within each month by count desc
  for (const entry of map.values()) {
    entry.typen.sort((a, b) => b.anzahl - a.anzahl)
  }

  return Array.from(map.values()).sort((a, b) => b.monat.localeCompare(a.monat))
}
