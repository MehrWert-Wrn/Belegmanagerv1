import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { generateDATEVCSV } from '@/lib/datev'
import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/export/[jahr]/[monat]/zip – CSV + Beleg-PDFs als ZIP
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

  const { data: transaktionen, error } = await supabase
    .from('transaktionen')
    .select(`
      betrag, datum, beschreibung, buchungsreferenz,
      match_status, workflow_status,
      beleg_id,
      belege ( id, rechnungsnummer, lieferant, rechnungsdatum, storage_path, original_filename )
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

  // ZIP aufbauen
  const zip = new JSZip()
  const firmaSlug = mandant.firmenname.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
  const monatStr2 = String(monat).padStart(2, '0')

  zip.file(`DATEV_Export_${jahr}_${monatStr2}_${firmaSlug}.csv`, csv)

  // Belege herunterladen und ins ZIP packen
  const belegeFolder = zip.folder('Belege')!
  const fehlendeBelege: string[] = []

  const uniqueBelege = exportDaten
    .filter(t => t.beleg?.storage_path)
    .map(t => t.beleg!)
    .filter((b, i, arr) => arr.findIndex(x => x.id === b.id) === i)

  // BUG-PROJ9-005: Guard against timeouts on large exports (Vercel 10s limit)
  // Async ZIP generation is planned for a future sprint; for now reject large requests.
  const ZIP_BELEG_LIMIT = 50
  if (uniqueBelege.length > ZIP_BELEG_LIMIT) {
    return NextResponse.json(
      {
        error: `ZIP-Export ist auf ${ZIP_BELEG_LIMIT} Belege begrenzt. Bitte verwende den CSV-Export fuer diesen Monat.`,
        anzahl_belege: uniqueBelege.length,
        limit: ZIP_BELEG_LIMIT,
      },
      { status: 413 }
    )
  }

  await Promise.all(
    uniqueBelege.map(async (beleg) => {
      const { data, error } = await supabase.storage
        .from('belege')
        .download(beleg.storage_path!)

      if (error || !data) {
        fehlendeBelege.push(beleg.original_filename ?? beleg.id)
        return
      }

      const arrayBuffer = await data.arrayBuffer()
      // Sanitize filename to prevent Zip Slip (CWE-22)
      const rawName = beleg.original_filename ?? `${beleg.id}.pdf`
      const safeFilename = rawName
        .replace(/[/\\]/g, '_')     // strip path separators
        .replace(/\.\./g, '_')       // strip ..
        .replace(/[^\w\s.\-()]/g, '_') // strip special chars
        .trim() || `${beleg.id}.pdf`
      belegeFolder.file(safeFilename, arrayBuffer)
    })
  )

  if (fehlendeBelege.length > 0) {
    zip.file('FEHLENDE_BELEGE.txt',
      `Folgende Belege konnten nicht gefunden werden:\n${fehlendeBelege.join('\n')}`)
  }

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  // Export protokollieren
  const anzahl_ohne_beleg = exportDaten.filter(t => !t.beleg).length
  await supabase.from('export_protokolle').insert({
    mandant_id: mandant.id,
    jahr,
    monat,
    exportiert_von: user.id,
    export_typ: 'zip',
    anzahl_transaktionen: exportDaten.length,
    anzahl_ohne_beleg,
  })

  await supabase
    .from('monatsabschluesse')
    .update({ datev_export_vorhanden: true })
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)

  const zipFilename = `DATEV_Export_${jahr}_${monatStr2}_${firmaSlug}.zip`

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFilename}"`,
    },
  })
}
