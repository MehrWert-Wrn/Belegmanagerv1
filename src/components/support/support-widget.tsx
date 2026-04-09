'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, X, Send, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export function SupportWidget() {
  const [open, setOpen] = useState(false)
  // Badge deliberately hidden until chatbot unread-message logic is implemented
  // const [openTicketCount, setOpenTicketCount] = useState(0)

  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Badge fetch removed – will be re-enabled when chatbot unread logic is ready

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedSubject = subject.trim()
    const trimmedMessage = message.trim()

    if (!trimmedSubject || !trimmedMessage || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: trimmedSubject,
          message: trimmedMessage,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Ticket konnte nicht erstellt werden')
      }

      setSubmitted(true)
      setSubject('')
      setMessage('')

      // Reset after a few seconds
      setTimeout(() => {
        setSubmitted(false)
        setOpen(false)
      }, 3000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg transition-transform hover:scale-105 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        aria-label={open ? 'Support-Chat schliessen' : 'Support kontaktieren'}
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <MessageCircle className="h-6 w-6" />
        )}
      </button>

      {/* Widget panel */}
      {open && (
        <Card className="fixed bottom-24 right-6 z-40 w-80 shadow-xl sm:w-96 animate-in slide-in-from-bottom-4 fade-in duration-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Support kontaktieren</CardTitle>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100">
                  <Check className="h-6 w-6 text-teal-700" />
                </div>
                <div>
                  <p className="font-medium">Ticket wurde erstellt</p>
                  <p className="text-sm text-muted-foreground">
                    Wir melden uns bald bei dir.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="support-subject" className="text-xs font-medium text-muted-foreground">
                    Betreff
                  </label>
                  <Input
                    id="support-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Worum geht es?"
                    disabled={submitting}
                    maxLength={200}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="support-message" className="text-xs font-medium text-muted-foreground">
                    Nachricht
                  </label>
                  <Textarea
                    id="support-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Beschreibe dein Anliegen..."
                    className="min-h-[100px] resize-none"
                    disabled={submitting}
                    maxLength={2000}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!subject.trim() || !message.trim() || submitting}
                >
                  {submitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Ticket senden
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
