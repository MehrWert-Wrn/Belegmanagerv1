import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  rechnungstyp: z.enum([
    'eingangsrechnung',
    'ausgangsrechnung',
    'gutschrift',
    'sonstiges',
    'eigenbeleg',
    'eigenverbrauch',
    'tageslosung',
  ]),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ids, rechnungstyp } = parsed.data

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant zugeordnet' }, { status: 404 })

  const { data, error } = await supabase
    .from('belege')
    .update({ rechnungstyp })
    .in('id', ids)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)
    .select('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ updated: data?.length ?? 0 })
}
