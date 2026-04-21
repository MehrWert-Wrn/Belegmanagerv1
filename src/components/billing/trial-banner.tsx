'use client'

import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { BillingStatus } from '@/lib/billing'

interface TrialBannerProps {
  billing: BillingStatus
}

export function TrialBanner({ billing }: TrialBannerProps) {
  const router = useRouter()

  if (billing.subscriptionStatus === 'active') return null

  if (billing.subscriptionStatus === 'past_due' || billing.subscriptionStatus === 'cancelled' || billing.subscriptionStatus === 'incomplete' || billing.subscriptionStatus === 'unpaid') {
    const label = billing.subscriptionStatus === 'cancelled' ? 'Abonnement gekündigt' : 'Zahlung fehlgeschlagen'
    return (
      <button
        onClick={() => router.push('/settings/abonnement')}
        className="w-full rounded-md bg-red-50 border border-red-200 px-3 py-2 text-left text-xs text-red-700 hover:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {label}
        </div>
        <div className="mt-0.5 text-red-600">Jetzt Abonnement verwalten →</div>
      </button>
    )
  }

  if (billing.subscriptionStatus === 'none') {
    return (
      <button
        onClick={() => router.push('/settings/abonnement')}
        className="w-full rounded-md bg-teal-50 border border-teal-200 px-3 py-2 text-left text-xs text-teal-700 hover:bg-teal-100 transition-colors"
      >
        <div className="font-semibold">Jetzt abonnieren</div>
        <div className="mt-0.5 text-teal-600"><span className="line-through text-teal-400">€49,90 / Monat</span> – ab €33,90 / Monat</div>
      </button>
    )
  }

  return null
}
