'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

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
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { Beleg } from '@/lib/supabase/types'

interface BelegLoeschenDialogProps {
  beleg: Beleg | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

export function BelegLoeschenDialog({
  beleg,
  open,
  onOpenChange,
  onDeleted,
}: BelegLoeschenDialogProps) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!beleg) return
    setDeleting(true)

    try {
      const response = await fetch(`/api/belege/${beleg.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const err = await response.json()
        toast.error(`Fehler beim Loschen: ${err.error || 'Unbekannter Fehler'}`)
        return
      }

      toast.success('Beleg wurde geloscht')
      onOpenChange(false)
      onDeleted()
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setDeleting(false)
    }
  }

  const isMatched = beleg?.zuordnungsstatus === 'zugeordnet'

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Beleg loschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Mochten Sie den Beleg &quot;{beleg?.original_filename}&quot; wirklich loschen?
            Diese Aktion kann nicht ruckgangig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isMatched && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Dieser Beleg ist bereits einer Transaktion zugeordnet.
              Die Zuordnung wird aufgehoben, wenn Sie fortfahren.
            </AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleDelete()
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Loschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
