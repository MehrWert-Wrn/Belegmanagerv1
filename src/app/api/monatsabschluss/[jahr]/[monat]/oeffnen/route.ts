import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/monatsabschluss/[jahr]/[monat]/oeffnen – Monat wiedereröffnen
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const jahr = parseInt(jahrStr)
  const monat = parseInt(monatStr)

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const mandant_id = mandant.id

  // Prüfen ob Monat überhaupt abgeschlossen ist
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status, datev_export_vorhanden')
    .eq('mandant_id', mandant_id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (!abschluss || abschluss.status !== 'abgeschlossen') {
    return NextResponse.json({ error: 'Monat ist nicht abgeschlossen' }, { status: 409 })
  }

  const { error } = await supabase
    .from('monatsabschluesse')
    .update({
      status: 'in_bearbeitung',
      wiedergeoeffnet_am: new Date().toISOString(),
      wiedergeoeffnet_von: user.id,
    })
    .eq('mandant_id', mandant_id)
    .eq('jahr', jahr)
    .eq('monat', monat)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    datev_export_warnung: abschluss.datev_export_vorhanden,
  })
}
