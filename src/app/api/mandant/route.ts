import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/mandant – Gibt Mandant-Profil zurück (für Eigenbeleg-Vorausfüllung)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: mandant, error } = await supabase
    .from('mandanten')
    .select('id, firmenname, strasse, plz, ort, land, uid_nummer, buchfuehrungsart')
    .single()

  if (error || !mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  return NextResponse.json(mandant)
}
