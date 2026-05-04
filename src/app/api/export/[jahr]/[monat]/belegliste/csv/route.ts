import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import {
  generateBelegslisteCSV,
  belegslisteDateiname,
  type BelegslisteBeleg,
} from '@/lib/buchungsexport'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/export/[jahr]/[monat]/belegliste/csv
// Belegliste-CSV: belegbasiert (eine Zeile pro Beleg im Monat),
// alternative zur transaktionsbasierten Buchhaltungsuebergabe.
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const parsed = paramsSchema.safeParse({ jahr: jahrStr, monat: monatStr })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungueltige Parameter' }, { status: 400 })
  }
  const { jahr, monat } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data: mandant } = await supabase
    .from('mandanten')
    .select('id, firmenname')
    .eq('id', mandantId)
    .single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Monat muss abgeschlossen sein – auch der Belegliste-Export ist Teil des
  // Monatsabschluss-Workflows (analog zur Buchhaltungsuebergabe).
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (abschluss?.status !== 'abgeschlossen') {
    return NextResponse.json(
      { error: 'Export nur fuer abgeschlossene Monate' },
      { status: 403 }
    )
  }

  // Monatsfenster (rechnungsdatum primaer, erstellt_am als Fallback)
  const monatStart = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const monatEnde = new Date(jahr, monat, 0).toISOString().split('T')[0]
  const monatStartTs = `${monatStart}T00:00:00.000Z`
  // erstes Millisekundenintervall des Folgetags als Obergrenze
  const monatEndePlus1 = new Date(Date.UTC(jahr, monat, 1)).toISOString()

  // Belege mit JOIN auf transaktionen->zahlungsquellen, um den Quellen-Namen
  // mitzuliefern. Belege ohne Transaktionsbezug werden trotzdem geladen.
  // Filter:
  //   rechnungsdatum im Monat ODER
  //   (rechnungsdatum IS NULL UND erstellt_am im Monat)
  const { data: belege, error } = await supabase
    .from('belege')
    .select(`
      id,
      rechnungsdatum,
      erstellt_am,
      lieferant,
      rechnungsnummer,
      beschreibung,
      nettobetrag,
      mwst_satz,
      bruttobetrag,
      steuerzeilen,
      rechnungstyp,
      original_filename,
      transaktionen ( zahlungsquellen ( name ) )
    `)
    .eq('mandant_id', mandant.id)
    .or(
      `and(rechnungsdatum.gte.${monatStart},rechnungsdatum.lte.${monatEnde}),and(rechnungsdatum.is.null,erstellt_am.gte.${monatStartTs},erstellt_am.lt.${monatEndePlus1})`
    )
    .order('rechnungsdatum', { ascending: true, nullsFirst: false })
    .limit(5001)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if ((belege?.length ?? 0) > 5000) {
    return NextResponse.json(
      { error: 'Belegliste-Export ist auf 5.000 Belege pro Monat begrenzt. Bitte wende dich an den Support.' },
      { status: 413 }
    )
  }

  // Mapping in das Lib-Eingabeformat. Bei mehreren Transaktionen pro Beleg
  // (theoretisch moeglich) nehmen wir die erste Quelle.
  const list: BelegslisteBeleg[] = (belege ?? []).map(b => {
    const txArr = Array.isArray(b.transaktionen)
      ? b.transaktionen
      : (b.transaktionen ? [b.transaktionen] : [])
    const firstTx = txArr[0] as
      | { zahlungsquellen?: { name?: string | null } | { name?: string | null }[] | null }
      | undefined
    const zq = firstTx?.zahlungsquellen
    const zahlungsquelleName = Array.isArray(zq)
      ? (zq[0]?.name ?? null)
      : (zq?.name ?? null)

    return {
      rechnungsdatum: b.rechnungsdatum,
      erstellt_am: b.erstellt_am,
      lieferant: b.lieferant,
      rechnungsnummer: b.rechnungsnummer,
      beschreibung: b.beschreibung,
      nettobetrag: b.nettobetrag,
      mwst_satz: b.mwst_satz,
      bruttobetrag: b.bruttobetrag,
      steuerzeilen: b.steuerzeilen,
      rechnungstyp: b.rechnungstyp,
      zahlungsquelle_name: zahlungsquelleName,
      original_filename: b.original_filename,
    }
  })

  const csv = generateBelegslisteCSV(list)

  await supabase.from('export_protokolle').insert({
    mandant_id: mandant.id,
    jahr,
    monat,
    exportiert_von: user.id,
    export_typ: 'belegliste',
    anzahl_transaktionen: list.length,
    anzahl_ohne_beleg: 0,
  })
  await supabase
    .from('monatsabschluesse')
    .update({ export_vorhanden: true })
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)

  const filename = belegslisteDateiname(jahr, monat, mandant.firmenname)

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
