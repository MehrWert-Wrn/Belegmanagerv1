/**
 * POST /api/kassabuch/archiv/generieren
 * Body: { monat: 'YYYY-MM' }
 *
 * Generiert Archiv-PDF für einen abgeschlossenen Monat (BUG-PROJ7-31: prüft Abschluss-Status).
 * Idempotent: wenn bereits archiviert, wird NICHT neu generiert.
 * gesperrtAm = abgeschlossen_am aus monatsabschluesse (BUG-PROJ7-30).
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { generiereKassabuchArchiv } from '@/lib/kassabuch-archiv'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  monat: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Format YYYY-MM erforderlich'),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { monat } = parsed.data
  const [jahrStr, monatStr] = monat.split('-')
  const jahr = parseInt(jahrStr)
  const monatNr = parseInt(monatStr)

  // BUG-PROJ7-31: Nur abgeschlossene Monate dürfen archiviert werden
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('status, abgeschlossen_am')
    .eq('mandant_id', mandantId)
    .eq('jahr', jahr)
    .eq('monat', monatNr)
    .maybeSingle()

  if (abschluss?.status !== 'abgeschlossen') {
    return NextResponse.json(
      { error: 'Monat ist nicht abgeschlossen. Archivierung nur für abgeschlossene Monate möglich.' },
      { status: 403 }
    )
  }

  // BUG-PROJ7-30: Echter Abschluss-Zeitpunkt aus monatsabschluesse
  const gesperrtAm = abschluss.abgeschlossen_am
    ? new Date(abschluss.abgeschlossen_am)
    : new Date()

  const result = await generiereKassabuchArchiv(supabase, mandantId, monat, user.id, gesperrtAm)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, already_archived: result.already_archived ?? false, storage_path: result.storage_path },
    { status: result.already_archived ? 200 : 201 }
  )
}
