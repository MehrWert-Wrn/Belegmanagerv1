'use client'

import { useState } from 'react'
import { LockOpen, AlertTriangle, Loader2 } from 'lucide-react'
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
import { getMonatsname } from '@/lib/monatsabschluss-types'

interface WiedereroeffnenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jahr: number
  monat: number
  datevExportVorhanden?: boolean
  isEar?: boolean
  onWiedergeoeffnet: () => void
}

export function WiedereroeffnenDialog({
  open,
  onOpenChange,
  jahr,
  monat,
  datevExportVorhanden,
  isEar = false,
  onWiedergeoeffnet,
}: WiedereroeffnenDialogProps) {
  const [loading, setLoading] = useState(false)

  async function handleWiedereroeffnen() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/monatsabschluss/${jahr}/${monat}/oeffnen`,
        { method: 'POST' }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Wiederoeffnung fehlgeschlagen')
      }

      toast.success(`${getMonatsname(monat)} ${jahr} wurde wiedergeoeffnet.`)
      onOpenChange(false)
      onWiedergeoeffnet()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!loading) onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockOpen className="h-5 w-5" />
            Monat wiederoeffnen
          </DialogTitle>
          <DialogDescription>
            {getMonatsname(monat)} {jahr} wird entsperrt.
            Transaktionen und Zuordnungen koennen dann wieder bearbeitet werden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {datevExportVorhanden && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  DATEV-Export vorhanden
                </p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  Fuer diesen Monat wurde bereits ein DATEV-Export erstellt.
                  Durch die Wiederoeffnung kann der bestehende Export ungueltig werden.
                  Ein neuer Export muss nach Abschluss der Aenderungen erstellt werden.
                </p>
              </div>
            </div>
          )}

          {isEar && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  EAR-Buchungsnummern
                </p>
                <p className="mt-0.5 text-amber-700 dark:text-amber-300">
                  Alle Buchungsnummern dieses Monats werden zurueckgesetzt und
                  umbenannte Belegdateien erhalten ihren Originalnamen zurueck.
                </p>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
            Nach der Wiederoeffnung hat der Monat den Status &quot;In Bearbeitung&quot;.
            Du kannst ihn jederzeit erneut abschliessen.
          </div>
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
            variant="destructive"
            onClick={handleWiedereroeffnen}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LockOpen className="mr-2 h-4 w-4" />
            )}
            Monat wiederoeffnen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
