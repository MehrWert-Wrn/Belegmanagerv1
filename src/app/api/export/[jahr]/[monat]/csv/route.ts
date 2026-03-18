import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { generateDATEVCSV } from '@/lib/datev'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/export/[jahr]/[monat]/csv – DATEV CSV herunterladen
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
    .select('id, firmenname, uid_nummer, geschaeftsjahr_beginn, beraternummer, mandantennummer')
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
    return NextResponse.json({ error: 'Export nur für abgeschlossene Monate' }, { status: 403 })
  }

  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  // Transaktionen mit Beleg-Daten laden
  const { data: transaktionen, error } = await supabase
    .from('transaktionen')
    .select(`
      betrag, datum, beschreibung, buchungsreferenz,
      match_status, workflow_status,
      belege ( rechnungsnummer, lieferant, rechnungsdatum )
    `)
    .eq('mandant_id', mandant.id)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .order('datum', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const exportDaten = (transaktionen ?? []).map(t => ({
    betrag: t.betrag,
    datum: t.datum,
    beschreibung: t.beschreibung,
    buchungsreferenz: t.buchungsreferenz,
    match_status: t.match_status,
    workflow_status: t.workflow_status,
    beleg: Array.isArray(t.belege) ? t.belege[0] ?? null : t.belege,
  }))

  const csv = generateDATEVCSV(exportDaten, mandant, jahr, monat)

  // Export protokollieren
  const anzahl_ohne_beleg = exportDaten.filter(t => !t.beleg).length
  await supabase.from('export_protokolle').insert({
    mandant_id: mandant.id,
    jahr,
    monat,
    exportiert_von: user.id,
    export_typ: 'csv',
    anzahl_transaktionen: exportDaten.length,
    anzahl_ohne_beleg,
  })

  // datev_export_vorhanden auf monatsabschluesse setzen
  await supabase
    .from('monatsabschluesse')
    .update({ datev_export_vorhanden: true })
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)

  const firmaSlug = mandant.firmenname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
  const filename = `DATEV_Export_${jahr}_${String(monat).padStart(2, '0')}_${firmaSlug}.csv`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
