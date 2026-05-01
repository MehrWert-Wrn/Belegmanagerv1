import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AppSidebar } from '@/components/app-sidebar'
import { getBillingStatus } from '@/lib/billing'
import { AccessGuard } from '@/components/billing/access-guard'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { ChatbotWidget } from '@/components/chat/chatbot-widget'

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

  // Check for impersonation context
  const cookieStore = await cookies()
  const adminCtxCookie = cookieStore.get('bm_admin_ctx')
  let impersonationMandantName: string | null = null

  const admin = createAdminClient()

  if (adminCtxCookie) {
    try {
      const ctx = JSON.parse(adminCtxCookie.value)
      if (ctx.mandant_id) {
        const { data: impMandant } = await admin
          .from('mandanten')
          .select('firmenname')
          .eq('id', ctx.mandant_id)
          .maybeSingle()
        impersonationMandantName = impMandant?.firmenname ?? 'Unbekannter Mandant'
      }
    } catch {
      // Invalid cookie, ignore
    }
  }

  const { data: mandant } = await admin
    .from('mandanten')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  const billing = mandant ? await getBillingStatus(mandant.id) : null

  return (
    <>
      {impersonationMandantName && (
        <ImpersonationBanner mandantName={impersonationMandantName} />
      )}
      <AppSidebar userEmail={user.email ?? ''} billingStatus={billing}>
        <AccessGuard hasAccess={billing?.hasAccess ?? true}>
          {children}
        </AccessGuard>
      </AppSidebar>
      {!impersonationMandantName && <ChatbotWidget />}
    </>
  )
}
