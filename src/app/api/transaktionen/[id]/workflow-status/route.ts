import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const workflowStatusSchema = z.object({
  workflow_status: z.enum(['normal', 'rueckfrage', 'erledigt'], {
    error: 'Ungueltiger Workflow-Status. Erlaubt: normal, rueckfrage, erledigt',
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
    .select('id, mandant_id')
    .eq('id', id)
    .single()

  if (!transaktion) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })
  }

  // Update workflow status
  const { data: updated, error } = await supabase
    .from('transaktionen')
    .update({ workflow_status: parsed.data.workflow_status })
    .eq('id', id)
    .select('id, workflow_status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: updated })
}
