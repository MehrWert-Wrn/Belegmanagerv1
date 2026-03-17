'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface EinladungsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EinladungsDialog({ open, onOpenChange, onSuccess }: EinladungsDialogProps) {
  const [email, setEmail] = useState('')
  const [rolle, setRolle] = useState<'admin' | 'buchhalter'>('buchhalter')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    setLoading(true)

    try {
      const res = await fetch('/api/benutzer/einladen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, rolle }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Fehler beim Einladen')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)

      // Close dialog and refresh after short delay
      setTimeout(() => {
        setEmail('')
        setRolle('buchhalter')
        setSuccess(false)
        onOpenChange(false)
        onSuccess()
      }, 1500)
    } catch {
      setError('Netzwerkfehler')
      setLoading(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setEmail('')
      setRolle('buchhalter')
      setError(null)
      setSuccess(false)
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Benutzer einladen</DialogTitle>
          <DialogDescription>
            Senden Sie eine Einladung per E-Mail. Der Benutzer erhaelt einen Link zur Registrierung.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <div className="rounded-md bg-emerald-50 text-emerald-800 text-sm px-4 py-3">
              Einladung wurde erfolgreich gesendet an <strong>{email}</strong>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              {error && (
                <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="invite-email">E-Mail-Adresse</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="benutzer@firma.at"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Rolle</Label>
                <Select value={rolle} onValueChange={(v) => setRolle(v as 'admin' | 'buchhalter')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buchhalter">Buchhalter</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Buchhalter: Kann Belege und Transaktionen verwalten. Admin: Voller Zugriff inkl. Einstellungen.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={loading || !email}>
                {loading ? 'Wird gesendet...' : 'Einladung senden'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
