'use client'

import { useState } from 'react'
import type { BenutzerListItem } from '@/lib/supabase/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface RolleAendernDialogProps {
  user: BenutzerListItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function RolleAendernDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: RolleAendernDialogProps) {
  const [rolle, setRolle] = useState<'admin' | 'buchhalter'>(user.rolle)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rolle === user.rolle) {
      onOpenChange(false)
      return
    }

    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/benutzer/${user.id}/rolle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolle }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Fehler beim Aendern der Rolle')
        setLoading(false)
        return
      }

      setLoading(false)
      onSuccess()
    } catch {
      setError('Netzwerkfehler')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Rolle aendern</DialogTitle>
          <DialogDescription>
            Rolle fuer <strong>{user.email}</strong> aendern
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {error && (
              <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Neue Rolle</Label>
              <Select value={rolle} onValueChange={(v) => setRolle(v as 'admin' | 'buchhalter')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buchhalter">Buchhalter</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={loading || rolle === user.rolle}>
              {loading ? 'Speichern...' : 'Rolle aendern'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
