import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

type Params = { params: Promise<{ id: string }> }

const kommentarSchema = z.object({
  text: z
    .string()
    .min(1, 'Kommentar darf nicht leer sein')
    .max(500, 'Kommentar darf maximal 500 Zeichen lang sein'),
})

// GET /api/transaktionen/[id]/kommentare – Alle Kommentare einer Transaktion
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify transaction exists and belongs to user's mandant (RLS handles this)
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('id, mandant_id')
    .eq('id', id)
    .single()

  if (!transaktion) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })
  }

  // Fetch comments ordered by created_at ASC (oldest first)
  const { data: kommentare, error } = await supabase
    .from('transaktions_kommentare')
    .select('id, text, created_at, user_id')
    .eq('transaktion_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch user emails for all comment authors
  // Since we can't join auth.users directly from client, we resolve emails separately
  const userIds = [...new Set((kommentare ?? []).map((k) => k.user_id))]
  const emailMap: Record<string, string> = {}

  if (userIds.length > 0) {
    // Use admin API via RPC or fallback to known user
    // For the current user, we know the email
    emailMap[user.id] = user.email ?? 'Unbekannt'

    // For other users, we store emails via a simple approach:
    // Since we can't query auth.users from the client SDK, we'll use
    // the user_id and show a truncated version or "Benutzer"
    for (const uid of userIds) {
      if (!emailMap[uid]) {
        emailMap[uid] = 'Benutzer'
      }
    }
  }

  const result = (kommentare ?? []).map((k) => ({
    id: k.id,
    text: k.text,
    created_at: k.created_at,
    user_email: emailMap[k.user_id] ?? 'Unbekannt',
    is_own: k.user_id === user.id,
  }))

  return NextResponse.json({ data: result })
}

// POST /api/transaktionen/[id]/kommentare – Neuen Kommentar hinzufuegen
export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungueltiger Request-Body' }, { status: 400 })
  }

  const parsed = kommentarSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Validierungsfehler' },
      { status: 400 }
    )
  }

  // Verify transaction exists and get mandant_id (RLS scoped)
  const { data: transaktion } = await supabase
    .from('transaktionen')
    .select('id, mandant_id')
    .eq('id', id)
    .single()

  if (!transaktion) {
    return NextResponse.json({ error: 'Transaktion nicht gefunden' }, { status: 404 })
  }

  // Insert comment
  const { data: kommentar, error } = await supabase
    .from('transaktions_kommentare')
    .insert({
      transaktion_id: id,
      mandant_id: transaktion.mandant_id,
      user_id: user.id,
      text: parsed.data.text,
    })
    .select('id, text, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      data: {
        ...kommentar,
        user_email: user.email ?? 'Unbekannt',
        is_own: true,
      },
    },
    { status: 201 }
  )
}
