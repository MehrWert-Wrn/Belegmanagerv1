import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  transaktion_id: z.string().uuid(),
  beleg_id: z.string().uuid(), // der abgelehnte Vorschlag
})

// POST /api/matching/reject – Vorgeschlagenen Match ablehnen
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { transaktion_id, beleg_id } = parsed.data

  // Aktuell abgelehnte Belege holen
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('match_abgelehnte_beleg_ids')
    .eq('id', transaktion_id)
    .single()

  const abgelehnte = [
    ...(transaktion?.match_abgelehnte_beleg_ids ?? []),
    beleg_id,
  ]

  // Transaktion zurück auf offen + Beleg-ID in Ablehnungsliste
  const { error } = await supabase
    .from('transaktionen')
    .update({
      match_status: 'offen',
      match_score: 0,
      match_type: null,
      beleg_id: null,
      match_abgelehnte_beleg_ids: abgelehnte,
    })
    .eq('id', transaktion_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Beleg wieder auf offen (falls er durch diesen Match zugeordnet war)
  await supabase
    .from('belege')
    .update({ zuordnungsstatus: 'offen' })
    .eq('id', beleg_id)
    .eq('zuordnungsstatus', 'zugeordnet')

  return NextResponse.json({ success: true })
}
