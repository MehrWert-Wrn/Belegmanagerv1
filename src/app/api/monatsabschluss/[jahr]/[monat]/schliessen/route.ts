import { createClient } from '@/lib/supabase/server'
import { requireAuth, requireAdmin, getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  // Bei > 10 offenen Positionen muss explizit bestätigt werden
  force: z.boolean().default(false),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// POST /api/monatsabschluss/[jahr]/[monat]/schliessen
export async function POST(request: Request, { params }: Params) {
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

  const body = await request.json().catch(() => ({}))
  const { force } = schema.parse(body)

  const mandant_id = await getMandantId(supabase)
  if (!mandant_id) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Bereits abgeschlossen?
  const { data: existing } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandant_id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  if (existing?.status === 'abgeschlossen') {
    return NextResponse.json({ error: 'Monat ist bereits abgeschlossen' }, { status: 409 })
  }

  // Offene Transaktionen prüfen
  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  const { data: offene } = await supabase
    .from('transaktionen')
    .select('id')
    .eq('mandant_id', mandant_id)
    .eq('match_status', 'offen')
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)

  const anzahlOffen = offene?.length ?? 0

  // Schutz: Bei > 10 offenen Positionen muss force=true gesetzt sein
  if (anzahlOffen > 10 && !force) {
    return NextResponse.json({
      error: 'double_confirm_required',
      anzahl_offen: anzahlOffen,
      message: `${anzahlOffen} Transaktionen sind noch offen. Bitte bestätige den Abschluss explizit.`,
    }, { status: 422 })
  }

  // Monatsabschluss anlegen oder aktualisieren (UPSERT)
  const { error } = await supabase
    .from('monatsabschluesse')
    .upsert({
      mandant_id,
      jahr,
      monat,
      status: 'abgeschlossen',
      abgeschlossen_am: new Date().toISOString(),
      abgeschlossen_von: user.id,
    }, { onConflict: 'mandant_id,jahr,monat' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    anzahl_offen: anzahlOffen,
    abgeschlossen_am: new Date().toISOString(),
  })
}
