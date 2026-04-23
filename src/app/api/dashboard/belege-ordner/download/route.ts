import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'
import JSZip from 'jszip'
import { z } from 'zod'

const bodySchema = z.object({
  monat: z.string().regex(/^\d{4}-\d{2}$/),
  rechnungstyp: z.string().optional(),
})

const ZIP_LIMIT = 100

type BelegFile = {
  storage_path: string | null
  original_filename: string | null
}

export async function POST(request: Request) {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })

  const { monat, rechnungstyp } = parsed.data
  const [year, month] = monat.split('-').map(Number)
  const vonDatum = `${monat}-01`
  const bisDatum = new Date(year, month, 0).toISOString().split('T')[0]
  const bisDatumEnd = `${bisDatum}T23:59:59`

  const supabase = await createClient()

  const select = 'id, storage_path, original_filename'

  // Query 1: belege mit rechnungsdatum im Monat
  let q1 = supabase
    .from('belege')
    .select(select)
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .not('storage_path', 'is', null)
    .not('rechnungsdatum', 'is', null)
    .gte('rechnungsdatum', vonDatum)
    .lte('rechnungsdatum', bisDatum)
    .limit(ZIP_LIMIT + 1)
  if (rechnungstyp) q1 = q1.eq('rechnungstyp', rechnungstyp)

  // Query 2: belege ohne rechnungsdatum, eingestellt im Monat (Fallback)
  let q2 = supabase
    .from('belege')
    .select(select)
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .not('storage_path', 'is', null)
    .is('rechnungsdatum', null)
    .gte('erstellt_am', `${vonDatum}T00:00:00`)
    .lte('erstellt_am', bisDatumEnd)
    .limit(ZIP_LIMIT + 1)
  if (rechnungstyp) q2 = q2.eq('rechnungstyp', rechnungstyp)

  const [r1, r2] = await Promise.all([q1, q2])

  if (r1.error || r2.error) {
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  }

  // Deduplicate by id and merge
  const seenIds = new Set<string>()
  const allBelege: BelegFile[] = []
  for (const b of [...(r1.data ?? []), ...(r2.data ?? [])]) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id)
      allBelege.push(b)
    }
  }

  if (allBelege.length > ZIP_LIMIT) {
    return NextResponse.json(
      { error: `ZIP-Export ist auf ${ZIP_LIMIT} Belege begrenzt.`, anzahl: allBelege.length, limit: ZIP_LIMIT },
      { status: 413 }
    )
  }

  if (allBelege.length === 0) {
    return NextResponse.json({ error: 'Keine Dateien für diesen Zeitraum vorhanden.' }, { status: 404 })
  }

  const zip = new JSZip()
  const folder = rechnungstyp
    ? zip.folder(TYP_LABEL[rechnungstyp] ?? rechnungstyp)!
    : zip

  await Promise.all(
    allBelege.map(async (beleg) => {
      const { data, error: dlError } = await supabase.storage
        .from('belege')
        .download(beleg.storage_path!)

      if (dlError || !data) return

      const rawName =
        beleg.original_filename ??
        beleg.storage_path!.split('/').pop() ??
        'beleg.pdf'

      // Zip Slip prevention (CWE-22)
      const safeFilename = rawName
        .replace(/[/\\]/g, '_')
        .replace(/\.\./g, '_')
        .replace(/[^\w\s.\-()]/g, '_')
        .trim() || 'beleg.pdf'

      folder.file(safeFilename, await data.arrayBuffer())
    })
  )

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  const typSuffix = rechnungstyp ? `_${TYP_LABEL[rechnungstyp] ?? rechnungstyp}` : ''
  const zipName = `Belege_${monat}${typSuffix}.zip`

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${zipName}"`,
    },
  })
}

const TYP_LABEL: Record<string, string> = {
  eingangsrechnung: 'Eingangsrechnungen',
  ausgangsrechnung: 'Ausgangsrechnungen',
  eigenbeleg: 'Eigenbelege',
  gutschrift: 'Gutschriften',
  eigenverbrauch: 'Eigenverbrauch',
}
