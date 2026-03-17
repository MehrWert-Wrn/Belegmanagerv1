import { createClient } from '@/lib/supabase/server'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  anfangssaldo: z.number(),
})

// PATCH /api/kassabuch/anfangssaldo – Anfangssaldo setzen/ändern
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const kasse = await getOrCreateKasseQuelle(supabase, mandant.id)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle nicht gefunden' }, { status: 500 })

  const { error } = await supabase
    .from('zahlungsquellen')
    .update({
      anfangssaldo: parsed.data.anfangssaldo,
      anfangssaldo_gesetzt_am: new Date().toISOString(),
    })
    .eq('id', kasse.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, anfangssaldo: parsed.data.anfangssaldo })
}
