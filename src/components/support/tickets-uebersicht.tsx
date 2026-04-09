'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { TicketIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { SupportTicket, TicketStatus } from '@/lib/admin-types'

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function TicketStatusBadge({ status }: { status: TicketStatus }) {
  switch (status) {
    case 'open':
      return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-[10px]">Offen</Badge>
    case 'in_progress':
      return <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 text-[10px]">In Bearbeitung</Badge>
    case 'closed':
      return <Badge variant="secondary" className="text-[10px]">Geschlossen</Badge>
    default:
      return <Badge variant="secondary" className="text-[10px]">{status}</Badge>
  }
}

export function TicketsUebersicht() {
  const router = useRouter()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTickets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tickets')
      if (!res.ok) throw new Error('Tickets konnten nicht geladen werden')
      const data = await res.json()
      setTickets(data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTickets()
  }, [fetchTickets])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TicketIcon className="h-4 w-4" />
              Support-Tickets
            </CardTitle>
            <CardDescription>Deine Support-Anfragen</CardDescription>
          </div>
          {tickets.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => router.push('/support/tickets/' + tickets[0]?.id)}
            >
              Alle anzeigen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="text-sm text-destructive">
            {error}
            <Button variant="link" size="sm" className="ml-1 p-0 h-auto text-destructive" onClick={fetchTickets}>
              Erneut versuchen
            </Button>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && tickets.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Du hast noch keine Support-Tickets.
          </p>
        )}

        {/* Ticket list */}
        {!loading && !error && tickets.length > 0 && (
          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => (
              <div
                key={ticket.id}
                className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => router.push(`/support/tickets/${ticket.id}`)}
                role="link"
                aria-label={`Ticket: ${ticket.subject}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{ticket.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    Erstellt {formatDate(ticket.created_at)}
                    {ticket.updated_at !== ticket.created_at && (
                      <> &middot; Letzte Aktivität {formatDate(ticket.updated_at)}</>
                    )}
                  </p>
                </div>
                <TicketStatusBadge status={ticket.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
