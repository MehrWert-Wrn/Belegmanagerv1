import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const belegSchema = z.object({
  storage_path: z.string(),
  original_filename: z.string(),
  dateityp: z.enum(['pdf', 'jpg', 'jpeg', 'png']),
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  bruttobetrag: z.number().nullable().optional(),
  nettobetrag: z.number().nullable().optional(),
  mwst_satz: z.number().nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

// GET /api/belege – Liste aller Belege (mit optionalen Filtern)
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lieferant = searchParams.get('lieferant')
  const status = searchParams.get('status')
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')
  const betragVon = searchParams.get('betrag_von')
  const betragBis = searchParams.get('betrag_bis')

  let query = supabase
    .from('belege')
    .select('*')
    .order('erstellt_am', { ascending: false })

  if (lieferant) query = query.ilike('lieferant', `%${lieferant}%`)
  if (status) query = query.eq('zuordnungsstatus', status)
  if (datumVon) query = query.gte('rechnungsdatum', datumVon)
  if (datumBis) query = query.lte('rechnungsdatum', datumBis)
  if (betragVon) query = query.gte('bruttobetrag', parseFloat(betragVon))
  if (betragBis) query = query.lte('bruttobetrag', parseFloat(betragBis))

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/belege – Beleg-Metadaten nach Upload speichern
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = belegSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // mandant_id ermitteln
  const { data: mandant } = await supabase
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const { data, error } = await supabase
    .from('belege')
    .insert({ ...parsed.data, mandant_id: mandant.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
