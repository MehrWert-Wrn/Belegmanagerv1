import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

// GET /api/belege/check-hash?hash=<sha256>&filename=<original_filename>
// Returns existing beleg info if this file_hash (or filename as fallback) already exists for the mandant.
// The filename fallback catches belege imported by n8n which have no file_hash stored.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const hash = searchParams.get('hash')
  const filename = searchParams.get('filename')

  if (!hash || hash.length !== 64) {
    return NextResponse.json({ error: 'Ungültiger Hash' }, { status: 400 })
  }

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  // Primary check: exact hash match
  const { data: hashMatch, error: hashError } = await supabase
    .from('belege')
    .select('id, original_filename, lieferant, bruttobetrag, rechnungsdatum, rechnungsname')
    .eq('mandant_id', mandantId)
    .eq('file_hash', hash)
    .is('geloescht_am', null)
    .limit(1)
    .maybeSingle()

  if (hashError) return NextResponse.json({ error: hashError.message }, { status: 500 })
  if (hashMatch) return NextResponse.json({ duplicate: hashMatch })

  // Fallback check: same original_filename + has bruttobetrag + rechnungsdatum stored
  // (catches n8n imports without file_hash; requires metadata to avoid false positives
  // from generic filenames like "Rechnung.pdf")
  if (filename) {
    const { data: nameMatch, error: nameError } = await supabase
      .from('belege')
      .select('id, original_filename, lieferant, bruttobetrag, rechnungsdatum, rechnungsname')
      .eq('mandant_id', mandantId)
      .eq('original_filename', filename)
      .is('file_hash', null)
      .is('geloescht_am', null)
      .not('bruttobetrag', 'is', null)
      .not('rechnungsdatum', 'is', null)
      .limit(1)
      .maybeSingle()

    if (nameError) return NextResponse.json({ error: nameError.message }, { status: 500 })
    if (nameMatch) return NextResponse.json({ duplicate: nameMatch })
  }

  return NextResponse.json({ duplicate: null })
}
