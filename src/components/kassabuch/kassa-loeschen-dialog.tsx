'use client'

import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
  const [stornoGrund, setStornoGrund] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleStorno() {
    if (!eintrag) return
    if (!stornoGrund.trim()) {
      toast.error('Bitte geben Sie einen Stornogrund an.')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/kassabuch/eintraege/${eintrag.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storno_grund: stornoGrund.trim() }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Storno fehlgeschlagen')
      }

      toast.success('Kassaeintrag storniert')
      setStornoGrund('')
      onOpenChange(false)
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) setStornoGrund(''); onOpenChange(o) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Kassaeintrag stornieren?</AlertDialogTitle>
          <AlertDialogDescription>
            {eintrag && (
              <>
                Der Eintrag vom{' '}
                <span className="font-medium">{formatDate(eintrag.datum)}</span>{' '}
                ueber{' '}
                <span className="font-mono font-medium">{formatCurrency(eintrag.betrag)}</span>{' '}
                wird durch eine Gegenbuchung (Storno) korrigiert. Der urspruengliche Eintrag
                bleibt im Kassabuch erhalten (§ 131 BAO).
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 px-1">
          <Label htmlFor="storno-grund">Stornogrund <span className="text-destructive">*</span></Label>
          <Textarea
            id="storno-grund"
            placeholder="z.B. Falscher Betrag erfasst – Korrektur durch Max Mustermann"
            value={stornoGrund}
            onChange={(e) => setStornoGrund(e.target.value)}
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Pflichtfeld gem. § 131 BAO. Wird in der Stornobuchung gespeichert.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving} onClick={() => setStornoGrund('')}>
            Abbrechen
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleStorno}
            disabled={saving || !stornoGrund.trim()}
          >
            {saving ? 'Wird storniert...' : 'Stornieren'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
