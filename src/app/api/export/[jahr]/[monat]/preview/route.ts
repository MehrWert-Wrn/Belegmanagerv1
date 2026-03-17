import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ jahr: string; monat: string }> }

// GET /api/export/[jahr]/[monat]/preview – Vorschau vor Download
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const jahr = parseInt(jahrStr)
  const monat = parseInt(monatStr)

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Monat muss abgeschlossen sein
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (abschluss?.status !== 'abgeschlossen') {
    return NextResponse.json({ error: 'Monat ist nicht abgeschlossen' }, { status: 403 })
  }

  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  const { data: transaktionen } = await supabase
    .from('transaktionen')
    .select('id, match_status, beleg_id')
    .eq('mandant_id', mandant.id)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)

  const total = transaktionen?.length ?? 0
  const ohne_beleg = (transaktionen ?? []).filter(t => !t.beleg_id).length
  const mit_beleg = total - ohne_beleg

  // Letzte Exporte
  const { data: letzteExporte } = await supabase
    .from('export_protokolle')
    .select('exportiert_am, export_typ')
    .eq('mandant_id', mandant.id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .order('exportiert_am', { ascending: false })
    .limit(3)

  return NextResponse.json({
    anzahl_transaktionen: total,
    anzahl_mit_beleg: mit_beleg,
    anzahl_ohne_beleg: ohne_beleg,
    letzte_exporte: letzteExporte ?? [],
  })
}
