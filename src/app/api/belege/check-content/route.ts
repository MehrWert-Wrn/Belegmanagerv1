import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rechnungsnummer = searchParams.get('rechnungsnummer')?.trim() || ''
  const lieferant = searchParams.get('lieferant')?.trim() || ''
  const bruttobetragRaw = searchParams.get('bruttobetrag')?.trim() || ''
  const rechnungsdatum = searchParams.get('rechnungsdatum')?.trim() || ''

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const SELECT = 'id, original_filename, lieferant, bruttobetrag, rechnungsdatum, rechnungsname'

  if (rechnungsnummer && lieferant) {
    const escaped = lieferant.replace(/[\\%_]/g, (m) => `\\${m}`)
    const { data, error } = await supabase
      .from('belege')
      .select(SELECT)
      .eq('mandant_id', mandantId)
      .eq('rechnungsnummer', rechnungsnummer)
      .ilike('lieferant', escaped)
      .is('geloescht_am', null)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ duplicate: data ?? null })
  }

  const bruttobetrag = bruttobetragRaw ? Number(bruttobetragRaw) : null
  if (
    bruttobetrag !== null &&
    !isNaN(bruttobetrag) &&
    rechnungsdatum &&
    lieferant
  ) {
    const escaped = lieferant.replace(/[\\%_]/g, (m) => `\\${m}`)
    const { data, error } = await supabase
      .from('belege')
      .select(SELECT)
      .eq('mandant_id', mandantId)
      .eq('bruttobetrag', bruttobetrag)
      .eq('rechnungsdatum', rechnungsdatum)
      .ilike('lieferant', escaped)
      .is('geloescht_am', null)
      .limit(1)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ duplicate: data ?? null })
  }

  return NextResponse.json({ duplicate: null })
}
