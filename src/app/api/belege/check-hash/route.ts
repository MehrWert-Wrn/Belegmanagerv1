import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

// GET /api/belege/check-hash?hash=<sha256>
// Returns existing beleg info if this file_hash already exists for the mandant
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const hash = searchParams.get('hash')
  if (!hash || hash.length !== 64) {
    return NextResponse.json({ error: 'Ungültiger Hash' }, { status: 400 })
  }

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const { data, error } = await supabase
    .from('belege')
    .select('id, original_filename, lieferant, bruttobetrag, rechnungsdatum, rechnungsname')
    .eq('mandant_id', mandantId)
    .eq('file_hash', hash)
    .is('geloescht_am', null)
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ duplicate: data ?? null })
}
