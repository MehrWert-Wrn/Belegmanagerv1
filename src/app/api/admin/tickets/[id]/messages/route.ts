import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'
import { sendTicketReplyEmail } from '@/lib/resend'

const messageSchema = z.object({
  message: z.string().min(1).max(5000),
})

// POST /api/admin/tickets/[id]/messages – Admin reply to ticket
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: ticketId } = await params

  const body = await request.json()
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify ticket exists
  const { data: ticket, error: fetchError } = await admin
    .from('support_tickets')
    .select('id, mandant_id, subject, status')
    .eq('id', ticketId)
    .single()

  if (fetchError || !ticket) {
    return NextResponse.json({ error: 'Ticket nicht gefunden' }, { status: 404 })
  }

  // Insert message
  const { data: message, error: insertError } = await admin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: 'admin',
      sender_id: adminUser.adminId,
      message: parsed.data.message,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // If ticket was closed, set to in_progress when admin replies
  if (ticket.status === 'closed') {
    await admin
      .from('support_tickets')
      .update({ status: 'in_progress' })
      .eq('id', ticketId)
  }

  // Send email notification to mandant
  const { data: mandant } = await admin
    .from('mandanten')
    .select('owner_id')
    .eq('id', ticket.mandant_id)
    .single()

  if (mandant) {
    const { data: { user: owner } } = await admin.auth.admin.getUserById(mandant.owner_id)
    if (owner?.email) {
      await sendTicketReplyEmail({
        recipientEmail: owner.email,
        ticketId,
        ticketSubject: ticket.subject,
        messageText: parsed.data.message,
      })
    }
  }

  return NextResponse.json(message, { status: 201 })
}
