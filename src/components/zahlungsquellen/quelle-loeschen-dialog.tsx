'use client'

import { useState } from 'react'
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
import type { ZahlungsquelleWithMeta } from '@/app/(app)/settings/zahlungsquellen/page'

interface QuelleLoeschenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quelle: ZahlungsquelleWithMeta
  onDeleted: () => void
}

export function QuelleLoeschenDialog({
  open,
  onOpenChange,
  quelle,
  onDeleted,
}: QuelleLoeschenDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      const res = await fetch(`/api/zahlungsquellen/${quelle.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Fehler beim Löschen')
      }

      onOpenChange(false)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setDeleting(false)
    }
  }

  if (quelle.has_transactions) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Löschen nicht möglich</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Quelle hat Transaktionen und kann nicht gelöscht werden.
              Deaktivieren Sie die Quelle stattdessen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Verstanden</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Zahlungsquelle löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Die Zahlungsquelle &ldquo;{quelle.name}&rdquo; wird unwiderruflich
            gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? 'Löschen...' : 'Endgültig löschen'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
