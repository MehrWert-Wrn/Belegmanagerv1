'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Building2, Mail, Calendar, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { AboOverridePanel } from '@/components/admin/abo-override-panel'
import { ImpersonationButton } from '@/components/admin/impersonation-button'
import type { AdminMandantDetail } from '@/lib/admin-types'

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return 'Nie'
  return new Date(dateStr).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminMandantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const mandantId = params.id as string

  const [mandant, setMandant] = useState<AdminMandantDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMandant = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/mandanten/${mandantId}`)
      if (!res.ok) throw new Error('Mandant konnte nicht geladen werden')
      const data = await res.json()
      setMandant(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [mandantId])

  useEffect(() => {
    fetchMandant()
  }, [fetchMandant])

  // Loading state
  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-7 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Button variant="ghost" onClick={() => router.push('/admin/mandanten')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurueck zur Uebersicht
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="link" className="mt-2 text-destructive" onClick={fetchMandant}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    )
  }

  if (!mandant) return null

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/mandanten')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{mandant.firmenname}</h1>
            <p className="text-sm text-muted-foreground">{mandant.owner_email}</p>
          </div>
        </div>
        <ImpersonationButton
          mandantId={mandant.id}
          mandantName={mandant.firmenname}
        />
      </div>

      {/* Stammdaten */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-teal-600" />
              Stammdaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">Firma</dt>
                <dd className="font-medium">{mandant.firmenname}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Rechtsform</dt>
                <dd>{mandant.rechtsform ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">UID-Nummer</dt>
                <dd>{mandant.uid_nummer ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Land</dt>
                <dd>{mandant.land}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Adresse</dt>
                <dd>
                  {mandant.strasse ?? '-'}
                  {mandant.plz && mandant.ort && (
                    <>, {mandant.plz} {mandant.ort}</>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Registriert am</dt>
                <dd>{formatDate(mandant.erstellt_am)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-teal-600" />
              Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">E-Mail</dt>
                <dd className="font-medium">{mandant.owner_email}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Letzter Login</dt>
                <dd>{formatDateTime(mandant.last_sign_in_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Offene Tickets</dt>
                <dd>
                  {mandant.open_ticket_count > 0 ? (
                    <Badge variant="destructive" className="text-xs">{mandant.open_ticket_count}</Badge>
                  ) : (
                    <span>0</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Abo Override */}
      <AboOverridePanel
        mandantId={mandant.id}
        stripeStatus={mandant.subscription_status}
        stripeCustomerId={mandant.stripe_customer_id ?? null}
        currentPeriodEnd={mandant.current_period_end ?? null}
        overrideType={mandant.admin_override_type}
        overrideUntil={mandant.admin_override_until}
        onOverrideChanged={fetchMandant}
      />
    </div>
  )
}
