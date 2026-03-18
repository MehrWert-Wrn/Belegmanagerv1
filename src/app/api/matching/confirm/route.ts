import { createClient } from '@/lib/supabase/server'
import { isMonatGesperrt } from '@/lib/monat-lock'
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

  // Transaktion holen für Monat-Lock-Check und match_type-Erhalt
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('datum, mandant_id, match_type')
    .eq('id', transaktion_id)
    .single()

  if (!transaktion) return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })

  // BUG-PROJ6-002: Monat-Lock prüfen
  if (await isMonatGesperrt(supabase, transaktion.mandant_id, transaktion.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  // Transaktion auf bestaetigt setzen
  // BUG-PROJ6-003: match_type der Engine beibehalten (nicht mit 'MANUAL' überschreiben)
  // BUG-PROJ6-001: match_bestaetigt_am + match_bestaetigt_von setzen
  const { data: updated, error: tErr } = await supabase
    .from('transaktionen')
    .update({
      match_status: 'bestaetigt',
      beleg_id,
      match_bestaetigt_am: new Date().toISOString(),
      match_bestaetigt_von: user.id,
    })
    .eq('id', transaktion_id)
    .select('id')

  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Transaktion nicht gefunden oder keine Berechtigung' }, { status: 404 })

  // Beleg als zugeordnet markieren
  const { error: bErr } = await supabase
    .from('belege')
    .update({ zuordnungsstatus: 'zugeordnet' })
    .eq('id', beleg_id)

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
