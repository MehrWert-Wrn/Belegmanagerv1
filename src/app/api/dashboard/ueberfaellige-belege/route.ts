import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'

export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('belege')
    .select('id, lieferant, rechnungsnummer, bruttobetrag, faelligkeitsdatum, rechnungstyp, zuordnungsstatus')
    .eq('mandant_id', ctx.mandantId)
    .is('geloescht_am', null)
    .not('faelligkeitsdatum', 'is', null)
    .lt('faelligkeitsdatum', today)
    .eq('faelligkeit_bezahlt', false)
    .neq('zuordnungsstatus', 'zugeordnet')
    .order('faelligkeitsdatum', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })

  return NextResponse.json({ belege: data ?? [] })
}
