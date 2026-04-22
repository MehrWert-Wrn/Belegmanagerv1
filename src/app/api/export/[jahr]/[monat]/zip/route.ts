import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import {
  generateBuchungsCSV,
  generateLiesmich,
  csvDateiname,
  zipDateiname,
  countCsvZeilen,
  type BuchungsexportTransaktion,
} from '@/lib/buchungsexport'
import { NextResponse } from 'next/server'
import JSZip from 'jszip'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/export/[jahr]/[monat]/zip – CSV + Beleg-PDFs + LIESMICH als ZIP
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

  const { data: transaktionen, error } = await supabase
    .from('transaktionen')
    .select(`
      buchungsnummer,
      betrag,
      datum,
      beschreibung,
      match_status,
      workflow_status,
      beleg_id,
      zahlungsquellen ( typ ),
      belege (
        id,
        rechnungstyp,
        rechnungsdatum,
        nettobetrag,
        mwst_satz,
        steuerzeilen,
        rechnungsnummer,
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

  // Eindeutige Belege ermitteln (de-dupliziert nach id), buchungsnummer mitführen
  const uniqueBelege = exportDaten
    .filter(t => t.beleg?.storage_path)
    .map(t => ({ beleg: t.beleg!, buchungsnummer: t.buchungsnummer ?? null }))
    .filter((item, i, arr) => {
      const id = (item.beleg as unknown as { id?: string | null }).id ?? null
      if (!id) return true
      return arr.findIndex(x => (x.beleg as unknown as { id?: string }).id === id) === i
    })

  // Guard: Bei >50 Belegen ablehnen, um Vercel-Timeouts zu vermeiden
  // (Async ZIP-Generierung als zukuenftige Erweiterung geplant)
  const ZIP_BELEG_LIMIT = 50
  if (uniqueBelege.length > ZIP_BELEG_LIMIT) {
    return NextResponse.json(
      {
        error: `ZIP-Export ist auf ${ZIP_BELEG_LIMIT} Belege begrenzt. Bitte verwende den CSV-Export für diesen Monat.`,
        anzahl_belege: uniqueBelege.length,
        limit: ZIP_BELEG_LIMIT,
      },
      { status: 413 }
    )
  }

  // ZIP aufbauen
  const zip = new JSZip()
  const csvName = csvDateiname(jahr, monat, mandant.firmenname)

  zip.file(csvName, csv)

  const belegeFolder = zip.folder('belege')!
  const fehlendeBelege: string[] = []
  let anzahlBelegePdfs = 0

  await Promise.all(
    uniqueBelege.map(async ({ beleg, buchungsnummer }) => {
      const storagePath = beleg.storage_path!
      const { data, error: dlError } = await supabase.storage
        .from('belege')
        .download(storagePath)

      const rawName = beleg.original_filename ?? storagePath.split('/').pop() ?? 'beleg.pdf'
      // Präfix mit Buchungsnummer für eindeutige Zuordnung CSV ↔ ZIP
      const prefixedName = buchungsnummer ? `${buchungsnummer}_${rawName}` : rawName

      if (dlError || !data) {
        fehlendeBelege.push(prefixedName)
        return
      }

      const arrayBuffer = await data.arrayBuffer()
      // Sanitize filename to prevent Zip Slip (CWE-22)
      const safeFilename = prefixedName
        .replace(/[/\\]/g, '_')           // Pfadseparatoren entfernen
        .replace(/\.\./g, '_')             // Parent-dir-Sequenzen entfernen
        .replace(/[^\w\s.\-()]/g, '_')     // Sonderzeichen entfernen
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

  // LIESMICH.txt
  const anzahl_ohne_beleg = exportDaten.filter(t => !t.beleg).length
  const anzahl_mit_beleg = exportDaten.length - anzahl_ohne_beleg
  const anzahl_csv_zeilen = countCsvZeilen(exportDaten)
  const liesmich = generateLiesmich({
    firmenname: mandant.firmenname,
    jahr,
    monat,
    exportiertAmIso: new Date().toISOString(),
    exportiertVon: user.email ?? 'unbekannt',
    anzahlBelegePdfs,
    anzahlZeilenGesamt: anzahl_csv_zeilen,
    anzahlMitBeleg: anzahl_mit_beleg,
    anzahlOhneBeleg: anzahl_ohne_beleg,
    csvDateiname: csvName,
  })
  zip.file('LIESMICH.txt', liesmich)

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  // Export protokollieren (beide Updates parallel, Fehler isoliert damit Download nicht blockiert)
  await Promise.allSettled([
    supabase.from('export_protokolle').insert({
      mandant_id: mandant.id,
      jahr,
      monat,
      exportiert_von: user.id,
      export_typ: 'zip',
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

  const zipName = zipDateiname(jahr, monat, mandant.firmenname)

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}
