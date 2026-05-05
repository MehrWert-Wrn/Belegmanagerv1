import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat (YYYY-MM-DD)'),
  zahlungsart: z.enum(['Bar', 'Bankomat (privat)', 'Kreditkarte (privat)', 'Sonstige']),
  notiz: z.string().max(100).optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ids, datum, zahlungsart, notiz } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant zugeordnet' }, { status: 404 })

  const gesperrt = await isMonatGesperrt(supabase, mandantId, datum)
  if (gesperrt) {
    return NextResponse.json(
      { error: 'Der Monat ist abgeschlossen. Keine Änderungen möglich.' },
      { status: 403 }
    )
  }

  // Find-or-create DIR system Zahlungsquelle (once for the whole batch)
  let dirQuelleId: string

  const { data: existingDir } = await supabase
    .from('zahlungsquellen')
    .select('id')
    .eq('mandant_id', mandantId)
    .eq('is_system_quelle', true)
    .maybeSingle()

  if (existingDir) {
    dirQuelleId = existingDir.id
  } else {
    const { data: newDir, error: createError } = await supabase
      .from('zahlungsquellen')
      .insert({
        name: 'Direkt bezahlt',
        typ: 'sonstige',
        kuerzel: 'DIR',
        is_system_quelle: true,
        mandant_id: mandantId,
      })
      .select('id')
      .single()

    if (createError) {
      if (createError.code === '23505') {
        const { data: retryDir } = await supabase
          .from('zahlungsquellen')
          .select('id')
          .eq('mandant_id', mandantId)
          .eq('is_system_quelle', true)
          .single()
        if (!retryDir) {
          return NextResponse.json({ error: 'Systemquelle konnte nicht erstellt werden' }, { status: 500 })
        }
        dirQuelleId = retryDir.id
      } else {
        return NextResponse.json({ error: createError.message }, { status: 500 })
      }
    } else {
      dirQuelleId = newDir.id
    }
  }

  const { data: belege, error: fetchError } = await supabase
    .from('belege')
    .select('id, bruttobetrag, zuordnungsstatus')
    .in('id', ids)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  let beschreibung = `Direkt bezahlt – ${zahlungsart}`
  if (notiz) beschreibung += ` – ${notiz}`

  let succeeded = 0
  let skipped = 0
  const errors: { id: string; error: string }[] = []

  for (const beleg of belege ?? []) {
    if (beleg.zuordnungsstatus !== 'offen') {
      skipped++
      continue
    }

    const { error: txError } = await supabase
      .from('transaktionen')
      .insert({
        datum,
        betrag: -(beleg.bruttobetrag ?? 0),
        beschreibung,
        match_status: 'bestaetigt',
        beleg_id: beleg.id,
        workflow_status: 'normal',
        quelle_id: dirQuelleId,
        mandant_id: mandantId,
      })

    if (txError) {
      errors.push({ id: beleg.id, error: txError.message })
      continue
    }

    const { error: updateError } = await supabase
      .from('belege')
      .update({ zuordnungsstatus: 'zugeordnet' })
      .eq('id', beleg.id)

    if (updateError) {
      errors.push({ id: beleg.id, error: updateError.message })
    } else {
      succeeded++
    }
  }

  return NextResponse.json({ succeeded, skipped, errors })
}
