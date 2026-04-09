import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMandantId } from '@/lib/auth-helpers'

const messageSchema = z.object({
  message: z.string().min(1).max(5000),
})

// POST /api/tickets/[id]/messages – Mandant replies to ticket
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const { id: ticketId } = await params

  const body = await request.json()
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Verify ticket belongs to this mandant (RLS enforced)
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id, status')
    .eq('id', ticketId)
    .eq('mandant_id', mandantId)
    .single()

  if (ticketError || !ticket) {
    return NextResponse.json({ error: 'Ticket nicht gefunden' }, { status: 404 })
  }

  const adminClient = createAdminClient()

  // Insert message
  const { data: message, error: insertError } = await adminClient
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: 'mandant',
      sender_id: user.id,
      message: parsed.data.message,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // If ticket is closed, automatically reopen it
  if (ticket.status === 'closed') {
    await adminClient
      .from('support_tickets')
      .update({ status: 'open' })
      .eq('id', ticketId)
  }

  return NextResponse.json(message, { status: 201 })
}
