'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import type { BillingStatus } from '@/lib/billing'
import { CheckCircle, AlertTriangle, Clock, CreditCard, Calendar, Euro } from 'lucide-react'

interface Payment {
  id: string
  amount_cents: number
  currency: string
  status: string
  charge_date: string | null
}

interface Props {
  billing: BillingStatus
  payments: Payment[]
  successParam: boolean
  cancelledParam: boolean
}

function statusBadge(status: string | null) {
  switch (status) {
    case 'active':
      return <Badge className="bg-teal-100 text-teal-700 border-teal-200">Aktiv</Badge>
    case 'payment_failed':
      return <Badge className="bg-[#E50046]/10 text-[#E50046] border-[#E50046]/30">Zahlung fehlgeschlagen</Badge>
    case 'cancelled':
      return <Badge variant="secondary">Gekündigt</Badge>
    case 'pending_mandate':
      return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Mandat ausstehend</Badge>
    default:
      return <Badge variant="outline">Kein Abo</Badge>
  }
}

function paymentStatusBadge(status: string) {
  switch (status) {
    case 'paid_out':
      return <Badge className="bg-teal-100 text-teal-700 text-xs">Bezahlt</Badge>
    case 'failed':
      return <Badge className="bg-[#E50046]/10 text-[#E50046] text-xs">Fehlgeschlagen</Badge>
    case 'pending':
      return <Badge variant="outline" className="text-xs">Ausstehend</Badge>
    case 'cancelled':
      return <Badge variant="secondary" className="text-xs">Storniert</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatAmount(cents: number, currency: string) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency }).format(cents / 100)
}

export function AbonnementPageClient({ billing, payments, successParam, cancelledParam }: Props) {
  const router = useRouter()
  const [setupLoading, setSetupLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  useEffect(() => {
    if (successParam) {
      toast.success('Mandat erfolgreich eingerichtet – Abonnement wird aktiviert')
      // Remove query params
      router.replace('/settings/abonnement')
    }
    if (cancelledParam) {
      toast.info('Abo-Einrichtung abgebrochen')
      router.replace('/settings/abonnement')
    }
  }, [successParam, cancelledParam, router])

  async function handleSetup() {
    setSetupLoading(true)
    try {
      const res = await fetch('/api/billing/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Fehler')
      window.location.href = data.authorisation_url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Zahlungsservice momentan nicht verfügbar')
      setSetupLoading(false)
    }
  }

  async function handleCancel() {
    setCancelLoading(true)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Fehler')
      }
      toast.success('Abonnement wurde gekündigt')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Kündigen')
    } finally {
      setCancelLoading(false)
    }
  }

  const showSetupButton = !billing.subscriptionActive && billing.subscriptionStatus !== 'pending_mandate'
  const showUpdateButton = billing.subscriptionStatus === 'payment_failed'
  const showCancelButton = billing.subscriptionActive

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold">Abonnement</h2>
        <p className="text-sm text-muted-foreground">Verwalte dein Belegmanager-Abonnement</p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[#08525E]" />
            Abo-Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plan</span>
            <span className="text-sm font-medium">Belegmanager</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            {statusBadge(billing.subscriptionStatus)}
          </div>

          {billing.trialActive && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Testzeitraum
              </span>
              <span className="text-sm font-medium">
                {billing.trialDaysLeft === 0
                  ? 'Endet heute'
                  : `noch ${billing.trialDaysLeft} Tag${billing.trialDaysLeft === 1 ? '' : 'e'}`}
              </span>
            </div>
          )}

          {billing.currentPeriodEnd && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Nächste Zahlung
              </span>
              <span className="text-sm font-medium">{formatDate(billing.currentPeriodEnd)}</span>
            </div>
          )}

          {/* Status messages */}
          {billing.subscriptionStatus === 'payment_failed' && (
            <div className="flex items-start gap-2 rounded-md bg-[#E50046]/10 p-3 text-sm text-[#E50046]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Zahlung fehlgeschlagen. Bitte aktualisiere deine Bankverbindung.</span>
            </div>
          )}

          {billing.subscriptionActive && (
            <div className="flex items-center gap-2 rounded-md bg-teal-50 p-3 text-sm text-teal-700">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Abonnement ist aktiv</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {showSetupButton && (
              <Button
                onClick={handleSetup}
                disabled={setupLoading}
                className="bg-[#08525E] hover:bg-[#1D8A9E] text-white"
              >
                {setupLoading ? 'Weiterleitung…' : 'Abo abschließen'}
              </Button>
            )}

            {showUpdateButton && (
              <Button
                onClick={handleSetup}
                disabled={setupLoading}
                className="bg-[#E50046] hover:bg-[#BA1540] text-white"
              >
                {setupLoading ? 'Weiterleitung…' : 'Bankverbindung aktualisieren'}
              </Button>
            )}

            {showCancelButton && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={cancelLoading}>
                    Abo kündigen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Abonnement kündigen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dein Konto bleibt bis zum Ende der aktuellen Periode aktiv.
                      Danach hast du keinen Zugang mehr. Deine Daten bleiben erhalten.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-[#E50046] hover:bg-[#BA1540] text-white"
                    >
                      Ja, kündigen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Euro className="h-4 w-4 text-[#08525E]" />
              Zahlungshistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between py-1 text-sm border-b last:border-0">
                  <span className="text-muted-foreground">{formatDate(payment.charge_date)}</span>
                  <span className="font-medium">{formatAmount(payment.amount_cents, payment.currency)}</span>
                  {paymentStatusBadge(payment.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {payments.length === 0 && billing.subscriptionActive && (
        <p className="text-sm text-muted-foreground">Noch keine Zahlungen vorhanden.</p>
      )}
    </div>
  )
}
