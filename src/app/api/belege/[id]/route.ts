import { createClient } from '@/lib/supabase/server'
import { requireAdmin, getMandantId } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungsname: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges']).optional(),
  uid_lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  beschreibung: z.string().max(100, 'Beschreibung darf maximal 100 Zeichen lang sein').optional(),
  bruttobetrag: z.number().nullable().optional(),
  nettobetrag: z.number().nullable().optional(),
  mwst_satz: z.number().nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

// PATCH /api/belege/[id] – Metadaten aktualisieren
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Monats-Lock-Check: Wenn Beleg einer Transaktion zugeordnet ist,
  // darf er in abgeschlossenen Monaten nicht bearbeitet werden.
  const mandant_id = await getMandantId(supabase)
  if (mandant_id) {
    const { data: linkedTx } = await supabase
      .from('transaktionen')
      .select('datum')
      .eq('beleg_id', id)
      .maybeSingle()

    if (linkedTx) {
      const gesperrt = await isMonatGesperrt(supabase, mandant_id, linkedTx.datum)
      if (gesperrt) {
        return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
      }
    }
  }

  const { data, error } = await supabase
    .from('belege')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/belege/[id] – Soft Delete (Datei bleibt in Storage für Audit-Trail)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { id } = await params

  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('zuordnungsstatus')
    .eq('id', id)
    .single()

  if (fetchError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  // Monats-Lock-Check: Wenn Beleg einer Transaktion zugeordnet ist,
  // darf er in abgeschlossenen Monaten nicht gelöscht werden (würde match_status zurücksetzen).
  if (beleg.zuordnungsstatus === 'zugeordnet') {
    const mandant_id = await getMandantId(supabase)
    if (mandant_id) {
      const { data: linkedTx } = await supabase
        .from('transaktionen')
        .select('datum')
        .eq('beleg_id', id)
        .maybeSingle()

      if (linkedTx) {
        const gesperrt = await isMonatGesperrt(supabase, mandant_id, linkedTx.datum)
        if (gesperrt) {
          return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
        }
      }
    }
  }

  const { error } = await supabase
    .from('belege')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unlink any transaction that references this beleg
  if (beleg.zuordnungsstatus === 'zugeordnet') {
    await supabase
      .from('transaktionen')
      .update({
        beleg_id: null,
        match_status: 'offen',
        match_type: null,
        match_score: 0,
        match_bestaetigt_am: null,
        match_bestaetigt_von: null,
      })
      .eq('beleg_id', id)
  }

  return NextResponse.json({
    success: true,
    was_zugeordnet: beleg.zuordnungsstatus === 'zugeordnet',
  })
}
