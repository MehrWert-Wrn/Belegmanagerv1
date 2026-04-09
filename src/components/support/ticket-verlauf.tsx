'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Loader2, UserCircle, Shield } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type { SupportTicket, SupportTicketMessage, TicketStatus } from '@/lib/admin-types'

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

interface TicketVerlaufProps {
  ticketId: string
}

export function TicketVerlauf({ ticketId }: TicketVerlaufProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportTicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchTicket = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tickets/${ticketId}`)
      if (!res.ok) throw new Error('Ticket konnte nicht geladen werden')
      const data = await res.json()
      setTicket(data.ticket)
      setMessages(data.messages ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    fetchTicket()
  }, [fetchTicket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = replyText.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Nachricht konnte nicht gesendet werden')
      }

      const newMessage = await res.json()
      setMessages((prev) => [...prev, newMessage])
      setReplyText('')

      // If ticket was closed, it reopens automatically
      if (ticket?.status === 'closed') {
        setTicket({ ...ticket, status: 'open' })
      }

      toast.success('Nachricht gesendet')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-64" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurueck
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="link" className="mt-2 text-destructive" onClick={fetchTicket}>
            Erneut versuchen
          </Button>
        </div>
      </div>
    )
  }

  if (!ticket) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <p className="text-sm text-muted-foreground">
              Erstellt am {formatDateTime(ticket.created_at)}
            </p>
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>

      {/* Messages */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Nachrichtenverlauf</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Noch keine Nachrichten.
              </p>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender_type === 'admin' ? '' : 'flex-row-reverse'}`}
              >
                <div className="shrink-0 pt-0.5">
                  {msg.sender_type === 'admin' ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-100">
                      <Shield className="h-4 w-4 text-teal-700" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                      <UserCircle className="h-4 w-4 text-gray-600" />
                    </div>
                  )}
                </div>
                <div
                  className={`flex-1 rounded-lg p-3 ${
                    msg.sender_type === 'admin'
                      ? 'bg-teal-50 border border-teal-200'
                      : 'bg-muted/50 border'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="font-medium">
                      {msg.sender_type === 'admin' ? 'Support-Team' : 'Du'}
                    </span>
                    <time dateTime={msg.created_at}>{formatDateTime(msg.created_at)}</time>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Reply form */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleReply} className="space-y-3">
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Nachricht schreiben..."
              className="min-h-[80px] resize-none"
              disabled={submitting}
              maxLength={2000}
            />
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={!replyText.trim() || submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Nachricht senden
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
