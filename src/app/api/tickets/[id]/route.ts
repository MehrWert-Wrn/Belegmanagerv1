import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'

// GET /api/tickets/[id] – Ticket detail with messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  const { id } = await params

  // RLS ensures mandant only sees own ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id, mandant_id, subject, status, assigned_to_admin_id, created_at, updated_at')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (ticketError || !ticket) {
    return NextResponse.json({ error: 'Ticket nicht gefunden' }, { status: 404 })
  }

  // Get messages (RLS enforced)
  const { data: messages, error: msgError } = await supabase
    .from('support_ticket_messages')
    .select('id, sender_type, sender_id, message, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })
    .limit(500)

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  return NextResponse.json({
    ticket,
    messages: messages || [],
  })
}
