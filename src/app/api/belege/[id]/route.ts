import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  bruttobetrag: z.number().nullable().optional(),
  nettobetrag: z.number().nullable().optional(),
  mwst_satz: z.number().nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

// PATCH /api/belege/[id] – Metadaten aktualisieren
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('belege')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/belege/[id] – Soft Delete + Storage entfernen
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Zuerst storage_path holen
  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('storage_path, zuordnungsstatus')
    .eq('id', id)
    .single()

  if (fetchError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  // Datei aus Storage entfernen
  const { error: storageError } = await supabase.storage
    .from('belege')
    .remove([beleg.storage_path])

  if (storageError) {
    return NextResponse.json({ error: 'Fehler beim Löschen der Datei' }, { status: 500 })
  }

  // Soft Delete in DB
  const { error } = await supabase
    .from('belege')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    was_zugeordnet: beleg.zuordnungsstatus === 'zugeordnet',
  })
}
