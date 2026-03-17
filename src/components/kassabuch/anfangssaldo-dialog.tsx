'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'

interface AnfangssaldoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSaldo: number
  hatEintraege: boolean
  onSuccess: () => void
}

export function AnfangssaldoDialog({
  open,
  onOpenChange,
  currentSaldo,
  hatEintraege,
  onSuccess,
}: AnfangssaldoDialogProps) {
  const [saldo, setSaldo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setSaldo(currentSaldo.toFixed(2))
    }
  }, [open, currentSaldo])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const numericSaldo = parseFloat(saldo.replace(',', '.'))
    if (isNaN(numericSaldo)) {
      toast.error('Bitte geben Sie einen gueltigen Betrag ein.')
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/kassabuch/anfangssaldo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anfangssaldo: numericSaldo }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Anfangssaldo konnte nicht gespeichert werden')
      }

      toast.success('Anfangssaldo aktualisiert')
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Anfangssaldo festlegen</DialogTitle>
          <DialogDescription>
            Geben Sie den Anfangsbestand Ihrer Barkasse ein.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {hatEintraege && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Es gibt bereits Kassaeintraege. Eine Aenderung des Anfangssaldos
                wirkt sich auf den aktuellen Kassastand aus.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="anfangssaldo">Anfangssaldo (EUR)</Label>
            <Input
              id="anfangssaldo"
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={saldo}
              onChange={(e) => setSaldo(e.target.value)}
              required
              autoFocus
            />
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
            <Button type="submit" disabled={saving}>
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
