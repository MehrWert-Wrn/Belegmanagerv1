import { createClient } from '@/lib/supabase/server'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  betrag: z.number().refine(v => v !== 0).optional(),
  beschreibung: z.string().optional(),
})

// PATCH /api/kassabuch/eintraege/[id] – Eintrag bearbeiten
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, mandant_id, quelle_id, geloescht_am')
    .eq('id', id)
    .single()

  if (!transaktion || transaktion.geloescht_am) {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }

  // Sicherstellen, dass es sich um einen Kassaeintrag handelt
  const { data: quelle } = await supabase
    .from('zahlungsquellen').select('typ').eq('id', transaktion.quelle_id).single()
  if (!quelle || quelle.typ !== 'kassa') {
    return NextResponse.json({ error: 'Nur Kassaeintraege koennen bearbeitet werden' }, { status: 403 })
  }

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Wenn Datum geändert wird, neuen Monat auch prüfen
  if (parsed.data.datum && parsed.data.datum !== transaktion.datum) {
    if (await isMonatGesperrt(supabase, transaktion.mandant_id, parsed.data.datum)) {
      return NextResponse.json({ error: 'Zielmonat ist abgeschlossen' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('transaktionen')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/kassabuch/eintraege/[id] – Soft Delete
export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { id } = await params

  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, mandant_id, beleg_id, geloescht_am, quelle_id')
    .eq('id', id)
    .single()

  if (!transaktion || transaktion.geloescht_am) {
    return NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 })
  }

  // Sicherstellen, dass es sich um einen Kassaeintrag handelt
  const { data: quelleDelete } = await supabase
    .from('zahlungsquellen').select('typ').eq('id', transaktion.quelle_id).single()
  if (!quelleDelete || quelleDelete.typ !== 'kassa') {
    return NextResponse.json({ error: 'Nur Kassaeintraege koennen geloescht werden' }, { status: 403 })
  }

  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Beleg freigeben
  if (transaktion.beleg_id) {
    await supabase.from('belege')
      .update({ zuordnungsstatus: 'offen' })
      .eq('id', transaktion.beleg_id)
  }

  const { error } = await supabase
    .from('transaktionen')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
