/**
 * PATCH  /api/kassabuch/kategorien/[id] – Kategorie bearbeiten
 * DELETE /api/kassabuch/kategorien/[id] – Kategorie löschen; 409 wenn aktive Buchungen referenzieren
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const FARB_PALETTE = [
  '#6B7280',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
] as const

const updateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  farbe: z.enum(FARB_PALETTE as unknown as [string, ...string[]], {
    message: 'Ungültige Farbe – nur Palette-Farben erlaubt.',
  }).optional(),
  kontonummer: z.string().trim().max(20).nullable().optional(),
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
    .from('kassa_kategorien')
    .update(parsed.data)
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Kategorie nicht gefunden' }, { status: 404 })
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

  // Prüfen ob aktive Buchungen referenzieren
  const { count: txCount, error: txErr } = await supabase
    .from('transaktionen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .eq('kategorie_id', id)
    .is('geloescht_am', null)

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })
  if ((txCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Diese Kategorie wird noch von ${txCount} Buchung(en) verwendet. Weisen Sie diesen Buchungen zuerst eine andere Kategorie zu.`,
      },
      { status: 409 }
    )
  }

  // Auch Vorlagen-Referenzen prüfen
  const { count: vorlagenCount } = await supabase
    .from('kassa_vorlagen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .eq('kategorie_id', id)

  if ((vorlagenCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `Diese Kategorie wird noch von ${vorlagenCount} Vorlage(n) verwendet. Bitte Vorlagen zuerst anpassen.`,
      },
      { status: 409 }
    )
  }

  const { error } = await supabase
    .from('kassa_kategorien')
    .delete()
    .eq('id', id)
    .eq('mandant_id', mandantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
