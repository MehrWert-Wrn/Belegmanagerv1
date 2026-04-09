'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Loader2, UserCircle, Shield } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Card,
  CardContent,
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

interface AdminTicketDetailProps {
  ticketId: string
}

export function AdminTicketDetail({ ticketId }: AdminTicketDetailProps) {
  const router = useRouter()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [ticket, setTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages] = useState<SupportTicketMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [replyText, setReplyText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  const fetchTicket = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`)
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
      const res = await fetch(`/api/admin/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Antwort konnte nicht gesendet werden')
      }

      const newMessage = await res.json()
      setMessages((prev) => [...prev, newMessage])
      setReplyText('')
      toast.success('Antwort gesendet')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleStatusChange(newStatus: TicketStatus) {
    if (!ticket) return
    setStatusChanging(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Status konnte nicht geaendert werden')
      }

      setTicket({ ...ticket, status: newStatus })
      toast.success(`Status geaendert auf: ${newStatus === 'open' ? 'Offen' : newStatus === 'in_progress' ? 'In Bearbeitung' : 'Geschlossen'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setStatusChanging(false)
    }
  }

  async function handleAssignToMe() {
    if (!ticket) return
    setStatusChanging(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assign_to_me: true }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Zuweisung fehlgeschlagen')
      }

      toast.success('Ticket dir zugewiesen')
      fetchTicket()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setStatusChanging(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div>
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push('/admin/tickets')}>
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
          <Button variant="ghost" size="icon" onClick={() => router.push('/admin/tickets')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{ticket.subject}</h1>
            <p className="text-sm text-muted-foreground">
              {ticket.mandant_name ?? 'Mandant'} &middot; {formatDateTime(ticket.created_at)}
            </p>
          </div>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Message thread */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Noch keine Nachrichten.
                  </p>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}
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
                          {msg.sender_type === 'admin' ? 'Admin' : 'Mandant'}
                          {msg.sender_email && ` (${msg.sender_email})`}
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
                  placeholder="Antwort schreiben..."
                  className="min-h-[80px] resize-none"
                  disabled={submitting}
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
                    Antwort senden
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: Ticket meta */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ticket-Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select
                  value={ticket.status}
                  onValueChange={(v) => handleStatusChange(v as TicketStatus)}
                  disabled={statusChanging}
                >
                  <SelectTrigger aria-label="Ticket-Status aendern">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Offen</SelectItem>
                    <SelectItem value="in_progress">In Bearbeitung</SelectItem>
                    <SelectItem value="closed">Geschlossen</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Zugewiesen an</label>
                <p className="text-sm">
                  {ticket.assigned_admin_email ?? (
                    <span className="text-amber-600">Nicht zugewiesen</span>
                  )}
                </p>
                {!ticket.assigned_to_admin_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAssignToMe}
                    disabled={statusChanging}
                    className="mt-1 w-full"
                  >
                    Mir zuweisen
                  </Button>
                )}
              </div>

              <Separator />

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Mandant</label>
                <p className="text-sm font-medium">{ticket.mandant_name ?? '-'}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Erstellt am</label>
                <p className="text-sm">{formatDateTime(ticket.created_at)}</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Letzte Aktivitaet</label>
                <p className="text-sm">{formatDateTime(ticket.updated_at)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
