'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Scale, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface KassenpruefungDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function KassenpruefungDialog({
  open,
  onOpenChange,
  onSuccess,
}: KassenpruefungDialogProps) {
  const [istBestandInput, setIstBestandInput] = useState('')
  const [begruendung, setBegruendung] = useState('')
  const [saving, setSaving] = useState(false)
  // BUG-PROJ7-18: Buchbestand direkt beim Öffnen fetchen statt als Prop
  const [buchbestand, setBuchbestand] = useState(0)
  const [buchbestandLoading, setBuchbestandLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setIstBestandInput('')
      setBegruendung('')
      setBuchbestandLoading(true)
      fetch('/api/kassabuch/saldo')
        .then(r => r.json())
        .then(d => setBuchbestand(d.aktueller_saldo ?? 0))
        .catch(() => setBuchbestand(0))
        .finally(() => setBuchbestandLoading(false))
    }
  }, [open])

  const istBestand = useMemo(() => {
    const normalized = istBestandInput.replace(',', '.').trim()
    if (normalized === '') return null
    const parsed = parseFloat(normalized)
    return isNaN(parsed) ? null : parsed
  }, [istBestandInput])

  const differenz = useMemo(() => {
    if (istBestand === null) return null
    return Math.round((istBestand - buchbestand) * 100) / 100
  }, [istBestand, buchbestand])

  const hasDiff = differenz !== null && differenz !== 0
  const diffPositiv = differenz !== null && differenz > 0
  const diffNegativ = differenz !== null && differenz < 0
  const diffNull = differenz === 0
  const istBestandInvalid = istBestand !== null && istBestand < 0
  const begruendungMissing = hasDiff && begruendung.trim().length < 5

  async function handleSubmit() {
    if (istBestand === null || istBestandInvalid) {
      toast.error('Bitte geben Sie einen gültigen Ist-Bestand ein (≥ 0).')
      return
    }
    if (begruendungMissing) {
      toast.error('Bitte geben Sie eine Begründung ein (min. 5 Zeichen).')
      return
    }

    setSaving(true)
    try {
      // TODO (Backend): Implement API route
      //   POST /api/kassabuch/kassenpruefung
      //   Body: { istbestand, begruendung? }
      //   Creates kassa_pruefungen entry and optional DIFFERENZ transaktion
      //   Rejects when month is locked, ist_bestand < 0, or diff would break balance
      const response = await fetch('/api/kassabuch/kassenpruefung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          istbestand: istBestand,
          begruendung: hasDiff ? begruendung.trim() : null,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Kassenprüfung konnte nicht gespeichert werden')
      }

      if (diffNull) {
        toast.success('Kassenprüfung protokolliert – Kassastand stimmt überein')
      } else {
        toast.success('Kassenprüfung gespeichert – Differenzbuchung erstellt')
      }
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-teal-600" />
            Kassenprüfung / Bargeldzählung
          </DialogTitle>
          <DialogDescription>
            Vergleichen Sie den physischen Kassenbestand mit dem Buchbestand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Buchbestand (Soll) */}
          <div className="rounded-lg border bg-muted/50 p-3">
            <Label className="text-xs font-medium text-muted-foreground">
              Buchbestand (Soll)
            </Label>
            <p className="mt-1 font-mono text-lg font-semibold">
              {buchbestandLoading ? '…' : formatCurrency(buchbestand)}
            </p>
          </div>

          {/* Ist-Bestand Eingabe */}
          <div className="space-y-2">
            <Label htmlFor="ist-bestand">
              Ist-Bestand (gezähltes Bargeld) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ist-bestand"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={istBestandInput}
              onChange={(e) => setIstBestandInput(e.target.value)}
              className={istBestandInvalid ? 'border-destructive' : ''}
              autoFocus
            />
            {istBestandInvalid && (
              <p className="text-xs text-destructive">
                Bargeld kann nicht negativ sein.
              </p>
            )}
          </div>

          {/* Differenz-Anzeige */}
          {differenz !== null && !istBestandInvalid && (
            <div
              className={`rounded-lg border p-3 ${
                diffNull
                  ? 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950'
                  : diffPositiv
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
                    : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {diffNull && <CheckCircle2 className="h-4 w-4 text-teal-600" />}
                {diffPositiv && <TrendingUp className="h-4 w-4 text-amber-600" />}
                {diffNegativ && <TrendingDown className="h-4 w-4 text-red-600" />}
                <Label className="text-xs font-medium">Differenz (Ist − Soll)</Label>
              </div>
              <p
                className={`mt-1 font-mono text-lg font-semibold ${
                  diffNull
                    ? 'text-teal-700 dark:text-teal-300'
                    : diffPositiv
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-red-700 dark:text-red-300'
                }`}
              >
                {differenz > 0 ? '+' : ''}
                {formatCurrency(differenz)}
              </p>
              {diffNull && (
                <p className="mt-1 text-xs text-teal-700 dark:text-teal-300">
                  Kassastand stimmt überein – keine Buchung nötig.
                </p>
              )}
              {hasDiff && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Eine DIFFERENZ-Buchung wird automatisch erstellt.
                </p>
              )}
            </div>
          )}

          {/* Begründung (nur bei Differenz ≠ 0) */}
          {hasDiff && (
            <div className="space-y-2">
              <Label htmlFor="pruefung-begruendung">
                Begründung <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="pruefung-begruendung"
                placeholder="z.B. Wechselgeldfehler bei Kundenkassa, fehlende Quittung für Kleinstbetrag …"
                value={begruendung}
                onChange={(e) => setBegruendung(e.target.value)}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                Min. 5 Zeichen. Wird in der Differenzbuchung protokolliert.
              </p>
            </div>
          )}

          {hasDiff && (
            <Alert>
              <AlertDescription className="text-xs">
                Die Prüfung wird mit Datum, Uhrzeit und Benutzer protokolliert (§ 131 BAO).
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              saving ||
              istBestand === null ||
              istBestandInvalid ||
              begruendungMissing
            }
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              'Prüfung speichern'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
