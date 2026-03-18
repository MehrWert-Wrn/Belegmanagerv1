'use client'

import { useState, useEffect, useCallback } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import type { TransaktionsKommentar } from '@/lib/supabase/types'

interface KommentareSectionProps {
  transaktionId: string
}

const MAX_CHARS = 500

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncateEmail(email: string) {
  if (email.length <= 20) return email
  const [local, domain] = email.split('@')
  if (!domain) return email.slice(0, 20) + '...'
  const truncatedLocal = local.length > 8 ? local.slice(0, 8) + '...' : local
  return `${truncatedLocal}@${domain}`
}

export function KommentareSection({ transaktionId }: KommentareSectionProps) {
  const [kommentare, setKommentare] = useState<TransaktionsKommentar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchKommentare = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/transaktionen/${transaktionId}/kommentare`
      )
      if (!response.ok) throw new Error('Kommentare konnten nicht geladen werden')
      const data = await response.json()
      setKommentare(data.data ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [transaktionId])

  useEffect(() => {
    fetchKommentare()
  }, [fetchKommentare])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      const response = await fetch(
        `/api/transaktionen/${transaktionId}/kommentare`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        throw new Error(
          errorData?.error ?? 'Kommentar konnte nicht gespeichert werden'
        )
      }

      const { data: newKommentar } = await response.json()
      setKommentare((prev) => [...prev, newKommentar])
      setText('')
      toast.success('Kommentar hinzugefuegt')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  const charCount = text.length
  const isOverLimit = charCount > MAX_CHARS
  const canSubmit = text.trim().length > 0 && !isOverLimit && !submitting

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Kommentare</h3>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
          <Button
            variant="link"
            size="sm"
            className="ml-1 h-auto p-0 text-xs text-destructive underline"
            onClick={fetchKommentare}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && kommentare.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          Noch keine Kommentare vorhanden.
        </p>
      )}

      {/* Comment list */}
      {!loading && !error && kommentare.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {kommentare.map((k) => (
            <div
              key={k.id}
              className="rounded-md border bg-muted/30 p-2.5 space-y-1"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">
                  {truncateEmail(k.user_email)}
                  {k.is_own && (
                    <span className="ml-1 text-[10px] opacity-70">(Du)</span>
                  )}
                </span>
                <time dateTime={k.created_at}>{formatTimestamp(k.created_at)}</time>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{k.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* New comment form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kommentar hinzufuegen..."
            maxLength={MAX_CHARS}
            className="min-h-[60px] resize-none text-sm"
            disabled={submitting}
          />
          <div className="flex justify-end mt-1">
            <span
              className={`text-[10px] ${
                isOverLimit
                  ? 'text-destructive font-medium'
                  : charCount > MAX_CHARS * 0.9
                    ? 'text-amber-500'
                    : 'text-muted-foreground'
              }`}
            >
              {charCount} / {MAX_CHARS}
            </span>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Senden
          </Button>
        </div>
      </form>
    </div>
  )
}
