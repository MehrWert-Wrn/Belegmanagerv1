import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBillingStatus } from '@/lib/billing'
import { AbonnementPageClient } from './abonnement-page-client'

export default async function AbonnementPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!mandant) redirect('/onboarding')

  const [billing, { data: payments }] = await Promise.all([
    getBillingStatus(mandant.id),
    admin
      .from('billing_payments')
      .select('id, amount_cents, currency, status, charge_date')
      .eq('mandant_id', mandant.id)
      .order('charge_date', { ascending: false })
      .limit(12),
  ])

  const params = await searchParams

  return (
    <AbonnementPageClient
      billing={billing}
      payments={payments ?? []}
      successParam={params.success === 'true'}
      cancelledParam={params.cancelled === 'true'}
    />
  )
}
