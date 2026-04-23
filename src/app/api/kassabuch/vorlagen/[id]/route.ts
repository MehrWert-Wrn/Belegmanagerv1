/**
 * PATCH  /api/kassabuch/vorlagen/[id] – Vorlage bearbeiten
 * DELETE /api/kassabuch/vorlagen/[id] – Vorlage löschen (FK SET NULL auf transaktionen.kassa_vorlage_id)
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const BUCHUNGSTYPEN = ['EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME'] as const

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  kassa_buchungstyp: z.enum(BUCHUNGSTYPEN).optional(),
  betrag: z.number().nullable().optional(),
  beschreibung: z.string().trim().max(500).nullable().optional(),
  kategorie_id: z.string().uuid().nullable().optional(),
})

export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { id } = await params

  const body = await request.json().catch(() => ({}))
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data, error } = await supabase
    .from('kassa_vorlagen')
    .update(parsed.data)
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { id } = await params

  // FK ON DELETE SET NULL auf transaktionen.kassa_vorlage_id – DB übernimmt Cleanup
  const { error } = await supabase
    .from('kassa_vorlagen')
    .delete()
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
