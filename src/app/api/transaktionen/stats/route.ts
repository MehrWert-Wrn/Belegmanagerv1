import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transaktionen/stats – match_status counts for OPEN months only (geschlossene Monate ausgeschlossen)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load all abgeschlossene months (RLS scopes to current mandant automatically)
  const { data: geschlosseneMonate } = await supabase
    .from('monatsabschluesse')
    .select('jahr, monat')
    .eq('status', 'abgeschlossen')

  const base = () => {
    let query = supabase
      .from('transaktionen')
      .select('*', { count: 'exact', head: true })
      .is('geloescht_am', null)

    // Exclude each closed month via date range filter:
    // keep datum < first-of-month OR datum > last-of-month (i.e. skip the month entirely)
    for (const { jahr, monat } of (geschlosseneMonate ?? [])) {
      const start = `${jahr}-${String(monat).padStart(2, '0')}-01`
      const daysInMonth = new Date(jahr, monat, 0).getDate() // monat is 1-indexed: day 0 of next JS-month = last day
      const end = `${jahr}-${String(monat).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
      query = query.or(`datum.lt.${start},datum.gt.${end}`)
    }

    return query
  }

  const [bestaetigt, vorgeschlagen, offen, keinBeleg] = await Promise.all([
    base().eq('match_status', 'bestaetigt'),
    base().eq('match_status', 'vorgeschlagen'),
    base().eq('match_status', 'offen'),
    base().eq('match_status', 'kein_beleg'),
  ])

  const total =
    (bestaetigt.count ?? 0) +
    (vorgeschlagen.count ?? 0) +
    (offen.count ?? 0) +
    (keinBeleg.count ?? 0)

  return NextResponse.json({
    total,
    bestaetigt: bestaetigt.count ?? 0,
    vorgeschlagen: vorgeschlagen.count ?? 0,
    offen: offen.count ?? 0,
    kein_beleg: keinBeleg.count ?? 0,
  })
}
