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
      anzahl_importiert,
      anzahl_duplikate,
      anzahl_fehler,
      zahlungsquellen ( name, typ )
    `)
    .order('importiert_am', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
