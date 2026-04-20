'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CreditCard, CheckCircle2, AlertTriangle, ExternalLink,
  Loader2, Check, Zap, Shield, BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

const PRICE_ID_MONTHLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY ?? ''
const PRICE_ID_YEARLY = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_YEARLY ?? ''

const FEATURES = [
  { icon: Zap, label: 'Automatisches Beleg-Matching' },
  { icon: BarChart3, label: 'Monatsabschluss & DATEV-Export' },
  { icon: Shield, label: 'DSGVO-konform, Daten in EU' },
]

interface BillingData {
  subscriptionStatus: string
  currentPeriodEnd: string | null
  stripeCustomerId: string | null
  stripePriceId: string | null
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
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">Aktiv</Badge>
  if (status === 'past_due') return <Badge variant="destructive">Zahlung offen</Badge>
  if (status === 'cancelled' || status === 'canceled') return <Badge variant="secondary">Gekündigt</Badge>
  return <Badge variant="outline">Kein Abo</Badge>
}

function activePlanLabel(priceId: string | null) {
  if (priceId === PRICE_ID_YEARLY) return 'Jahresplan'
  if (priceId === PRICE_ID_MONTHLY) return 'Monatsplan'
  return 'Belegmanager Pro'
}

export default function AbonnementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data, setData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly')
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
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: selectedPlan }),
      })
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
    <div className="flex flex-col gap-8 p-4 md:p-6 lg:p-8 max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Abonnement</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Verwalte dein Belegmanager Pro Abonnement.
        </p>
      </div>

      {/* Aktives Abo – Status-Block */}
      {!loading && isActive && (
        <Card className="border-teal-200 bg-teal-50/40">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-teal-600 shrink-0" />
                  <span className="font-semibold text-teal-900">
                    {activePlanLabel(data?.stripePriceId ?? null)}
                  </span>
                  <StatusBadge status={data!.subscriptionStatus} />
                </div>
                {hasAdminOverride && (
                  <p className="text-xs text-purple-600 pl-7">
                    Vom Support aktiviert
                    {data?.adminOverrideType === 'until_date' && data?.adminOverrideUntil && (
                      <> (bis {formatDate(data.adminOverrideUntil)})</>
                    )}
                  </p>
                )}
                {data?.currentPeriodEnd && (
                  <p className="text-sm text-teal-700 pl-7">
                    Nächste Abbuchung: {formatDate(data.currentPeriodEnd)}
                  </p>
                )}
              </div>
              {hasCustomer && (
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading} className="gap-2 shrink-0">
                  {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  Verwalten
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Zahlung offen */}
      {!loading && isPastDue && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Letzte Zahlung fehlgeschlagen</p>
            <p className="text-destructive/80">Bitte aktualisiere deine Zahlungsdaten im Abo-Portal.</p>
          </div>
          {hasCustomer && (
            <Button variant="destructive" size="sm" onClick={handlePortal} disabled={portalLoading} className="ml-auto gap-2 shrink-0">
              {portalLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Portal öffnen
            </Button>
          )}
        </div>
      )}

      {/* Laden-State */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lädt…
        </div>
      )}

      {/* Plan-Auswahl (nur wenn kein aktives Abo) */}
      {!loading && !isActive && !isPastDue && (
        <>
          <div>
            <h2 className="text-base font-semibold mb-1">Plan wählen</h2>
            <p className="text-sm text-muted-foreground">Alle Pläne beinhalten den vollen Funktionsumfang.</p>
          </div>

          {/* Features */}
          <div className="flex flex-wrap gap-4">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-teal-500 shrink-0" />
                {label}
              </div>
            ))}
          </div>

          {/* Plan-Karten */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Monatlich */}
            <button
              type="button"
              onClick={() => setSelectedPlan('monthly')}
              className={`relative rounded-xl border-2 p-5 text-left transition-all ${
                selectedPlan === 'monthly'
                  ? 'border-teal-500 bg-teal-50/60 shadow-sm'
                  : 'border-border bg-card hover:border-teal-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Monatlich</span>
                {selectedPlan === 'monthly' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="mb-1">
                <span className="text-3xl font-bold">€39,90</span>
                <span className="text-sm text-muted-foreground ml-1">/ Monat</span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">€47,88 / Monat inkl. 20% MwSt.</p>
              <Separator className="mb-3" />
              <p className="text-xs text-muted-foreground">Monatlich kündbar</p>
            </button>

            {/* Jährlich */}
            <button
              type="button"
              onClick={() => setSelectedPlan('yearly')}
              className={`relative rounded-xl border-2 p-5 text-left transition-all ${
                selectedPlan === 'yearly'
                  ? 'border-teal-500 bg-teal-50/60 shadow-sm'
                  : 'border-border bg-card hover:border-teal-200 hover:shadow-sm'
              }`}
            >
              {/* Empfohlen Badge */}
              <div className="absolute -top-3 left-4">
                <span className="rounded-full bg-teal-600 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                  15 % günstiger
                </span>
              </div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Jährlich</span>
                {selectedPlan === 'yearly' && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-500">
                    <Check className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div className="mb-1">
                <span className="text-3xl font-bold">€33,90</span>
                <span className="text-sm text-muted-foreground ml-1">/ Monat</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">€40,68 / Monat inkl. 20% MwSt.</p>
              <p className="text-xs font-medium text-teal-700 mb-3">€488,16 / Jahr (einmalig abgerechnet)</p>
              <Separator className="mb-3" />
              <p className="text-xs text-muted-foreground">12 Monate Laufzeit</p>
            </button>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-4">
            <Button onClick={handleCheckout} disabled={checkoutLoading} size="lg" className="gap-2">
              {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {selectedPlan === 'yearly' ? 'Jahresplan abonnieren' : 'Monatsplan abonnieren'}
            </Button>
            <p className="text-xs text-muted-foreground">
              Sicher via Stripe · Kreditkarte & SEPA
            </p>
          </div>
        </>
      )}

      {/* Zahlungshistorie */}
      {!loading && data && data.payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Zahlungshistorie</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-0">
              {data.payments.map((p, i) => (
                <div key={i}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between py-3 text-sm">
                    <span className="text-muted-foreground">{formatDate(p.charge_date)}</span>
                    <span className="font-mono font-medium">{formatCurrency(p.amount_cents, p.currency)}</span>
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
