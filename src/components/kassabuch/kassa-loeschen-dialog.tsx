'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { KassaEintrag } from '@/components/kassabuch/kassabuch-tabelle'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface KassaLoeschenDialogProps {
  eintrag: KassaEintrag | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function KassaLoeschenDialog({
  eintrag,
  open,
  onOpenChange,
  onDeleted,
}: KassaLoeschenDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!eintrag) return

    setDeleting(true)

    try {
      const response = await fetch(
        `/api/kassabuch/eintraege/${eintrag.id}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Eintrag konnte nicht geloescht werden')
      }

      toast.success('Kassaeintrag geloescht')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kassaeintrag loeschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {eintrag && (
              <>
                Moechten Sie den Eintrag vom{' '}
                <span className="font-medium">
                  {formatDate(eintrag.datum)}
                </span>{' '}
                ueber{' '}
                <span className="font-medium font-mono">
                  {formatCurrency(eintrag.betrag)}
                </span>{' '}
                wirklich loeschen? Der Kassastand wird entsprechend angepasst.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Wird geloescht...' : 'Loeschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
