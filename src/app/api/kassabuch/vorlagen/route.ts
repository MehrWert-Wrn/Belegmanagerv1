/**
 * GET  /api/kassabuch/vorlagen  – Liste aller Vorlagen (max 50)
 * POST /api/kassabuch/vorlagen  – Neue Vorlage (max 50 pro Mandant)
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BUCHUNGSTYPEN = ['EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME'] as const

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich').max(100),
  kassa_buchungstyp: z.enum(BUCHUNGSTYPEN),
  betrag: z.number().nullable().optional(),
  beschreibung: z.string().trim().max(500).nullable().optional(),
  kategorie_id: z.string().uuid().nullable().optional(),
})

const MAX_VORLAGEN = 50

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data, error } = await supabase
    .from('kassa_vorlagen')
    .select(`
      id, name, kassa_buchungstyp, betrag, beschreibung, kategorie_id, erstellt_am,
      kassa_kategorien ( name )
    `)
    .eq('mandant_id', mandantId)
    .order('erstellt_am', { ascending: false })
    .limit(MAX_VORLAGEN)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type Row = (NonNullable<typeof data>)[number] & {
    kassa_kategorien: { name: string } | null | { name: string }[]
  }

  const vorlagen = (data ?? []).map(v => {
    const row = v as Row
    const kat = Array.isArray(row.kassa_kategorien)
      ? row.kassa_kategorien[0]
      : row.kassa_kategorien
    return {
      id: row.id,
      name: row.name,
      kassa_buchungstyp: row.kassa_buchungstyp,
      betrag: row.betrag !== null ? Number(row.betrag) : null,
      beschreibung: row.beschreibung,
      kategorie_id: row.kategorie_id,
      kategorie_name: kat?.name ?? null,
      erstellt_am: row.erstellt_am,
    }
  })

  return NextResponse.json({ vorlagen })
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
    .from('kassa_vorlagen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
  if ((count ?? 0) >= MAX_VORLAGEN) {
    return NextResponse.json(
      { error: `Maximum ${MAX_VORLAGEN} Vorlagen erreicht. Bitte löschen Sie eine bestehende Vorlage.` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('kassa_vorlagen')
    .insert({
      mandant_id: mandantId,
      name: parsed.data.name,
      kassa_buchungstyp: parsed.data.kassa_buchungstyp,
      betrag: parsed.data.betrag ?? null,
      beschreibung: parsed.data.beschreibung ?? null,
      kategorie_id: parsed.data.kategorie_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
