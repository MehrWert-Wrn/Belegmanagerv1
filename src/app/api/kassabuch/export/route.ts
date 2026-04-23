/**
 * GET /api/kassabuch/export
 * Query:
 *   - monat=YYYY-MM   → Monatsbericht
 *   - jahr=YYYY       → Jahresbericht
 *   - format=pdf|csv
 *
 * Response: PDF oder CSV als Download (Content-Disposition: attachment).
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import {
  loadKassabuchMonatData,
  loadKassabuchJahrData,
} from '@/lib/kassabuch-export'
import { renderKassabuchPdf } from '@/lib/kassabuch-pdf'
import { buildKassabuchCsv } from '@/lib/kassabuch-csv'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const monat = searchParams.get('monat')
  const jahr = searchParams.get('jahr')
  const format = (searchParams.get('format') ?? 'pdf').toLowerCase()

  if (format !== 'pdf' && format !== 'csv') {
    return NextResponse.json({ error: 'Format muss pdf oder csv sein' }, { status: 400 })
  }
  if (!monat && !jahr) {
    return NextResponse.json({ error: 'Bitte monat oder jahr angeben' }, { status: 400 })
  }
  if (monat && !/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) {
    return NextResponse.json({ error: 'monat muss Format YYYY-MM haben' }, { status: 400 })
  }
  if (jahr && !/^\d{4}$/.test(jahr)) {
    return NextResponse.json({ error: 'jahr muss Format YYYY haben' }, { status: 400 })
  }

  try {
    let data: Awaited<ReturnType<typeof loadKassabuchMonatData>>
    let zeitraumLabel: string
    let anfangssaldoDatum: string
    let endsaldoDatum: string
    let baseFilename: string

    let gesperrtAm: Date | undefined

    if (monat) {
      data = await loadKassabuchMonatData(supabase, mandantId, monat)
      const [y, m] = monat.split('-').map(Number)
      const monatsName = new Date(y, m - 1, 1).toLocaleDateString('de-AT', { month: 'long' })
      zeitraumLabel = `${monatsName} ${y}`
      anfangssaldoDatum = `${monat}-01`
      endsaldoDatum = new Date(y, m, 0).toISOString().split('T')[0]
      baseFilename = `kassabuch-${monat}`

      // BUG-PROJ7-29: gesperrt-Footer wenn Monat abgeschlossen
      const { data: abschluss } = await supabase
        .from('monatsabschluesse')
        .select('abgeschlossen_am')
        .eq('mandant_id', mandantId)
        .eq('jahr', y)
        .eq('monat', m)
        .eq('status', 'abgeschlossen')
        .maybeSingle()
      if (abschluss?.abgeschlossen_am) {
        gesperrtAm = new Date(abschluss.abgeschlossen_am)
      }
    } else {
      const y = parseInt(jahr!, 10)
      data = await loadKassabuchJahrData(supabase, mandantId, y)
      zeitraumLabel = `Jahresbericht ${y}`
      anfangssaldoDatum = `${y}-01-01`
      endsaldoDatum = `${y}-12-31`
      baseFilename = `kassabuch-jahresbericht-${y}`
    }

    if (format === 'pdf') {
      const pdfBuffer = await renderKassabuchPdf({
        mandantName: data.mandantName,
        zeitraumLabel,
        anfangssaldo: data.anfangssaldoMonat,
        anfangssaldoDatum,
        endsaldo: data.endsaldoMonat,
        endsaldoDatum,
        summeEinnahmen: data.summeEinnahmen,
        summeAusgaben: data.summeAusgaben,
        buchungen: data.buchungenPdf,
        erstelltAm: new Date(),
        gesperrtAm,
        quartalsZwischensummen: data.quartalsZwischensummen,
        hinweisOffeneMonate: data.hinweisOffeneMonate,
      })

      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${baseFilename}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }

    // CSV
    const csv = buildKassabuchCsv({
      mandantName: data.mandantName,
      zeitraumLabel,
      anfangssaldo: data.anfangssaldoMonat,
      anfangssaldoDatum,
      endsaldo: data.endsaldoMonat,
      endsaldoDatum,
      summeEinnahmen: data.summeEinnahmen,
      summeAusgaben: data.summeAusgaben,
      buchungen: data.buchungenCsv,
      quartalsZwischensummen: data.quartalsZwischensummen,
      hinweisOffeneMonate: data.hinweisOffeneMonate,
    })

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${baseFilename}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export fehlgeschlagen'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
