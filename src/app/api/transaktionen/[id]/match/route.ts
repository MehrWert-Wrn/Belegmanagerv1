import { createClient } from '@/lib/supabase/server'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

// POST /api/transaktionen/[id]/match – Beleg manuell zuordnen
export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const { beleg_id } = z.object({ beleg_id: z.string().uuid() }).parse(body)

  // Transaktion + Datum holen für Monat-Lock-Check
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, betrag, mandant_id, beleg_id')
    .eq('id', id)
    .single()

  if (!transaktion) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Prüfen ob Beleg bereits anderweitig zugeordnet ist
  const { data: beleg } = await supabase
    .from('belege')
    .select('id, bruttobetrag, zuordnungsstatus')
    .eq('id', beleg_id)
    .single()

  if (!beleg) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })

  if (beleg.zuordnungsstatus === 'zugeordnet' && transaktion.beleg_id !== beleg_id) {
    return NextResponse.json({
      error: 'beleg_bereits_zugeordnet',
      message: 'Dieser Beleg ist bereits einer anderen Transaktion zugeordnet.',
    }, { status: 409 })
  }

  // Betrag-Warnung berechnen (≥ 10% Abweichung)
  let betrag_warnung = false
  if (beleg.bruttobetrag !== null) {
    const abweichung = Math.abs(Math.abs(transaktion.betrag) - beleg.bruttobetrag) / beleg.bruttobetrag
    betrag_warnung = abweichung >= 0.1
  }

  const jetzt = new Date().toISOString()

  // Alten Beleg freigeben (falls vorhanden)
  if (transaktion.beleg_id && transaktion.beleg_id !== beleg_id) {
    await supabase.from('belege')
      .update({ zuordnungsstatus: 'offen' })
      .eq('id', transaktion.beleg_id)
  }

  // Transaktion aktualisieren
  const { error } = await supabase.from('transaktionen').update({
    beleg_id,
    match_status: 'bestaetigt',
    match_type: 'MANUAL',
    match_score: 100,
    match_bestaetigt_am: jetzt,
    match_bestaetigt_von: user.id,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Beleg als zugeordnet markieren
  await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', beleg_id)

  return NextResponse.json({ success: true, betrag_warnung })
}

// DELETE /api/transaktionen/[id]/match – Zuordnung entfernen
export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, mandant_id, beleg_id')
    .eq('id', id)
    .single()

  if (!transaktion) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Beleg freigeben
  if (transaktion.beleg_id) {
    await supabase.from('belege')
      .update({ zuordnungsstatus: 'offen' })
      .eq('id', transaktion.beleg_id)
  }

  const { error } = await supabase.from('transaktionen').update({
    beleg_id: null,
    match_status: 'offen',
    match_type: null,
    match_score: 0,
    match_bestaetigt_am: null,
    match_bestaetigt_von: null,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// PATCH /api/transaktionen/[id]/match – Als "kein_beleg" markieren
export async function PATCH(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, mandant_id, beleg_id')
    .eq('id', id)
    .single()

  if (!transaktion) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Eventuellen Beleg freigeben
  if (transaktion.beleg_id) {
    await supabase.from('belege')
      .update({ zuordnungsstatus: 'offen' })
      .eq('id', transaktion.beleg_id)
  }

  const { error } = await supabase.from('transaktionen').update({
    beleg_id: null,
    match_status: 'kein_beleg',
    match_type: 'MANUAL',
    match_score: 100,
    match_bestaetigt_am: new Date().toISOString(),
    match_bestaetigt_von: user.id,
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
