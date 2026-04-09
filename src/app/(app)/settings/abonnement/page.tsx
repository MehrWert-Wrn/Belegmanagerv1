'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CreditCard, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

interface BillingData {
  subscriptionStatus: string
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  adminOverrideType?: string | null
  adminOverrideUntil?: string | null
  payments: {
    amount_cents: number
    currency: string
    status: string
    charge_date: string | null
    stripe_invoice_id: string | null
  }[]
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">Aktiv</Badge>
  if (status === 'past_due') return <Badge variant="destructive">Zahlung offen</Badge>
  if (status === 'cancelled' || status === 'canceled') return <Badge variant="secondary">Gekündigt</Badge>
  return <Badge variant="outline">Kein Abo</Badge>
}

export default function AbonnementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    if (searchParams.get('success') === '1') {
      toast.success('Abonnement erfolgreich abgeschlossen!')
      router.replace('/settings/abonnement')
    }
    if (searchParams.get('cancelled') === '1') {
      toast.error('Abonnement-Vorgang abgebrochen.')
      router.replace('/settings/abonnement')
    }
  }, [searchParams, router])

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [])

  async function handleCheckout() {
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler')
      window.location.href = json.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Öffnen des Checkouts')
      setCheckoutLoading(false)
    }
  }

  async function handlePortal() {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Fehler')
      window.location.href = json.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Öffnen des Portals')
      setPortalLoading(false)
    }
  }

  const isActive = data?.subscriptionStatus === 'active'
  const isPastDue = data?.subscriptionStatus === 'past_due'
  const hasCustomer = !!data?.stripeCustomerId
  const hasAdminOverride = !!data?.adminOverrideType

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abonnement</h1>
        <p className="text-sm text-muted-foreground">
          Verwalte dein Belegmanager Pro Abonnement.
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Belegmanager Pro</CardTitle>
            {!loading && data && <StatusBadge status={data.subscriptionStatus} />}
          </div>
          <CardDescription>€49,90 / Monat (exkl. MwSt.)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Laden…
            </div>
          ) : (
            <>
              {hasAdminOverride && (
                <div className="flex items-center gap-2 rounded-md border border-purple-200 bg-purple-50 p-3 text-sm text-purple-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Vom Support aktiviert
                  {data?.adminOverrideType === 'until_date' && data?.adminOverrideUntil && (
                    <span className="text-purple-500"> (bis {formatDate(data.adminOverrideUntil)})</span>
                  )}
                </div>
              )}

              {isPastDue && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Letzte Zahlung fehlgeschlagen – bitte Zahlungsdaten im Portal aktualisieren.
                </div>
              )}

              {isActive && data?.currentPeriodEnd && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 shrink-0" />
                  Aktiv bis {formatDate(data.currentPeriodEnd)}
                </div>
              )}

              <div className="flex gap-2">
                {!isActive && !isPastDue && (
                  <Button onClick={handleCheckout} disabled={checkoutLoading} className="gap-2">
                    {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    Jetzt abonnieren
                  </Button>
                )}
                {hasCustomer && (
                  <Button variant="outline" onClick={handlePortal} disabled={portalLoading} className="gap-2">
                    {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                    Abonnement verwalten
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Zahlungshistorie */}
      {!loading && data && data.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Zahlungshistorie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {data.payments.map((p, i) => (
                <div key={i}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between py-3 text-sm">
                    <div className="text-muted-foreground">
                      {formatDate(p.charge_date)}
                    </div>
                    <div className="font-mono">
                      {formatCurrency(p.amount_cents, p.currency)}
                    </div>
                    <Badge
                      variant={p.status === 'paid' ? 'outline' : 'destructive'}
                      className={p.status === 'paid' ? 'text-teal-700 border-teal-200 bg-teal-50' : ''}
                    >
                      {p.status === 'paid' ? 'Bezahlt' : 'Fehlgeschlagen'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
