'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gift, Copy, Check, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface ReferralCodeResponse {
  code: string
  referral_link: string
}

interface ReferralStatsResponse {
  total_referrals: number
  active_rewards: number
  saved_months: number
  saved_euros: number
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function ReferralWidget() {
  const [code, setCode] = useState<ReferralCodeResponse | null>(null)
  const [stats, setStats] = useState<ReferralStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/referral/code').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/referral/stats').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([codeData, statsData]) => {
        if (cancelled) return
        if (!codeData) {
          // 403 / 404 → Mandant hat kein aktives Abo, Widget verstecken
          setVisible(false)
          return
        }
        setCode(codeData)
        setStats(statsData)
      })
      .catch(() => {
        if (!cancelled) setVisible(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible) return null

  async function copyLink() {
    if (!code?.referral_link) return
    try {
      await navigator.clipboard.writeText(code.referral_link)
      setCopied(true)
      toast.success('Link kopiert')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Link konnte nicht kopiert werden')
    }
  }

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
      <CardContent className="p-4 md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-teal-100 p-2.5">
              <Gift className="h-5 w-5 text-teal-700" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#08525E]">
                Empfehle Belegmanager weiter
              </h3>
              {loading ? (
                <Skeleton className="mt-1 h-4 w-48" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {stats && stats.saved_euros > 0 ? (
                    <>
                      Du hast bereits{' '}
                      <strong className="text-teal-700">{fmtEuro(stats.saved_euros)}</strong>{' '}
                      gespart ({stats.saved_months}{' '}
                      {stats.saved_months === 1 ? 'Monat' : 'Monate'} gratis).
                    </>
                  ) : (
                    <>Pro erfolgreicher Empfehlung gibt&apos;s 39,90 € Guthaben.</>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              disabled={loading || !code?.referral_link}
              className="border-teal-300 text-teal-700 hover:bg-teal-100 hover:text-teal-900"
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Kopiert
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Link kopieren
                </>
              )}
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-teal-600 hover:bg-teal-700"
            >
              <Link href="/referral">
                Mehr Details
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {!loading && stats && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-teal-100 pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Empfehlungen
              </p>
              <p className="text-lg font-bold text-teal-800">{stats.total_referrals}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Belohnungen
              </p>
              <p className="text-lg font-bold text-teal-800">{stats.active_rewards}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Guthaben
              </p>
              <p className="text-lg font-bold text-teal-800">{fmtEuro(stats.saved_euros)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
