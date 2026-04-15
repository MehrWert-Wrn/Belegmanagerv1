import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TicketsUebersicht } from '@/components/support/tickets-uebersicht'
import { OnboardingCheckliste } from '@/components/onboarding/onboarding-checkliste'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Eingeloggt als {user.email}</p>
      </div>

      <OnboardingCheckliste />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <TicketsUebersicht />
      </div>
    </div>
  )
}
