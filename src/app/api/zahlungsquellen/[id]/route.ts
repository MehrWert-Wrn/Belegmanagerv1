import { createClient } from '@/lib/supabase/server'
import { requireAdmin, getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const ibanSchema = z
  .string()
  .optional()
  .transform((v) => v?.replace(/\s+/g, '').toUpperCase() || undefined)
  .refine(
    (v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(v),
    { message: 'Ungültiges IBAN-Format' }
  )

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  iban: ibanSchema,
  csv_mapping: z.record(z.string(), z.unknown()).optional(),
  aktiv: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { id } = await params
  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // If activating, enforce the 10-source limit
  if (parsed.data.aktiv === true) {
    const mandantId = await getMandantId(supabase)
    if (mandantId) {
      const { count } = await supabase
        .from('zahlungsquellen')
        .select('id', { count: 'exact', head: true })
        .eq('mandant_id', mandantId)
        .eq('aktiv', true)
        .neq('id', id)

      if ((count ?? 0) >= 10) {
        return NextResponse.json(
          { error: 'Maximale Anzahl aktiver Zahlungsquellen (10) erreicht.' },
          { status: 400 }
        )
      }
    }
  }

  const { data, error } = await supabase
    .from('zahlungsquellen')
    .update(parsed.data)
    .eq('id', id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { id } = await params

  // Check if source has transactions
  const { count } = await supabase
    .from('transaktionen')
    .select('id', { count: 'exact', head: true })
    .eq('quelle_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'Quelle hat Transaktionen und kann nicht gelöscht werden' },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('zahlungsquellen')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
