import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const paramsSchema = z.object({
  jahr: z.coerce.number().int().min(2000).max(2100),
  monat: z.coerce.number().int().min(1).max(12),
})

type Params = { params: Promise<{ jahr: string; monat: string }> }

// GET /api/export/[jahr]/[monat]/preview – Vorschau vor Download
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const parsed = paramsSchema.safeParse({ jahr: jahrStr, monat: monatStr })
  if (!parsed.success) return NextResponse.json({ error: 'Ungueltige Parameter' }, { status: 400 })
  const { jahr, monat } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })
  const mandant = { id: mandantId }

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
