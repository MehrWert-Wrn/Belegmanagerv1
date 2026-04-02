import { createClient } from '@/lib/supabase/server'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const EigenbelegSchema = z.object({
  beschreibung: z.string().min(1).max(500),
  mwst_satz: z.number().min(0).max(100),
  kein_beleg_grund: z.string().min(1).max(500),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bruttobetrag: z.number().positive(),
})

// POST /api/transaktionen/[id]/eigenbeleg – Eigenbeleg für Transaktion erstellen
export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // BUG-008: Wrap JSON parsing to return 400 on malformed body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = EigenbelegSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, { status: 400 })
  }
  const { beschreibung, mwst_satz, kein_beleg_grund, datum, bruttobetrag } = parsed.data

  // Transaktion laden
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, betrag, mandant_id, match_status, beleg_id')
    .eq('id', id)
    .single()

  if (!transaktion) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })
  }

  // BUG-002: Nur für offene Transaktionen erlaubt
  if (transaktion.match_status !== 'offen') {
    return NextResponse.json({ error: 'Eigenbeleg kann nur für offene Transaktionen erstellt werden' }, { status: 409 })
  }

  // BUG-006: Nur für Ausgaben (betrag < 0)
  if (transaktion.betrag >= 0) {
    return NextResponse.json({ error: 'Eigenbeleg kann nur für Ausgaben erstellt werden' }, { status: 400 })
  }

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Nettobetrag berechnen
  const nettobetrag = mwst_satz > 0
    ? Math.round((bruttobetrag / (1 + mwst_satz / 100)) * 100) / 100
    : bruttobetrag

  const jahr = new Date(datum).getFullYear()
  const jetzt = new Date().toISOString()

  // BUG-003: Laufnummer mit Retry bei Unique-Constraint-Verletzung
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: maxRow } = await supabase
      .from('belege')
      .select('eigenbeleg_laufnummer')
      .eq('mandant_id', transaktion.mandant_id)
      .eq('eigenbeleg_jahr', jahr)
      .order('eigenbeleg_laufnummer', { ascending: false })
      .limit(1)
      .maybeSingle()

    const laufnummer = (maxRow?.eigenbeleg_laufnummer ?? 0) + 1 + attempt
    const laufnummerFormatiert = `${String(laufnummer).padStart(3, '0')}/${jahr}`
    const bezeichnung = `Eigenbeleg_${laufnummerFormatiert}`

    const { data: beleg, error: belegError } = await supabase
      .from('belege')
      .insert({
        mandant_id: transaktion.mandant_id,
        rechnungstyp: 'eigenbeleg',
        import_quelle: 'manuell',
        rechnungsname: bezeichnung,
        rechnungsnummer: laufnummerFormatiert,
        rechnungsdatum: datum,
        beschreibung,
        bruttobetrag,
        nettobetrag,
        mwst_satz,
        eigenbeleg_laufnummer: laufnummer,
        eigenbeleg_jahr: jahr,
        kein_beleg_grund,
        zuordnungsstatus: 'offen',
        dateityp: 'eigenbeleg',
      })
      .select()
      .single()

    // Retry on unique constraint violation (concurrent request grabbed same laufnummer)
    if (belegError?.code === '23505') continue

    if (belegError || !beleg) {
      return NextResponse.json({ error: belegError?.message ?? 'Beleg konnte nicht erstellt werden' }, { status: 500 })
    }

    // Transaktion mit Eigenbeleg verknüpfen
    const { error: txError } = await supabase
      .from('transaktionen')
      .update({
        beleg_id: beleg.id,
        match_status: 'bestaetigt',
        match_type: 'EIGENBELEG',
        match_score: 100,
        match_bestaetigt_am: jetzt,
        match_bestaetigt_von: user.id,
      })
      .eq('id', id)

    if (txError) {
      await supabase.from('belege').update({ geloescht_am: jetzt }).eq('id', beleg.id)
      return NextResponse.json({ error: txError.message }, { status: 500 })
    }

    await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', beleg.id)

    return NextResponse.json({
      success: true,
      beleg_id: beleg.id,
      bezeichnung,
      laufnummer: laufnummerFormatiert,
    })
  }

  return NextResponse.json({ error: 'Laufnummer konnte nicht vergeben werden, bitte erneut versuchen' }, { status: 409 })
}
