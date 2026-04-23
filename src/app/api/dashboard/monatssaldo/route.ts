import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'

export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_monatssaldo', {
    p_mandant_id: ctx.mandantId,
  })

  if (error) {
    // Fallback: raw query via from()
    const { data: raw, error: rawErr } = await supabase
      .from('belege')
      .select('rechnungstyp, bruttobetrag, rechnungsdatum')
      .eq('mandant_id', ctx.mandantId)
      .is('geloescht_am', null)
      .not('rechnungsdatum', 'is', null)
      .not('bruttobetrag', 'is', null)
      .gte('rechnungsdatum', getStartDate())

    if (rawErr) return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })

    return NextResponse.json({ monate: aggregateMonthly(raw ?? []) })
  }

  return NextResponse.json({ monate: data })
}

function getStartDate(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 5)
  d.setDate(1)
  return d.toISOString().split('T')[0]
}

type BelegRow = {
  rechnungstyp: string
  bruttobetrag: number
  rechnungsdatum: string
}

type MonatsSaldo = {
  monat: string
  einnahmen: number
  ausgaben: number
  saldo: number
}

function aggregateMonthly(rows: BelegRow[]): MonatsSaldo[] {
  const map = new Map<string, MonatsSaldo>()

  for (const row of rows) {
    const monat = row.rechnungsdatum.slice(0, 7) // "YYYY-MM"
    if (!map.has(monat)) {
      map.set(monat, { monat, einnahmen: 0, ausgaben: 0, saldo: 0 })
    }
    const entry = map.get(monat)!
    const betrag = Number(row.bruttobetrag) || 0

    if (row.rechnungstyp === 'ausgangsrechnung') {
      entry.einnahmen += betrag
      entry.saldo += betrag
    } else if (row.rechnungstyp === 'eingangsrechnung' || row.rechnungstyp === 'eigenbeleg' || row.rechnungstyp === 'eigenverbrauch') {
      entry.ausgaben += betrag
      entry.saldo -= betrag
    }
  }

  return Array.from(map.values()).sort((a, b) => a.monat.localeCompare(b.monat))
}
