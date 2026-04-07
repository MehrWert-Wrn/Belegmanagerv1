import { createClient } from '@/lib/supabase/server'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  betrag: z.number().refine(v => v !== 0).optional(),
  beschreibung: z.string().optional(),
  beleg_id: z.string().uuid().optional(),
  mwst_satz: z.number().nullable().optional(),
  mwst_betrag: z.number().nullable().optional(),
  kassa_buchungstyp: z.enum(['EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME']).optional(),
})

const stornoSchema = z.object({
  storno_grund: z.string().min(1, 'Stornobegründung ist erforderlich').max(500),
})

// PATCH /api/kassabuch/eintraege/[id] – Eintrag bearbeiten
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, betrag, beleg_id, mandant_id, quelle_id, geloescht_am, kassa_buchungstyp')
    .eq('id', id)
    .single()

  if (!transaktion || transaktion.geloescht_am) {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }

  const { data: quelle } = await supabase
    .from('zahlungsquellen').select('typ, anfangssaldo').eq('id', transaktion.quelle_id).single()
  if (!quelle || quelle.typ !== 'kassa') {
    return NextResponse.json({ error: 'Nur Kassaeintraege koennen bearbeitet werden' }, { status: 403 })
  }

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (parsed.data.datum && parsed.data.datum !== transaktion.datum) {
    if (await isMonatGesperrt(supabase, transaktion.mandant_id, parsed.data.datum)) {
      return NextResponse.json({ error: 'Zielmonat ist abgeschlossen' }, { status: 403 })
    }
  }

  // BAO §131: Kassastand darf nie negativ werden
  // Wenn Betrag geändert wird, Delta auf Gesamtsaldo prüfen
  if (parsed.data.betrag !== undefined) {
    const { data: sumData } = await supabase
      .from('transaktionen')
      .select('betrag')
      .eq('quelle_id', transaktion.quelle_id)
      .is('geloescht_am', null)

    const currentSumme = (sumData ?? []).reduce((acc, t) => acc + t.betrag, 0)
    // Entferne alten Betrag, füge neuen hinzu
    const neuerSaldo = (quelle.anfangssaldo ?? 0) + currentSumme - transaktion.betrag + parsed.data.betrag
    if (neuerSaldo < 0) {
      return NextResponse.json(
        { error: `Kassenstand wuerde negativ werden (${neuerSaldo.toFixed(2)} EUR). Buchung abgelehnt.` },
        { status: 400 }
      )
    }
  }

  // Derive buchungstyp from betrag if not provided
  const updateData: Record<string, unknown> = { ...parsed.data }
  if (parsed.data.betrag !== undefined && !parsed.data.kassa_buchungstyp) {
    updateData.kassa_buchungstyp = parsed.data.betrag > 0 ? 'EINNAHME' : 'AUSGABE'
  }

  const { data, error } = await supabase
    .from('transaktionen')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Beleg-Zuordnung aktualisieren wenn beleg_id gesetzt
  if (parsed.data.beleg_id && parsed.data.beleg_id !== transaktion.beleg_id) {
    await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', parsed.data.beleg_id)
    if (transaktion.beleg_id) {
      await supabase.from('belege').update({ zuordnungsstatus: 'offen' }).eq('id', transaktion.beleg_id)
    }
  }

  return NextResponse.json(data)
}

// DELETE /api/kassabuch/eintraege/[id] – BAO-konform: Stornobuchung statt Loeschung
// Body: { storno_grund: string }
export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = stornoSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { id } = await params

  const { data: original } = await supabase
    .from('transaktionen')
    .select('datum, betrag, beschreibung, mandant_id, quelle_id, beleg_id, geloescht_am, kassa_buchungstyp')
    .eq('id', id)
    .single()

  if (!original || original.geloescht_am) {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }

  const { data: quelle } = await supabase
    .from('zahlungsquellen').select('typ, anfangssaldo').eq('id', original.quelle_id).single()
  if (!quelle || quelle.typ !== 'kassa') {
    return NextResponse.json({ error: 'Nur Kassaeintraege koennen storniert werden' }, { status: 403 })
  }

  if (await isMonatGesperrt(supabase, original.mandant_id, original.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Pruefen ob bereits ein Storno fuer diesen Eintrag existiert
  const { data: existingStorno } = await supabase
    .from('transaktionen')
    .select('id')
    .eq('storno_zu_id', id)
    .is('geloescht_am', null)
    .maybeSingle()

  if (existingStorno) {
    return NextResponse.json({ error: 'Dieser Eintrag wurde bereits storniert' }, { status: 409 })
  }

  // BAO §131: Kassastand darf nie negativ werden
  // Storno kehrt den Betrag um – pruefen ob das den Stand negativ macht
  const stornoBetrag = -original.betrag
  const { data: sumData } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', original.quelle_id)
    .is('geloescht_am', null)

  const currentSumme = (sumData ?? []).reduce((acc, t) => acc + t.betrag, 0)
  const anfangssaldo = quelle.anfangssaldo ?? 0
  const neuerSaldo = anfangssaldo + currentSumme + stornoBetrag
  if (neuerSaldo < 0) {
    return NextResponse.json(
      { error: `Storno wuerde Kassastand negativ machen (${neuerSaldo.toFixed(2)} EUR). Storno abgelehnt.` },
      { status: 400 }
    )
  }

  // Stornobuchung einfuegen (gegenlaeufige Buchung mit STORNO-Typ)
  const stornoInsert = {
    mandant_id: original.mandant_id,
    quelle_id: original.quelle_id,
    datum: original.datum,
    betrag: stornoBetrag,
    beschreibung: `STORNO: ${original.beschreibung ?? ''}`.trim(),
    kassa_buchungstyp: 'STORNO',
    storno_zu_id: id,
    storno_grund: parsed.data.storno_grund,
    match_status: 'kein_beleg',
  }

  const { error: insertError } = await supabase
    .from('transaktionen')
    .insert(stornoInsert)

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  // Original als storniert markieren (geloescht_am = Audit-Marker, kein echtes Loeschen)
  const { error: markError } = await supabase
    .from('transaktionen')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', id)

  if (markError) return NextResponse.json({ error: markError.message }, { status: 500 })

  // Beleg freigeben wenn vorhanden
  if (original.beleg_id) {
    await supabase.from('belege')
      .update({ zuordnungsstatus: 'offen' })
      .eq('id', original.beleg_id)
  }

  return NextResponse.json({ success: true, storniert: true })
}
