import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMandantId } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

const createTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  message: z.string().min(1).max(5000),
})

// GET /api/tickets – List own tickets (or count_only=true for badge count)
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const countOnly = searchParams.get('count_only') === 'true'

  if (countOnly) {
    const { count, error } = await supabase
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('mandant_id', mandantId)
      .in('status', ['open', 'in_progress'])
    if (error) return NextResponse.json({ open_count: 0 })
    return NextResponse.json({ open_count: count ?? 0 })
  }

  // RLS ensures mandant only sees own tickets
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, subject, status, created_at, updated_at')
    .eq('mandant_id', mandantId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/tickets – Create a new ticket
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  // Rate limit: 3 tickets per hour per mandant
  const rateCheck = checkRateLimit(`tickets:${mandantId}`, 3, 60 * 60 * 1000)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Zu viele Tickets erstellt. Bitte versuchen Sie es spaeter erneut.',
        retryAfterMs: rateCheck.retryAfterMs,
      },
      { status: 429 }
    )
  }

  const body = await request.json()
  const parsed = createTicketSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const adminClient = createAdminClient()

  // Create ticket (use admin client to set mandant_id reliably)
  const { data: ticket, error: ticketError } = await adminClient
    .from('support_tickets')
    .insert({
      mandant_id: mandantId,
      subject: parsed.data.subject,
      status: 'open',
    })
    .select()
    .single()

  if (ticketError || !ticket) {
    return NextResponse.json({ error: ticketError?.message || 'Fehler beim Erstellen' }, { status: 500 })
  }

  // Create first message
  const { error: msgError } = await adminClient
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticket.id,
      sender_type: 'mandant',
      sender_id: user.id,
      message: parsed.data.message,
    })

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  return NextResponse.json(ticket, { status: 201 })
}
