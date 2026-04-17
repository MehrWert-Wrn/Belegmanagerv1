import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateKuerzel, type ZahlungsquellenTyp } from '@/lib/ear-buchungsnummern'

const ibanSchema = z
  .string()
  .optional()
  .transform((v) => v?.replace(/\s+/g, '').toUpperCase() || undefined)
  .refine(
    (v) => !v || /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(v),
    { message: 'Ungültiges IBAN-Format' }
  )

const schema = z.object({
  name: z.string().min(1),
  typ: z.enum(['kontoauszug', 'kassa', 'kreditkarte', 'paypal', 'sonstige']),
  iban: ibanSchema,
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

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Rate limit: max 5 new sources per mandant per minute
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { count: recentCount } = await supabase
    .from('zahlungsquellen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .gte('erstellt_am', oneMinuteAgo)

  if ((recentCount ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warte eine Minute.' },
      { status: 429 }
    )
  }

  // Server-side limit: max 10 active sources
  const { count } = await supabase
    .from('zahlungsquellen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .eq('aktiv', true)

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: 'Maximale Anzahl aktiver Zahlungsquellen (10) erreicht.' },
      { status: 400 }
    )
  }

  // PROJ-25: Auto-generate kuerzel for new zahlungsquelle
  const kuerzel = await generateKuerzel(supabase, mandantId, parsed.data.typ as ZahlungsquellenTyp)

  const { data, error } = await supabase
    .from('zahlungsquellen')
    .insert({ ...parsed.data, mandant_id: mandantId, kuerzel })
    .select().single()

  if (error) {
    // BUG-PROJ25-004: Handle race condition where two concurrent requests generate the same kuerzel
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Kuerzel-Konflikt. Bitte erneut versuchen.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
