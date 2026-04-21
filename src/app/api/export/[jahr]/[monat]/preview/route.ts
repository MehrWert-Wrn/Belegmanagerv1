import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { countCsvZeilen, type BuchungsexportTransaktion } from '@/lib/buchungsexport'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// GET /api/export/[jahr]/[monat]/preview – Vorschau vor Download
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const parsed = paramsSchema.safeParse({ jahr: jahrStr, monat: monatStr })
  if (!parsed.success) return NextResponse.json({ error: 'Ungueltige Parameter' }, { status: 400 })
  const { jahr, monat } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Monat muss abgeschlossen sein
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandantId)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (abschluss?.status !== 'abgeschlossen') {
    return NextResponse.json({ error: 'Monat ist nicht abgeschlossen' }, { status: 403 })
  }

  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  // Transaktionen + Belege (steuerzeilen) laden, um die tatsaechliche CSV-Zeilenzahl
  // zu ermitteln (Multi-MwSt erzeugt mehr Zeilen als Transaktionen).
  const { data: transaktionen, error } = await supabase
    .from('transaktionen')
    .select(`
      id,
      betrag,
      datum,
      match_status,
      workflow_status,
      beleg_id,
      belege ( id, steuerzeilen )
    `)
    .eq('mandant_id', mandantId)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list: BuchungsexportTransaktion[] = (transaktionen ?? []).map(t => ({
    buchungsnummer: null,
    betrag: Number(t.betrag),
    datum: t.datum,
    beschreibung: null,
    match_status: t.match_status,
    workflow_status: t.workflow_status,
    zahlungsquelle_typ: null,
    beleg: Array.isArray(t.belege)
      ? (t.belege[0] ?? null)
      : (t.belege ?? null),
  }))

  const anzahl_transaktionen = list.length
  const anzahl_ohne_beleg = list.filter(t => !t.beleg).length
  const anzahl_mit_beleg = anzahl_transaktionen - anzahl_ohne_beleg
  const anzahl_csv_zeilen = countCsvZeilen(list)

  // Letzte Exporte
  const { data: letzteExporte } = await supabase
    .from('export_protokolle')
    .select('exportiert_am, export_typ')
    .eq('mandant_id', mandantId)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .order('exportiert_am', { ascending: false })
    .limit(3)

  return NextResponse.json({
    anzahl_transaktionen,
    anzahl_mit_beleg,
    anzahl_ohne_beleg,
    anzahl_csv_zeilen,
    letzte_exporte: letzteExporte ?? [],
  })
}
