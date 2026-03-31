import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppSidebar } from '@/components/app-sidebar'
import { getBillingStatus } from '@/lib/billing'
import { BlockedView } from '@/components/billing/blocked-view'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const admin = createAdminClient()
  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  // Fetch billing status (cached 30 min)
  const billing = mandant ? await getBillingStatus(mandant.id) : null

  return (
    <AppSidebar
      userEmail={user.email ?? ''}
      billingStatus={billing}
    >
      {billing && !billing.hasAccess ? (
        <BlockedView />
      ) : (
        children
      )}
    </AppSidebar>
  )
}
