import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import {
  generateBelegslisteCSV,
  generateLiesmichBelegliste,
  belegslisteDateiname,
  belegslisteZipDateiname,
  countBelegslisteZeilen,
  type BelegslisteBeleg,
} from '@/lib/buchungsexport'
import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// Synchroner ZIP-Guard analog zur Buchhaltungsuebergabe.
const ZIP_BELEG_LIMIT = 50

// POST /api/export/[jahr]/[monat]/belegliste/zip
// ZIP-Paket der Belegliste: CSV + Beleg-PDFs + LIESMICH_BELEGLISTE.txt
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
      { error: 'Export nur fuer abgeschlossene Monate' },
      { status: 403 }
    )
  }

  const monatStart = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const monatEnde = new Date(jahr, monat, 0).toISOString().split('T')[0]
  const monatStartTs = `${monatStart}T00:00:00.000Z`
  const monatEndePlus1 = new Date(Date.UTC(jahr, monat, 1)).toISOString()

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
      storage_path,
      transaktionen ( zahlungsquellen ( name ) )
    `)
    .eq('mandant_id', mandant.id)
    .or(
      `and(rechnungsdatum.gte.${monatStart},rechnungsdatum.lte.${monatEnde}),and(rechnungsdatum.is.null,erstellt_am.gte.${monatStartTs},erstellt_am.lt.${monatEndePlus1})`
    )
    .order('rechnungsdatum', { ascending: true, nullsFirst: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const belegList = belege ?? []

  // Limit-Guard fuer synchrones ZIP (Vercel-Timeouts vermeiden)
  if (belegList.length > ZIP_BELEG_LIMIT) {
    return NextResponse.json(
      {
        error: `ZIP-Export der Belegliste ist auf ${ZIP_BELEG_LIMIT} Belege begrenzt. Bitte verwende den CSV-Export fuer diesen Monat.`,
        anzahl_belege: belegList.length,
        limit: ZIP_BELEG_LIMIT,
      },
      { status: 413 }
    )
  }

  // Mapping fuer den CSV-Generator
  const csvList: BelegslisteBeleg[] = belegList.map(b => {
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

  const csv = generateBelegslisteCSV(csvList)
  const csvName = belegslisteDateiname(jahr, monat, mandant.firmenname)

  const zip = new JSZip()
  zip.file(csvName, csv)

  const belegeFolder = zip.folder('belege')!
  const fehlendeBelege: string[] = []
  let anzahlBelegePdfs = 0

  await Promise.all(
    belegList
      .filter(b => b.storage_path)
      .map(async b => {
        const storagePath = b.storage_path!
        const { data, error: dlError } = await supabase.storage
          .from('belege')
          .download(storagePath)

        const rawName = b.original_filename ?? storagePath.split('/').pop() ?? 'beleg.pdf'

        if (dlError || !data) {
          fehlendeBelege.push(rawName)
          return
        }

        const arrayBuffer = await data.arrayBuffer()
        // Sanitize filename (Zip-Slip-Schutz, CWE-22) – analog zur Buchhaltungsuebergabe
        const safeFilename =
          rawName
            .replace(/[/\\]/g, '_')
            .replace(/\.\./g, '_')
            .replace(/[^\w\s.\-()]/g, '_')
            .trim() || 'beleg.pdf'

        belegeFolder.file(safeFilename, arrayBuffer)
        anzahlBelegePdfs += 1
      })
  )

  if (fehlendeBelege.length > 0) {
    zip.file(
      'FEHLENDE_BELEGE.txt',
      `Folgende Belege konnten nicht aus dem Storage geladen werden:\r\n\r\n${fehlendeBelege.join('\r\n')}\r\n`
    )
  }

  // LIESMICH_BELEGLISTE.txt
  const anzahlZeilenGesamt = countBelegslisteZeilen(csvList)
  const liesmich = generateLiesmichBelegliste({
    firmenname: mandant.firmenname,
    jahr,
    monat,
    exportiertAmIso: new Date().toISOString(),
    exportiertVon: user.email ?? 'unbekannt',
    anzahlBelege: csvList.length,
    anzahlZeilenGesamt,
    anzahlBelegePdfs,
    csvDateiname: csvName,
  })
  zip.file('LIESMICH_BELEGLISTE.txt', liesmich)

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  await supabase.from('export_protokolle').insert({
    mandant_id: mandant.id,
    jahr,
    monat,
    exportiert_von: user.id,
    export_typ: 'belegliste',
    anzahl_transaktionen: csvList.length,
    anzahl_ohne_beleg: 0,
  })
  await supabase
    .from('monatsabschluesse')
    .update({ export_vorhanden: true })
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)

  const zipName = belegslisteZipDateiname(jahr, monat, mandant.firmenname)

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
