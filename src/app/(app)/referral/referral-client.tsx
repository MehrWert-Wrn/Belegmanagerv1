'use client'

import { useEffect, useState } from 'react'
import { Gift, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { LinkCard } from '@/components/referral/link-card'
import { StatsCard, type ReferralStats } from '@/components/referral/stats-card'
import { Tabelle, type ReferralRow } from '@/components/referral/tabelle'

interface CodeResponse {
  code: string
  referral_link: string
}

interface StatsResponse extends ReferralStats {
  referrals: ReferralRow[]
}

export function ReferralPageClient() {
  const [code, setCode] = useState<CodeResponse | null>(null)
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [codeRes, statsRes] = await Promise.all([
          fetch('/api/referral/code'),
          fetch('/api/referral/stats'),
        ])

        if (codeRes.status === 403) {
          if (!cancelled) {
            setHasAccess(false)
            setLoading(false)
          }
          return
        }

        if (!codeRes.ok || !statsRes.ok) {
          throw new Error('Daten konnten nicht geladen werden.')
        }

        const codeData = (await codeRes.json()) as CodeResponse
        const statsData = (await statsRes.json()) as StatsResponse

        if (!cancelled) {
          setCode(codeData)
          setStats(statsData)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!hasAccess) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Empfehlen &amp; Sparen</h1>
          <p className="text-sm text-muted-foreground">
            Verfügbar für Mandanten mit aktivem Abo.
          </p>
        </div>
        <Alert>
          <Gift className="h-4 w-4" />
          <AlertTitle>Empfehlungsprogramm noch nicht verfügbar</AlertTitle>
          <AlertDescription>
            Das Weiterempfehlungssystem steht aktiven Belegmanager-Abonnenten zur Verfügung.
            Sobald dein Abo aktiv ist, kannst du Empfehlungen aussprechen und pro
            Erfolg 39,90 € Guthaben sammeln.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-teal-600" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-[#08525E]">
            Empfehlen &amp; Sparen
          </h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Bestehende Belegmanager-Kunden empfehlen weiter und erhalten pro Empfehlung{' '}
          <strong className="text-teal-700">1 Monat gratis</strong> (39,90 € Guthaben).
          Kein Cap, keine Punktesystem-Tricks – einfach teilen, gewinnen, sparen.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistik */}
      <StatsCard
        loading={loading}
        stats={
          stats
            ? {
                total_referrals: stats.total_referrals,
                active_rewards: stats.active_rewards,
                saved_months: stats.saved_months,
                saved_euros: stats.saved_euros,
              }
            : null
        }
      />

      {/* Link + Share */}
      <LinkCard referralLink={code?.referral_link ?? ''} loading={loading} />

      {/* Tabelle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Deine Empfehlungen</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabelle rows={stats?.referrals ?? []} loading={loading} />
        </CardContent>
      </Card>

      {/* Wie funktioniert es? */}
      <Card className="border-teal-100 bg-teal-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold text-[#08525E]">
            So funktioniert&apos;s
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                1
              </span>
              <span>
                <strong>Link teilen:</strong> Kopiere deinen persönlichen Empfehlungs-Link
                und schicke ihn an Kontakte – per WhatsApp, E-Mail oder direkt.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                2
              </span>
              <span>
                <strong>Empfehlung registriert sich:</strong> Sobald sich jemand über
                deinen Link anmeldet und ein zahlendes Abo abschließt, vermerken wir das
                in deinem Konto.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                3
              </span>
              <span>
                <strong>Belohnung erhalten:</strong> Nach 14 Tagen Stripe-Abo-Aktivität
                schreiben wir dir <strong className="text-teal-700">39,90 €</strong>{' '}
                Guthaben gut – das entspricht einem Gratismonat.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
