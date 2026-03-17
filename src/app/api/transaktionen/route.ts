import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transaktionen – Liste mit Filtern
// Query params: quelle_id, match_status, datum_von, datum_bis, nur_offen
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const quelleId = searchParams.get('quelle_id')
  const matchStatus = searchParams.get('match_status')
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')
  const nurOffen = searchParams.get('nur_offen') === 'true'
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '50'), 200)
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('transaktionen')
    .select(`
      id, datum, betrag, beschreibung, match_status, match_score, match_type,
      workflow_status, quelle_id, beleg_id,
      belege ( lieferant, rechnungsnummer, bruttobetrag ),
      zahlungsquellen ( name, typ )
    `, { count: 'exact' })
    .order('datum', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (quelleId) query = query.eq('quelle_id', quelleId)
  if (matchStatus) query = query.eq('match_status', matchStatus)
  if (datumVon) query = query.gte('datum', datumVon)
  if (datumBis) query = query.lte('datum', datumBis)
  if (nurOffen) query = query.in('match_status', ['offen', 'vorgeschlagen'])

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    page_size: pageSize,
  })
}
