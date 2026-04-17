import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const workflowStatusSchema = z.object({
  workflow_status: z.enum(['normal', 'rueckfrage', 'erledigt', 'privat'], {
    error: 'Ungueltiger Workflow-Status. Erlaubt: normal, rueckfrage, erledigt, privat',
  }),
})

// PATCH /api/transaktionen/[id]/workflow-status – Workflow-Status aendern
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
  }

  const parsed = workflowStatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler' },
      { status: 400 }
    )
  }

  // Verify transaction exists (RLS scoped)
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('id, mandant_id, match_status, beleg_id, datum')
    .eq('id', id)
    .single()

  if (!transaktion) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })
  }

  // BUG-PROJ25-005: Block changes in abgeschlossenen Monaten
  const mandantIdForLock = await getMandantId(supabase)
  if (mandantIdForLock) {
    const gesperrt = await isMonatGesperrt(supabase, mandantIdForLock, transaktion.datum)
    if (gesperrt) {
      return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
    }
  }

  const newStatus = parsed.data.workflow_status

  // PROJ-25: If setting to 'privat', check that mandant is EAR
  if (newStatus === 'privat') {
    const mandantId = await getMandantId(supabase)
    if (!mandantId) {
      return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })
    }

    const { data: mandant } = await supabase
      .from('mandanten')
      .select('buchfuehrungsart')
      .eq('id', mandantId)
      .single()

    if (!mandant || mandant.buchfuehrungsart !== 'EAR') {
      return NextResponse.json(
        { error: 'Privat-Status ist nur fuer EAR-Mandanten verfuegbar' },
        { status: 400 }
      )
    }
  }

  // Build update payload
  const updatePayload: Record<string, unknown> = {
    workflow_status: newStatus,
  }

  // PROJ-25: If setting to 'privat' and match exists, auto-unlink
  if (newStatus === 'privat' && (transaktion.match_status === 'bestaetigt' || transaktion.match_status === 'vorgeschlagen')) {
    const belegIdToUnlink = transaktion.beleg_id

    // Clear match fields on transaktion
    updatePayload.beleg_id = null
    updatePayload.match_status = 'offen'
    updatePayload.match_score = 0
    updatePayload.match_type = null
    updatePayload.match_bestaetigt_am = null
    updatePayload.match_bestaetigt_von = null

    // Reset beleg zuordnungsstatus if there was a linked beleg
    if (belegIdToUnlink) {
      await supabase
        .from('belege')
        .update({ zuordnungsstatus: 'offen' })
        .eq('id', belegIdToUnlink)
    }
  }

  // Update workflow status (and possibly match fields)
  const { data: updated, error } = await supabase
    .from('transaktionen')
    .update(updatePayload)
    .eq('id', id)
    .select('id, workflow_status, match_status, beleg_id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
