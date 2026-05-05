'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface BulkDirektBezahltDialogProps {
  belegIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const zahlungsartOptions = [
  { value: 'Bar', label: 'Bar' },
  { value: 'Bankomat (privat)', label: 'Bankomat (privat)' },
  { value: 'Kreditkarte (privat)', label: 'Kreditkarte (privat)' },
  { value: 'Sonstige', label: 'Sonstige' },
] as const

export function BulkDirektBezahltDialog({
  belegIds,
  open,
  onOpenChange,
  onSuccess,
}: BulkDirektBezahltDialogProps) {
  const [datum, setDatum] = useState('')
  const [zahlungsart, setZahlungsart] = useState('')
  const [notiz, setNotiz] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setDatum(new Date().toISOString().slice(0, 10))
      setZahlungsart('')
      setNotiz('')
    }
  }, [open])

  async function handleSubmit() {
    if (!zahlungsart) {
      toast.error('Bitte Zahlungsart auswählen.')
      return
    }
    if (!datum) {
      toast.error('Bitte Datum eingeben.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/belege/bulk/direkt-bezahlt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: belegIds,
          datum,
          zahlungsart,
          notiz: notiz.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error ?? 'Fehler beim Speichern')
      }

      const { succeeded, skipped, errors } = data as {
        succeeded: number
        skipped: number
        errors: { id: string; error: string }[]
      }

      if (succeeded > 0) {
        toast.success(
          `${succeeded} Beleg${succeeded !== 1 ? 'e' : ''} als direkt bezahlt markiert` +
          (skipped > 0 ? ` (${skipped} bereits zugeordnet, übersprungen)` : '')
        )
      } else if (skipped > 0) {
        toast.info(`Alle ausgewählten Belege sind bereits zugeordnet.`)
      }

      if (errors.length > 0) {
        toast.error(`${errors.length} Beleg${errors.length !== 1 ? 'e' : ''} konnten nicht verarbeitet werden.`)
      }

      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Direkt bezahlt – {belegIds.length} Belege</DialogTitle>
          <DialogDescription>
            Markiert alle ausgewählten offenen Belege als direkt bezahlt. Für jeden Beleg wird ein Buchungseintrag erstellt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-direkt-bezahlt-datum">Datum</Label>
            <Input
              id="bulk-direkt-bezahlt-datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-direkt-bezahlt-zahlungsart">Zahlungsart</Label>
            <Select value={zahlungsart} onValueChange={setZahlungsart}>
              <SelectTrigger id="bulk-direkt-bezahlt-zahlungsart" aria-label="Zahlungsart auswählen">
                <SelectValue placeholder="Zahlungsart auswählen..." />
              </SelectTrigger>
              <SelectContent>
                {zahlungsartOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="bulk-direkt-bezahlt-notiz">Notiz (optional)</Label>
              <span className="text-xs text-muted-foreground">{notiz.length}/100</span>
            </div>
            <Textarea
              id="bulk-direkt-bezahlt-notiz"
              placeholder="z.B. Bezahlt mit privater Bankomatkarte"
              value={notiz}
              onChange={(e) => {
                if (e.target.value.length <= 100) setNotiz(e.target.value)
              }}
              maxLength={100}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !zahlungsart || !datum}>
            {submitting ? 'Wird verarbeitet...' : `${belegIds.length} Belege bestätigen`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
