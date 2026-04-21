import { getEffectiveSupabase } from '@/lib/admin-context'
import { NextResponse } from 'next/server'

// GET /api/mandant – Gibt Mandant-Profil zurück (für Eigenbeleg-Vorausfüllung)
export async function GET() {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId } = ctx

  const { data: mandant, error } = await supabase
    .from('mandanten')
    .select('id, firmenname, strasse, plz, ort, land, uid_nummer, buchfuehrungsart')
    .eq('id', mandantId)
    .single()

  if (error || !mandant) {
    return NextResponse.json({ error: 'Mandant nicht gefunden' }, { status: 404 })
  }

  return NextResponse.json(mandant)
}
