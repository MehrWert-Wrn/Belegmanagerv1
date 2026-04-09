import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'

// GET /api/admin/tickets – List all tickets with filters
export async function GET(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const assignedTo = searchParams.get('assigned_to')
  const mandantId = searchParams.get('mandant_id')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const unassigned = searchParams.get('unassigned')

  const admin = createAdminClient()

  let query = admin
    .from('support_tickets')
    .select(`
      id,
      mandant_id,
      subject,
      status,
      assigned_to_admin_id,
      created_at,
      updated_at,
      mandanten!inner(firmenname)
    `)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (status) {
    query = query.eq('status', status)
  }

  if (assignedTo) {
    query = query.eq('assigned_to_admin_id', assignedTo)
  }

  if (mandantId) {
    query = query.eq('mandant_id', mandantId)
  }

  if (from) {
    query = query.gte('created_at', from)
  }

  if (to) {
    query = query.lte('created_at', to)
  }

  if (unassigned === 'true') {
    query = query.is('assigned_to_admin_id', null)
  }

  const { data: tickets, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get assigned admin emails
  const adminIds = [...new Set(
    (tickets || [])
      .map(t => t.assigned_to_admin_id)
      .filter(Boolean) as string[]
  )]

  const adminEmailMap = new Map<string, string>()
  if (adminIds.length > 0) {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', adminIds)

    for (const p of profiles || []) {
      adminEmailMap.set(p.id, p.email || '')
    }
  }

  const result = (tickets || []).map(t => {
    const mandantData = t.mandanten as unknown as { firmenname: string }
    return {
      id: t.id,
      mandant_id: t.mandant_id,
      subject: t.subject,
      status: t.status,
      assigned_to_admin_id: t.assigned_to_admin_id,
      assigned_admin_email: t.assigned_to_admin_id
        ? adminEmailMap.get(t.assigned_to_admin_id) || null
        : null,
      mandant_name: mandantData?.firmenname || '',
      created_at: t.created_at,
      updated_at: t.updated_at,
    }
  })

  return NextResponse.json(result)
}
