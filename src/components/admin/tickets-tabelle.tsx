'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, TicketIcon, Filter } from 'lucide-react'
import { toast } from 'sonner'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { SupportTicket, TicketStatus } from '@/lib/admin-types'

interface AdminProfile {
  id: string
  email: string
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  switch (status) {
    case 'open':
      return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">Offen</Badge>
    case 'in_progress':
      return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">In Bearbeitung</Badge>
    case 'closed':
      return <Badge variant="secondary">Geschlossen</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function TicketsTabelle() {
  const router = useRouter()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [admins, setAdmins] = useState<AdminProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('alle')
  const [assignedFilter, setAssignedFilter] = useState<string>('alle')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Load admin list once for assignment filter
  useEffect(() => {
    fetch('/api/admin/admins')
      .then((r) => r.ok ? r.json() : [])
      .then(setAdmins)
      .catch(() => {})
  }, [])

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (assignedFilter === 'unassigned') params.set('unassigned', 'true')
      else if (assignedFilter !== 'alle') params.set('assigned_to', assignedFilter)
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const res = await fetch(`/api/admin/tickets?${params.toString()}`)
      if (!res.ok) throw new Error('Tickets konnten nicht geladen werden')
      const data = await res.json()
      setTickets(data ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, assignedFilter, search, dateFrom, dateTo])

  useEffect(() => {
    const debounce = setTimeout(fetchTickets, 300)
    return () => clearTimeout(debounce)
  }, [fetchTickets])

  const hasActiveFilters = search || statusFilter !== 'alle' || assignedFilter !== 'alle' || dateFrom || dateTo

  // Separate unassigned tickets
  const unassignedTickets = tickets.filter(
    (t) => !t.assigned_to_admin_id && t.status !== 'closed'
  )
  const assignedTickets = tickets.filter(
    (t) => t.assigned_to_admin_id || t.status === 'closed'
  )

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="flex flex-col gap-3">
        {/* Row 1: Search + Status + Assigned */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Betreff oder Mandant suchen..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
              aria-label="Tickets suchen"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" aria-label="Status filtern">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="open">Offen</SelectItem>
                <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                <SelectItem value="closed">Geschlossen</SelectItem>
              </SelectContent>
            </Select>

            <Select value={assignedFilter} onValueChange={setAssignedFilter}>
              <SelectTrigger className="w-44" aria-label="Zuweisung filtern">
                <SelectValue placeholder="Alle Admins" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Admins</SelectItem>
                <SelectItem value="unassigned">Nicht zugewiesen</SelectItem>
                {admins.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Date range + Reset */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Von</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36 text-sm"
                aria-label="Datum von"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Bis</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36 text-sm"
                aria-label="Datum bis"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setStatusFilter('alle')
                setAssignedFilter('alle')
                setDateFrom('')
                setDateTo('')
              }}
              aria-label="Alle Filter zuruecksetzen"
            >
              <X className="mr-1 h-3 w-3" />
              Filter zuruecksetzen
            </Button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={fetchTickets}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Betreff</TableHead>
                  <TableHead>Mandant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zugewiesen</TableHead>
                  <TableHead>Erstellt</TableHead>
                  <TableHead>Letzte Aktivitaet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <TicketIcon className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-medium">Keine Tickets gefunden</p>
            <p className="text-sm text-muted-foreground">
              {search || statusFilter !== 'alle'
                ? 'Versuche andere Filterkriterien.'
                : 'Es gibt noch keine Support-Tickets.'}
            </p>
          </div>
        </div>
      )}

      {/* Unassigned section */}
      {!loading && !error && unassignedTickets.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
            Nicht zugewiesen ({unassignedTickets.length})
          </h3>
          <TicketTable
            tickets={unassignedTickets}
            onRowClick={(id) => router.push(`/admin/tickets/${id}`)}
          />
        </div>
      )}

      {/* Assigned / all tickets */}
      {!loading && !error && assignedTickets.length > 0 && (
        <div className="space-y-2">
          {unassignedTickets.length > 0 && (
            <h3 className="text-sm font-semibold text-muted-foreground">
              Zugewiesene Tickets ({assignedTickets.length})
            </h3>
          )}
          <TicketTable
            tickets={assignedTickets}
            onRowClick={(id) => router.push(`/admin/tickets/${id}`)}
          />
        </div>
      )}
    </div>
  )
}

function TicketTable({
  tickets,
  onRowClick,
}: {
  tickets: SupportTicket[]
  onRowClick: (id: string) => void
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Betreff</TableHead>
            <TableHead>Mandant</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Zugewiesen</TableHead>
            <TableHead>Erstellt</TableHead>
            <TableHead>Letzte Aktivitaet</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.map((t) => (
            <TableRow
              key={t.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => onRowClick(t.id)}
              role="link"
              aria-label={`Ticket: ${t.subject}`}
            >
              <TableCell className="font-medium max-w-xs truncate">
                {t.subject}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.mandant_name ?? '-'}
              </TableCell>
              <TableCell>
                <TicketStatusBadge status={t.status} />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {t.assigned_admin_email ?? (
                  <span className="text-amber-600 font-medium">Nicht zugewiesen</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(t.created_at)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {formatDateTime(t.updated_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
