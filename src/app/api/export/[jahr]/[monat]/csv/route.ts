import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import {
  generateBuchungsCSV,
  csvDateiname,
  type BuchungsexportTransaktion,
} from '@/lib/buchungsexport'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/export/[jahr]/[monat]/csv – Buchhaltungsübergabe-CSV herunterladen
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const parsed = paramsSchema.safeParse({ jahr: jahrStr, monat: monatStr })
  if (!parsed.success) return NextResponse.json({ error: 'Ungueltige Parameter' }, { status: 400 })
  const { jahr, monat } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data: mandant } = await supabase
    .from('mandanten')
    .select('id, firmenname')
    .eq('id', mandantId)
    .single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Monat muss abgeschlossen sein
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (abschluss?.status !== 'abgeschlossen') {
    return NextResponse.json(
      { error: 'Export nur für abgeschlossene Monate' },
      { status: 403 }
    )
  }

  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  // Transaktionen mit Beleg + Zahlungsquelle laden
  const { data: transaktionen, error } = await supabase
    .from('transaktionen')
    .select(`
      buchungsnummer,
      betrag,
      datum,
      beschreibung,
      match_status,
      workflow_status,
      zahlungsquellen ( typ ),
      belege (
        rechnungstyp,
        rechnungsdatum,
        nettobetrag,
        mwst_satz,
        steuerzeilen,
        rechnungsnummer,
        beschreibung,
        original_filename,
        storage_path
      )
    `)
    .eq('mandant_id', mandant.id)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .order('datum', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exportDaten: BuchungsexportTransaktion[] = (transaktionen ?? []).map(t => ({
    buchungsnummer: t.buchungsnummer,
    betrag: Number(t.betrag),
    datum: t.datum,
    beschreibung: t.beschreibung,
    match_status: t.match_status,
    workflow_status: t.workflow_status,
    zahlungsquelle_typ: Array.isArray(t.zahlungsquellen)
      ? (t.zahlungsquellen[0]?.typ ?? null)
      : ((t.zahlungsquellen as { typ?: string | null } | null)?.typ ?? null),
    beleg: Array.isArray(t.belege) ? (t.belege[0] ?? null) : (t.belege ?? null),
  }))

  const csv = generateBuchungsCSV(exportDaten, jahr, monat)

  // Export protokollieren (beide Updates parallel, Fehler isoliert damit Download nicht blockiert)
  const anzahl_ohne_beleg = exportDaten.filter(t => !t.beleg).length
  await Promise.allSettled([
    supabase.from('export_protokolle').insert({
      mandant_id: mandant.id,
      jahr,
      monat,
      exportiert_von: user.id,
      export_typ: 'csv',
      anzahl_transaktionen: exportDaten.length,
      anzahl_ohne_beleg,
    }),
    supabase
      .from('monatsabschluesse')
      .update({ export_vorhanden: true })
      .eq('mandant_id', mandant.id)
      .eq('jahr', jahr)
      .eq('monat', monat),
  ])

  const filename = csvDateiname(jahr, monat, mandant.firmenname)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
