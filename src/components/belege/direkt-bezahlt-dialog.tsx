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
import type { Beleg } from '@/lib/supabase/types'

interface DirektBezahltDialogProps {
  beleg: Beleg | null
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

function formatCurrency(value: number | null): string {
  if (value === null) return '-'
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

export function DirektBezahltDialog({
  beleg,
  open,
  onOpenChange,
  onSuccess,
}: DirektBezahltDialogProps) {
  const [datum, setDatum] = useState('')
  const [zahlungsart, setZahlungsart] = useState('')
  const [notiz, setNotiz] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reset form whenever dialog opens (useEffect is reliable across all open triggers)
  useEffect(() => {
    if (open && beleg) {
      setDatum(beleg.rechnungsdatum ?? new Date().toISOString().slice(0, 10))
      setZahlungsart('')
      setNotiz('')
    }
  }, [open, beleg])

  async function handleSubmit() {
    if (!beleg) return
    if (!zahlungsart) {
      toast.error('Bitte Zahlungsart auswaehlen.')
      return
    }
    if (!datum) {
      toast.error('Bitte Datum eingeben.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/belege/${beleg.id}/direkt-bezahlt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datum,
          zahlungsart,
          notiz: notiz.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Fehler beim Speichern')
      }

      toast.success('Beleg als direkt bezahlt markiert')
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  if (!beleg) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Direkt bezahlt</DialogTitle>
          <DialogDescription>
            Markieren Sie diesen Beleg als direkt bezahlt. Es wird automatisch ein Buchungseintrag erstellt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Bruttobetrag (read-only) */}
          <div className="space-y-1.5">
            <Label>Bruttobetrag</Label>
            <Input
              value={formatCurrency(beleg.bruttobetrag)}
              readOnly
              disabled
              className="bg-muted"
              aria-label="Bruttobetrag"
            />
          </div>

          {/* Datum */}
          <div className="space-y-1.5">
            <Label htmlFor="direkt-bezahlt-datum">Datum</Label>
            <Input
              id="direkt-bezahlt-datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              required
            />
          </div>

          {/* Zahlungsart */}
          <div className="space-y-1.5">
            <Label htmlFor="direkt-bezahlt-zahlungsart">Zahlungsart</Label>
            <Select value={zahlungsart} onValueChange={setZahlungsart}>
              <SelectTrigger id="direkt-bezahlt-zahlungsart" aria-label="Zahlungsart auswaehlen">
                <SelectValue placeholder="Zahlungsart auswaehlen..." />
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

          {/* Notiz */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="direkt-bezahlt-notiz">Notiz (optional)</Label>
              <span className="text-xs text-muted-foreground">
                {notiz.length}/100
              </span>
            </div>
            <Textarea
              id="direkt-bezahlt-notiz"
              placeholder="z.B. Bezahlt mit privater Bankomatkarte"
              value={notiz}
              onChange={(e) => {
                if (e.target.value.length <= 100) {
                  setNotiz(e.target.value)
                }
              }}
              maxLength={100}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !zahlungsart || !datum}
          >
            {submitting ? 'Wird gespeichert...' : 'Bestaetigen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
