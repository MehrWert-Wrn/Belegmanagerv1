import { createClient } from '@/lib/supabase/server'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  anfangssaldo: z.number(),
})

// PATCH /api/kassabuch/anfangssaldo – Anfangssaldo setzen/ändern
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })
  const mandant = { id: mandantId }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const kasse = await getOrCreateKasseQuelle(supabase, mandant.id)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle nicht gefunden' }, { status: 500 })

  // BAO §131: Kassastand darf nie negativ werden
  const { data: sumData } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)

  const summe = (sumData ?? []).reduce((acc, t) => acc + t.betrag, 0)
  const neuerSaldo = parsed.data.anfangssaldo + summe
  if (neuerSaldo < 0) {
    return NextResponse.json(
      { error: `Kassastand wuerde negativ werden (${neuerSaldo.toFixed(2)} EUR). Anfangssaldo abgelehnt.` },
      { status: 400 }
    )
  }

  const { error } = await supabase
    .from('zahlungsquellen')
    .update({
      anfangssaldo: parsed.data.anfangssaldo,
      anfangssaldo_gesetzt_am: new Date().toISOString(),
    })
    .eq('id', kasse.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, anfangssaldo: parsed.data.anfangssaldo })
}
