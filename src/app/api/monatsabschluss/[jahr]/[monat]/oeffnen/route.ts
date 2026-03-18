import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/monatsabschluss/[jahr]/[monat]/oeffnen – Monat wiedereröffnen
export async function POST(_request: Request, { params }: Params) {
  const supabase = await createClient()

  const auth = await requireAuth(supabase)
  if (auth.error) return auth.error
  const user = auth.user!

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { jahr: jahrStr, monat: monatStr } = await params
  const jahr = parseInt(jahrStr)
  const monat = parseInt(monatStr)
  if (isNaN(jahr) || isNaN(monat) || monat < 1 || monat > 12 || jahr < 2000 || jahr > 2100) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }

  const mandant_id = await getMandantId(supabase)
  if (!mandant_id) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

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
