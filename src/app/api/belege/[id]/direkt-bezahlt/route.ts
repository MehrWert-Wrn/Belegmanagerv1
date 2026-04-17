import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const direktBezahltSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ungültiges Datumsformat (YYYY-MM-DD)'),
  zahlungsart: z.enum(['Bar', 'Bankomat (privat)', 'Kreditkarte (privat)', 'Sonstige']),
  notiz: z.string().max(100, 'Notiz darf maximal 100 Zeichen lang sein').optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const { id } = await params

  // Validate request body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = direktBezahltSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { datum, zahlungsart, notiz } = parsed.data

  // Get mandant_id
  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant zugeordnet' }, { status: 404 })
  }

  // Load beleg – must belong to mandant (RLS enforces this), not deleted, status offen
  const { data: beleg, error: belegError } = await supabase
    .from('belege')
    .select('id, bruttobetrag, zuordnungsstatus, mandant_id')
    .eq('id', id)
    .is('geloescht_am', null)
    .single()

  if (belegError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  if (beleg.zuordnungsstatus !== 'offen') {
    return NextResponse.json(
      { error: 'Beleg ist bereits zugeordnet' },
      { status: 400 }
    )
  }

  // Monat-Lock check on the target datum
  const gesperrt = await isMonatGesperrt(supabase, mandantId, datum)
  if (gesperrt) {
    return NextResponse.json(
      { error: 'Der Monat ist abgeschlossen. Keine Änderungen möglich.' },
      { status: 403 }
    )
  }

  // Find-or-create the DIR system Zahlungsquelle for this mandant
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
      // Handle race condition: another request created it simultaneously
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

  // Build beschreibung
  let beschreibung = `Direkt bezahlt – ${zahlungsart}`
  if (notiz) {
    beschreibung += ` – ${notiz}`
  }

  // Create Transaktion
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
    return NextResponse.json({ error: txError.message }, { status: 500 })
  }

  // Update Beleg: mark as zugeordnet
  const { data: updatedBeleg, error: updateError } = await supabase
    .from('belege')
    .update({ zuordnungsstatus: 'zugeordnet' })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updatedBeleg)
}
