import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/transaktionen/import/history – Import-Historie
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('import_protokolle')
    .select(`
      id,
      dateiname,
      importiert_am,
      importiert_von,
      anzahl_importiert,
      anzahl_duplikate,
      anzahl_fehler,
      zahlungsquellen ( name, typ )
    `)
    .order('importiert_am', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json([])

  // Resolve user names from mandant_users
  const userIds = [...new Set(data.map(r => r.importiert_von).filter(Boolean))]
  const { data: users } = await supabase
    .from('mandant_users')
    .select('user_id, name, email')
    .in('user_id', userIds)

  const userMap = Object.fromEntries(
    (users ?? []).map(u => [u.user_id, u.name || u.email || null])
  )

  return NextResponse.json(
    data.map(r => ({
      ...r,
      importiert_von_name: userMap[r.importiert_von] ?? null,
    }))
  )
}
