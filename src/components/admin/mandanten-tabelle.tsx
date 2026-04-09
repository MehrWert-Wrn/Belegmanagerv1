'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { AdminMandant } from '@/lib/admin-types'

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

function SubscriptionBadge({ status, overrideType }: { status: string | null; overrideType: string | null }) {
  if (overrideType) {
    return (
      <Badge variant="outline" className="border-purple-300 bg-purple-50 text-purple-700">
        Override ({overrideType === 'permanent' ? 'Permanent' : 'Befristet'})
      </Badge>
    )
  }

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

export function MandantenTabelle() {
  const router = useRouter()
  const [mandanten, setMandanten] = useState<AdminMandant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const fetchMandanten = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      const res = await fetch(`/api/admin/mandanten?${params.toString()}`)
      if (!res.ok) throw new Error('Mandanten konnten nicht geladen werden')
      const data = await res.json()
      setMandanten(data ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const debounce = setTimeout(fetchMandanten, 300)
    return () => clearTimeout(debounce)
  }, [fetchMandanten])

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Name oder E-Mail suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Mandanten suchen"
          />
        </div>
        {search && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearch('')}
            aria-label="Suche zuruecksetzen"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={fetchMandanten}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Abo-Status</TableHead>
                <TableHead>Letzter Login</TableHead>
                <TableHead className="text-right">Offene Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && mandanten.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <Users className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Keine Mandanten gefunden</p>
            <p className="text-sm text-muted-foreground">
              {search ? 'Versuche einen anderen Suchbegriff.' : 'Es sind noch keine Mandanten registriert.'}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading && !error && mandanten.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma</TableHead>
                <TableHead>E-Mail</TableHead>
                <TableHead>Abo-Status</TableHead>
                <TableHead>Letzter Login</TableHead>
                <TableHead className="text-right">Offene Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mandanten.map((m) => (
                <TableRow
                  key={m.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/mandanten/${m.id}`)}
                  role="link"
                  aria-label={`Mandant ${m.firmenname} anzeigen`}
                >
                  <TableCell className="font-medium">{m.firmenname}</TableCell>
                  <TableCell className="text-muted-foreground">{m.owner_email}</TableCell>
                  <TableCell>
                    <SubscriptionBadge
                      status={m.subscription_status}
                      overrideType={m.admin_override_type}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(m.last_sign_in_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.open_ticket_count > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {m.open_ticket_count}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">0</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
