import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transaktionen/stats – Aggregate match_status counts (full dataset, no pagination)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const base = () =>
    supabase
      .from('transaktionen')
      .select('*', { count: 'exact', head: true })
      .is('geloescht_am', null)

  const [bestaetigt, vorgeschlagen, offen] = await Promise.all([
    base().eq('match_status', 'bestaetigt'),
    base().eq('match_status', 'vorgeschlagen'),
    base().eq('match_status', 'offen'),
  ])

  const total =
    (bestaetigt.count ?? 0) + (vorgeschlagen.count ?? 0) + (offen.count ?? 0)

  return NextResponse.json({
    total,
    bestaetigt: bestaetigt.count ?? 0,
    vorgeschlagen: vorgeschlagen.count ?? 0,
    offen: offen.count ?? 0,
  })
}
