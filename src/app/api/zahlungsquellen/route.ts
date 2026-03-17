import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1),
  typ: z.enum(['kontoauszug', 'kassa', 'kreditkarte', 'paypal', 'sonstige']),
  iban: z.string().optional(),
  csv_mapping: z.record(z.string(), z.unknown()).optional(),
})

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const alle = searchParams.get('alle') === 'true'

  let query = supabase
    .from('zahlungsquellen')
    .select('*')
    .order('erstellt_am', { ascending: true })

  if (!alle) {
    query = query.eq('aktiv', true)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enrich with has_transactions flag
  const enriched = await Promise.all(
    (data ?? []).map(async (quelle) => {
      const { count } = await supabase
        .from('transaktionen')
        .select('id', { count: 'exact', head: true })
        .eq('quelle_id', quelle.id)
      return { ...quelle, has_transactions: (count ?? 0) > 0 }
    })
  )

  return NextResponse.json(enriched)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data, error } = await supabase
    .from('zahlungsquellen')
    .insert({ ...parsed.data, mandant_id: mandant.id })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
