import { createClient } from '@/lib/supabase/server'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  quelle_id: z.string().uuid().optional(), // optional: nur eine Quelle matchen
})

// POST /api/matching/run – Matching für alle offenen Transaktionen des Mandanten
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { quelle_id } = schema.parse(body)

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  try {
    const stats = await executeMatching(supabase, mandant.id, quelle_id)
    return NextResponse.json({
      ...stats,
      match_quote: stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Matching fehlgeschlagen'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
