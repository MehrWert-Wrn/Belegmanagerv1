'use client'

import { useState } from 'react'
import { Lock, AlertTriangle, Loader2 } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { getMonatsname } from '@/lib/monatsabschluss-types'

interface AbschlussDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jahr: number
  monat: number
  anzahlOffen: number
  onAbgeschlossen: () => void
}

export function AbschlussDialog({
  open,
  onOpenChange,
  jahr,
  monat,
  anzahlOffen,
  onAbgeschlossen,
}: AbschlussDialogProps) {
  const [loading, setLoading] = useState(false)
  const [doubleConfirmed, setDoubleConfirmed] = useState(false)

  const requiresDoubleConfirm = anzahlOffen > 10
  const hasWarning = anzahlOffen > 0

  async function handleAbschliessen() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/monatsabschluss/${jahr}/${monat}/schliessen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: requiresDoubleConfirm }),
        }
      )

      if (!response.ok) {
        const data = await response.json()
        if (data.error === 'double_confirm_required') {
          toast.error(data.message)
          return
        }
        throw new Error(data.error ?? 'Monatsabschluss fehlgeschlagen')
      }

      toast.success(`${getMonatsname(monat)} ${jahr} erfolgreich abgeschlossen.`)
      onOpenChange(false)
      onAbgeschlossen()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!loading) {
      setDoubleConfirmed(false)
      onOpenChange(newOpen)
    }
  }

  const canClose = !requiresDoubleConfirm || doubleConfirmed

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Monat abschliessen
          </DialogTitle>
          <DialogDescription>
            {getMonatsname(monat)} {jahr} wird abgeschlossen und gesperrt.
            Danach koennen keine Aenderungen mehr vorgenommen werden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Warning for open transactions */}
          {hasWarning && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {anzahlOffen} offene Positionen
                </p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  {anzahlOffen > 10
                    ? 'Es gibt eine grosse Anzahl offener Transaktionen ohne Belegzuordnung. Bitte bestaetige, dass du den Monat trotzdem abschliessen moechtest.'
                    : 'Einige Transaktionen haben noch keine Belegzuordnung. Du kannst den Monat trotzdem abschliessen.'}
                </p>
              </div>
            </div>
          )}

          {/* No warning - all good */}
          {!hasWarning && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Alle Transaktionen sind zugeordnet. Der Monat kann abgeschlossen werden.
            </div>
          )}

          {/* Double confirm checkbox for > 10 open transactions */}
          {requiresDoubleConfirm && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
              <Checkbox
                id="double-confirm"
                checked={doubleConfirmed}
                onCheckedChange={(checked) => setDoubleConfirmed(checked === true)}
                className="mt-0.5"
              />
              <label
                htmlFor="double-confirm"
                className="text-sm text-red-700 dark:text-red-300 cursor-pointer"
              >
                Ich bestaetige, dass ich den Monat mit {anzahlOffen} offenen
                Positionen abschliessen moechte. Diese bleiben im Export als
                nicht zugeordnet markiert.
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleAbschliessen}
            disabled={loading || !canClose}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            Monat abschliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
