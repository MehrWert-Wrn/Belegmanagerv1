/**
 * GET  /api/kassabuch/kategorien  – Liste Kategorien (max 100)
 * POST /api/kassabuch/kategorien  – Neue Kategorie (max 100 pro Mandant)
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const FARB_PALETTE = [
  '#6B7280', // gray-500
  '#EF4444', // red-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#14B8A6', // teal-500
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
] as const

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich').max(50),
  farbe: z.enum(FARB_PALETTE as unknown as [string, ...string[]], {
    message: 'Ungültige Farbe – nur Palette-Farben erlaubt.',
  }).default('#6B7280'),
  kontonummer: z.string().trim().max(20).nullable().optional(),
})

const MAX_KATEGORIEN = 100

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data, error } = await supabase
    .from('kassa_kategorien')
    .select('id, name, farbe, kontonummer, ist_standard, erstellt_am')
    .eq('mandant_id', mandantId)
    .order('ist_standard', { ascending: false })
    .order('name', { ascending: true })
    .limit(MAX_KATEGORIEN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ kategorien: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  // Limit-Check
  const { count, error: countErr } = await supabase
    .from('kassa_kategorien')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
  if ((count ?? 0) >= MAX_KATEGORIEN) {
    return NextResponse.json(
      { error: `Maximum ${MAX_KATEGORIEN} Kategorien erreicht.` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('kassa_kategorien')
    .insert({
      mandant_id: mandantId,
      name: parsed.data.name,
      farbe: parsed.data.farbe,
      kontonummer: parsed.data.kontonummer ?? null,
      ist_standard: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
