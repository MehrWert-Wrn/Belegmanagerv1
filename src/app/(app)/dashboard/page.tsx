import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TicketsUebersicht } from '@/components/support/tickets-uebersicht'
import { OnboardingCheckliste } from '@/components/onboarding/onboarding-checkliste'
import { TeamBanner } from '@/components/dashboard/team-banner'
import { CloudStorageWidget } from '@/components/dashboard/cloud-storage-widget'
import { MonatssaldoWidget } from '@/components/dashboard/monatssaldo-widget'
import { UeberfaelligeBelegeWidget } from '@/components/dashboard/ueberfaellige-belege-widget'
import { BelegeOrdnerWidget } from '@/components/dashboard/belege-ordner-widget'
import { ReferralWidget } from '@/components/dashboard/referral-widget'

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

      <CloudStorageWidget />

      <ReferralWidget />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BelegeOrdnerWidget />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <MonatssaldoWidget />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <UeberfaelligeBelegeWidget />
        <TicketsUebersicht />
      </div>

      {/* Team-Banner – immer sichtbar, volle Breite */}
      <TeamBanner />
    </div>
  )
}
