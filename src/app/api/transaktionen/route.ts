import { getEffectiveSupabase } from '@/lib/admin-context'
import { NextResponse } from 'next/server'

// GET /api/transaktionen – Liste mit Filtern
// Query params: quelle_id, match_status, datum_von, datum_bis, nur_offen
export async function GET(request: Request) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId } = ctx

  const { searchParams } = new URL(request.url)
  const quelleId = searchParams.get('quelle_id')
  const matchStatus = searchParams.get('match_status')
  const workflowStatus = searchParams.get('workflow_status')
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')
  const nurOffen = searchParams.get('nur_offen') === 'true'
  const search = searchParams.get('search')?.trim() ?? ''
  const page = parseInt(searchParams.get('page') ?? '1')
  const pageSize = Math.min(parseInt(searchParams.get('page_size') ?? '500'), 500)
  const offset = (page - 1) * pageSize

  let query = supabase
    .from('transaktionen')
    .select(`
      id, datum, betrag, beschreibung, match_status, match_score, match_type,
      workflow_status, quelle_id, beleg_id,
      belege ( lieferant, rechnungsnummer, bruttobetrag ),
      zahlungsquellen ( name, typ )
    `, { count: 'exact' })
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)
    .order('datum', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (quelleId) query = query.eq('quelle_id', quelleId)
  if (matchStatus) query = query.eq('match_status', matchStatus)
  if (datumVon) query = query.gte('datum', datumVon)
  if (datumBis) query = query.lte('datum', datumBis)
  if (nurOffen) query = query.in('match_status', ['offen', 'vorgeschlagen'])
  if (workflowStatus) query = query.eq('workflow_status', workflowStatus)
  if (search) {
    // BUG-PROJ5-R4-001: Wildcards escapen + search across beschreibung, buchungsreferenz, iban_gegenseite
    const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
    const pattern = `%${escaped}%`
    query = query.or(`beschreibung.ilike.${pattern},buchungsreferenz.ilike.${pattern},iban_gegenseite.ilike.${pattern}`)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    page_size: pageSize,
  })
}

// DELETE /api/transaktionen – Bulk-Soft-Delete (setzt geloescht_am)
export async function DELETE(request: Request) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId } = ctx

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids : []
  if (ids.length === 0) return NextResponse.json({ error: 'Keine IDs angegeben' }, { status: 400 })

  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { error } = await supabase
    .from('transaktionen')
    .update({ geloescht_am: new Date().toISOString() })
    .in('id', ids)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ geloescht: ids.length })
}
