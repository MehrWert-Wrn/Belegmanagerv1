'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Zap } from 'lucide-react'
import type { BillingStatus } from '@/lib/billing'

interface TrialBannerProps {
  billing: BillingStatus
}

export function TrialBanner({ billing }: TrialBannerProps) {
  if (!billing.showTrialBanner) return null

  const daysLeft = billing.trialDaysLeft ?? 0
  const isUrgent = daysLeft <= 7

  return (
    <div
      className={`mx-2 mb-2 rounded-lg p-3 ${
        isUrgent
          ? 'bg-[#E50046]/10 border border-[#E50046]/30'
          : 'bg-[#08525E]/10 border border-[#08525E]/20'
      }`}
    >
      <div className="flex items-start gap-2">
        <Zap
          className={`mt-0.5 h-4 w-4 shrink-0 ${isUrgent ? 'text-[#E50046]' : 'text-[#08525E]'}`}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className={`text-xs font-semibold leading-tight ${isUrgent ? 'text-[#E50046]' : 'text-[#08525E]'}`}>
            Jetzt Belegmanager-ABO sichern!
          </p>
          <p className="text-[11px] text-muted-foreground">
            {daysLeft === 0
              ? 'Testzeitraum endet heute'
              : `Noch ${daysLeft} Tag${daysLeft === 1 ? '' : 'e'} kostenlos`}
          </p>
          <Button
            asChild
            size="sm"
            className={`mt-1 h-7 w-full text-xs text-white ${
              isUrgent
                ? 'bg-[#E50046] hover:bg-[#BA1540]'
                : 'bg-[#08525E] hover:bg-[#1D8A9E]'
            }`}
          >
            <Link href="/settings/abonnement">Abonnieren</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
