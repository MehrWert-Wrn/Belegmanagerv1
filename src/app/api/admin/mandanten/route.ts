import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyAdmin } from '@/lib/admin-context'

// GET /api/admin/mandanten – List all mandants with subscription status and ticket counts
export async function GET(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''

  const admin = createAdminClient()

  // Get all mandants with owner info
  let query = admin
    .from('mandanten')
    .select(`
      id,
      firmenname,
      owner_id,
      erstellt_am
    `)
    .order('erstellt_am', { ascending: false })
    .limit(200)

  if (search) {
    query = query.ilike('firmenname', `%${search}%`)
  }

  const { data: mandanten, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!mandanten || mandanten.length === 0) {
    return NextResponse.json([])
  }

  // Get owner emails from auth.users via admin API
  const ownerIds = [...new Set(mandanten.map(m => m.owner_id))]
  const ownerEmails = new Map<string, { email: string; last_sign_in_at: string | null }>()
  for (const ownerId of ownerIds) {
    const { data: { user } } = await admin.auth.admin.getUserById(ownerId)
    if (user) {
      ownerEmails.set(ownerId, {
        email: user.email || '',
        last_sign_in_at: user.last_sign_in_at || null,
      })
    }
  }

  // Get subscription statuses
  const mandantIds = mandanten.map(m => m.id)
  const { data: subscriptions } = await admin
    .from('billing_subscriptions')
    .select('mandant_id, status, admin_override_type, admin_override_until')
    .in('mandant_id', mandantIds)

  const subMap = new Map(
    (subscriptions || []).map(s => [s.mandant_id, s])
  )

  // Get open ticket counts
  const { data: ticketCounts } = await admin
    .from('support_tickets')
    .select('mandant_id')
    .in('mandant_id', mandantIds)
    .in('status', ['open', 'in_progress'])

  const ticketCountMap = new Map<string, number>()
  for (const t of ticketCounts || []) {
    ticketCountMap.set(t.mandant_id, (ticketCountMap.get(t.mandant_id) || 0) + 1)
  }

  // If search by email, also filter
  const result = mandanten.map(m => {
    const ownerInfo = ownerEmails.get(m.owner_id)
    const sub = subMap.get(m.id)
    return {
      id: m.id,
      firmenname: m.firmenname,
      owner_id: m.owner_id,
      owner_email: ownerInfo?.email || '',
      erstellt_am: m.erstellt_am,
      last_sign_in_at: ownerInfo?.last_sign_in_at || null,
      subscription_status: sub?.status || null,
      admin_override_type: sub?.admin_override_type || null,
      admin_override_until: sub?.admin_override_until || null,
      open_ticket_count: ticketCountMap.get(m.id) || 0,
    }
  })

  // If searching by email too
  if (search) {
    const filtered = result.filter(
      m => m.firmenname.toLowerCase().includes(search.toLowerCase()) ||
           m.owner_email.toLowerCase().includes(search.toLowerCase())
    )
    return NextResponse.json(filtered)
  }

  return NextResponse.json(result)
}
