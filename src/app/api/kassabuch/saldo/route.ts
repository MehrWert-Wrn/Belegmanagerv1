import { createClient } from '@/lib/supabase/server'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

// GET /api/kassabuch/saldo – Aktueller Kassastand
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })
  const mandant = { id: mandantId }

  const kasse = await getOrCreateKasseQuelle(supabase, mandant.id)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle nicht gefunden' }, { status: 500 })

  // Summe aller nicht gelöschten Kassaeinträge
  const { data: sumData, error } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const summe = (sumData ?? []).reduce((acc, t) => acc + t.betrag, 0)
  const aktueller_saldo = kasse.anfangssaldo + summe

  return NextResponse.json({
    anfangssaldo: kasse.anfangssaldo,
    summe_eintraege: summe,
    aktueller_saldo,
    ist_negativ: aktueller_saldo < 0,
  })
}
