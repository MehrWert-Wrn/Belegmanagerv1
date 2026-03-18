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

interface BelegLoeschenDialogSingleProps {
  mode?: 'single'
  beleg: Beleg | null
  belegIds?: never
  belegCount?: never
  hasMatchedBelege?: never
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

interface BelegLoeschenDialogBulkProps {
  mode: 'bulk'
  beleg?: never
  belegIds: string[]
  belegCount: number
  hasMatchedBelege: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}

type BelegLoeschenDialogProps = BelegLoeschenDialogSingleProps | BelegLoeschenDialogBulkProps

export function BelegLoeschenDialog(props: BelegLoeschenDialogProps) {
  const { open, onOpenChange, onDeleted } = props
  const [deleting, setDeleting] = useState(false)

  const isBulk = props.mode === 'bulk'

  async function handleDelete() {
    setDeleting(true)

    try {
      if (isBulk) {
        const response = await fetch('/api/belege', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: props.belegIds }),
        })

        if (!response.ok) {
          const err = await response.json()
          toast.error(`Fehler beim Loschen: ${err.error || 'Unbekannter Fehler'}`)
          return
        }

        toast.success(`${props.belegCount} Belege wurden geloscht`)
      } else {
        if (!props.beleg) return

        const response = await fetch(`/api/belege/${props.beleg.id}`, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const err = await response.json()
          toast.error(`Fehler beim Loschen: ${err.error || 'Unbekannter Fehler'}`)
          return
        }

        toast.success('Beleg wurde geloscht')
      }

      onOpenChange(false)
      onDeleted()
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setDeleting(false)
    }
  }

  const showMatchWarning = isBulk
    ? props.hasMatchedBelege
    : props.beleg?.zuordnungsstatus === 'zugeordnet'

  const title = isBulk
    ? `${props.belegCount} Belege loschen?`
    : 'Beleg loschen?'

  const description = isBulk
    ? `Moechten Sie wirklich ${props.belegCount} Belege loschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`
    : `Moechten Sie den Beleg "${props.beleg?.rechnungsname || props.beleg?.original_filename}" wirklich loschen? Diese Aktion kann nicht rueckgaengig gemacht werden.`

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {showMatchWarning && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {isBulk
                ? 'Einige der ausgewaehlten Belege sind bereits Transaktionen zugeordnet. Die Zuordnungen werden aufgehoben, wenn Sie fortfahren.'
                : 'Dieser Beleg ist bereits einer Transaktion zugeordnet. Die Zuordnung wird aufgehoben, wenn Sie fortfahren.'}
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
