import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  transaktion_id: z.string().uuid(),
  beleg_id: z.string().uuid(),
})

// POST /api/matching/confirm – Vorgeschlagenen Match bestätigen
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { transaktion_id, beleg_id } = parsed.data

  // Transaktion auf bestaetigt setzen
  const { error: tErr } = await supabase
    .from('transaktionen')
    .update({
      match_status: 'bestaetigt',
      beleg_id,
      match_type: 'MANUAL',
    })
    .eq('id', transaktion_id)

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  // Beleg als zugeordnet markieren
  const { error: bErr } = await supabase
    .from('belege')
    .update({ zuordnungsstatus: 'zugeordnet' })
    .eq('id', beleg_id)

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
