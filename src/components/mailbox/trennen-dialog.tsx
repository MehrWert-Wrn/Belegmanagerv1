'use client'

/**
 * PROJ-32: TrennenDialog - Bestaetigungs-Dialog vor dem Trennen
 *
 * Loescht die Verbindung hard (inkl. encrypted_payload). Bereits importierte
 * Belege bleiben unveraendert in der Belegliste.
 */

import { ReactNode, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface TrennenDialogProps {
  /** Provider-Beschriftung fuer Dialog-Text. */
  providerLabel: string
  /** Wird aufgerufen wenn der Mandant tatsaechlich trennen moechte. */
  onTrennen: () => Promise<void>
  /** Trigger-Element (Button). */
  children: ReactNode
}

export function TrennenDialog({ providerLabel, onTrennen, children }: TrennenDialogProps) {
  const [offen, setOffen] = useState(false)
  const [laedt, setLaedt] = useState(false)

  async function handleConfirm() {
    setLaedt(true)
    try {
      await onTrennen()
      setOffen(false)
    } finally {
      setLaedt(false)
    }
  }

  return (
    <AlertDialog open={offen} onOpenChange={setOffen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Verbindung trennen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Verbindung zu {providerLabel} wird getrennt. Bereits importierte Belege bleiben in
            der Belegliste erhalten - es werden jedoch keine neuen Mails mehr importiert.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={laedt}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={laedt}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {laedt ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Trennen...
              </>
            ) : (
              'Trennen'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
