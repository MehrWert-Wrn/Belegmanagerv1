'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Shield, ShieldOff, CalendarDays, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import type { OverrideType } from '@/lib/admin-types'

interface AboOverridePanelProps {
  mandantId: string
  stripeStatus: string | null
  stripeCustomerId: string | null
  currentPeriodEnd: string | null
  overrideType: OverrideType
  overrideUntil: string | null
  onOverrideChanged: () => void
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function StripeStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'active':
    case 'trialing':
      return <Badge className="bg-teal-100 text-teal-700 hover:bg-teal-100">Aktiv</Badge>
    case 'past_due':
      return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Ueberfaellig</Badge>
    case 'canceled':
    case 'cancelled':
      return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">Gekuendigt</Badge>
    default:
      return <Badge variant="secondary">Kein Abo</Badge>
  }
}

export function AboOverridePanel({
  mandantId,
  stripeStatus,
  stripeCustomerId,
  currentPeriodEnd,
  overrideType,
  overrideUntil,
  onOverrideChanged,
}: AboOverridePanelProps) {
  const [selectedType, setSelectedType] = useState<'permanent' | 'until_date'>('permanent')
  const [selectedDate, setSelectedDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const hasOverride = overrideType !== null

  async function handleSetOverride() {
    if (selectedType === 'until_date' && !selectedDate) {
      toast.error('Bitte ein Ablaufdatum waehlen')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/mandanten/${mandantId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          override_type: selectedType,
          override_until: selectedType === 'until_date' ? selectedDate : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Override konnte nicht gesetzt werden')
      }

      toast.success('Abo-Override wurde aktiviert')
      onOverrideChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemoveOverride() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/mandanten/${mandantId}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override_type: null }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Override konnte nicht entfernt werden')
      }

      toast.success('Abo-Override wurde entfernt')
      onOverrideChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-teal-600" />
          Abo-Verwaltung
        </CardTitle>
        <CardDescription>
          Stripe-Status und manueller Override fuer den Zugang des Mandanten.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stripe Status */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Stripe-Status</Label>
            <div className="flex items-center gap-2">
              <StripeStatusBadge status={stripeStatus} />
              {stripeCustomerId && (
                <span className="text-xs text-muted-foreground">
                  ({stripeCustomerId.slice(0, 12)}...)
                </span>
              )}
            </div>
            {currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                Aktuelle Periode bis: {formatDate(currentPeriodEnd)}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Admin-Override</Label>
            {hasOverride ? (
              <div>
                <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
                  {overrideType === 'permanent' ? 'Permanent aktiv' : `Bis ${formatDate(overrideUntil)}`}
                </Badge>
              </div>
            ) : (
              <div>
                <Badge variant="secondary">Kein Override</Badge>
              </div>
            )}
          </div>
        </div>

        {/* Override Controls */}
        {hasOverride ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldOff className="mr-2 h-4 w-4" />
                )}
                Override entfernen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Override entfernen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Der Mandant wird danach wieder anhand seines Stripe-Abostatus geprueft.
                  Bei fehlendem oder inaktivem Abo verliert er den Zugang.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemoveOverride}>
                  Override entfernen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-end">
            <div className="space-y-1.5 flex-1">
              <Label htmlFor="override-type" className="text-xs font-medium">
                Override-Typ
              </Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setSelectedType(v as 'permanent' | 'until_date')}
              >
                <SelectTrigger id="override-type" className="w-full sm:w-48" aria-label="Override-Typ waehlen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="permanent">Permanent</SelectItem>
                  <SelectItem value="until_date">Bis Datum</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedType === 'until_date' && (
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="override-date" className="text-xs font-medium">
                  Ablaufdatum
                </Label>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="override-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="pl-8 w-full sm:w-48"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSetOverride}
              disabled={submitting || (selectedType === 'until_date' && !selectedDate)}
              className="w-full sm:w-auto"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Override aktivieren
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
