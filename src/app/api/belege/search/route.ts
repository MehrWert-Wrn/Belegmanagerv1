import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/belege/search – Schnellsuche für Zuordnungs-Dialog
// Query params: q (Lieferant/RN), betrag_von, betrag_bis, datum_von, datum_bis, nur_offen
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')
  const betragVon = searchParams.get('betrag_von')
  const betragBis = searchParams.get('betrag_bis')
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')
  const nurOffen = searchParams.get('nur_offen') !== 'false' // default: nur offene

  let query = supabase
    .from('belege')
    .select('id, lieferant, rechnungsnummer, rechnungsname, bruttobetrag, rechnungsdatum, zuordnungsstatus, original_filename')
    .is('geloescht_am', null)
    .order('rechnungsdatum', { ascending: false })
    .limit(100)

  if (nurOffen) query = query.eq('zuordnungsstatus', 'offen')
  if (q) query = query.or(`lieferant.ilike.%${q}%,rechnungsnummer.ilike.%${q}%,rechnungsname.ilike.%${q}%`)
  if (betragVon) query = query.gte('bruttobetrag', parseFloat(betragVon))
  if (betragBis) query = query.lte('bruttobetrag', parseFloat(betragBis))
  if (datumVon) query = query.gte('rechnungsdatum', datumVon)
  if (datumBis) query = query.lte('rechnungsdatum', datumBis)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
