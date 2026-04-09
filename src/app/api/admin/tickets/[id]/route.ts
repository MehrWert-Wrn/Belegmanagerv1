import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin, logAdminAction } from '@/lib/admin-context'
import { sendTicketStatusEmail } from '@/lib/resend'

const updateSchema = z.object({
  status: z.enum(['open', 'in_progress', 'closed']).optional(),
  assigned_to_admin_id: z.string().uuid().nullable().optional(),
  assign_to_me: z.boolean().optional(),
}).refine(
  (data) => data.status !== undefined || data.assigned_to_admin_id !== undefined || data.assign_to_me !== undefined,
  { message: 'Mindestens status, assigned_to_admin_id oder assign_to_me muss angegeben werden' }
)

// GET /api/admin/tickets/[id] – Ticket detail with messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: ticketId } = await params
  const admin = createAdminClient()

  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .select('id, mandant_id, subject, status, assigned_to_admin_id, created_at, updated_at')
    .eq('id', ticketId)
    .single()

  if (ticketError || !ticket) {
    return NextResponse.json({ error: 'Ticket nicht gefunden' }, { status: 404 })
  }

  // Enrich with mandant name
  const { data: mandant } = await admin
    .from('mandanten')
    .select('firmenname')
    .eq('id', ticket.mandant_id)
    .single()

  // Enrich with assigned admin email
  let assignedAdminEmail: string | null = null
  if (ticket.assigned_to_admin_id) {
    const { data: adminProfile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', ticket.assigned_to_admin_id)
      .single()
    assignedAdminEmail = adminProfile?.email ?? null
  }

  const { data: messages, error: msgError } = await admin
    .from('support_ticket_messages')
    .select('id, ticket_id, sender_type, sender_id, message, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  if (msgError) {
    return NextResponse.json({ error: msgError.message }, { status: 500 })
  }

  // Enrich messages with sender emails
  const enrichedMessages = await Promise.all(
    (messages ?? []).map(async (msg) => {
      const { data: profile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', msg.sender_id)
        .single()
      return { ...msg, sender_email: profile?.email ?? null }
    })
  )

  return NextResponse.json({
    ticket: {
      ...ticket,
      mandant_name: mandant?.firmenname ?? null,
      assigned_admin_email: assignedAdminEmail,
    },
    messages: enrichedMessages,
  })
}

// PATCH /api/admin/tickets/[id] – Update ticket status and/or assignment
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: ticketId } = await params

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = createAdminClient()

  // Get current ticket
  const { data: ticket, error: fetchError } = await admin
    .from('support_tickets')
    .select('id, mandant_id, subject, status, assigned_to_admin_id')
    .eq('id', ticketId)
    .single()

  if (fetchError || !ticket) {
    return NextResponse.json({ error: 'Ticket nicht gefunden' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status
  }
  if (parsed.data.assign_to_me) {
    updates.assigned_to_admin_id = adminUser.adminId
  } else if (parsed.data.assigned_to_admin_id !== undefined) {
    updates.assigned_to_admin_id = parsed.data.assigned_to_admin_id
  }

  const { data: updated, error: updateError } = await admin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Log status change
  if (parsed.data.status !== undefined && parsed.data.status !== ticket.status) {
    await logAdminAction(adminUser.adminId, 'ticket_status_change', ticket.mandant_id, {
      ticket_id: ticketId,
      old_status: ticket.status,
      new_status: parsed.data.status,
    })

    // Send email notification to mandant
    const { data: mandant } = await admin
      .from('mandanten')
      .select('owner_id')
      .eq('id', ticket.mandant_id)
      .single()

    if (mandant) {
      const { data: { user: owner } } = await admin.auth.admin.getUserById(mandant.owner_id)
      if (owner?.email) {
        await sendTicketStatusEmail({
          recipientEmail: owner.email,
          ticketId,
          ticketSubject: ticket.subject,
          newStatus: parsed.data.status,
        })
      }
    }
  }

  // Log assignment change
  if (
    parsed.data.assigned_to_admin_id !== undefined &&
    parsed.data.assigned_to_admin_id !== ticket.assigned_to_admin_id
  ) {
    await logAdminAction(adminUser.adminId, 'ticket_assignment', ticket.mandant_id, {
      ticket_id: ticketId,
      old_assigned: ticket.assigned_to_admin_id,
      new_assigned: parsed.data.assigned_to_admin_id,
    })
  }

  return NextResponse.json(updated)
}
