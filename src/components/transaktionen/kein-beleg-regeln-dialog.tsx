'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'

interface KeinBelegRegel {
  id: string
  pattern: string
  erstellt_am: string
}

interface KeinBelegRegelnDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefillPattern?: string
  onRuleCreated?: () => void
}

export function KeinBelegRegelnDialog({ open, onOpenChange, prefillPattern, onRuleCreated }: KeinBelegRegelnDialogProps) {
  const [regeln, setRegeln] = useState<KeinBelegRegel[]>([])
  const [loading, setLoading] = useState(false)
  const [newPattern, setNewPattern] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadRegeln()
      if (prefillPattern) setNewPattern(prefillPattern)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillPattern])

  async function loadRegeln() {
    setLoading(true)
    try {
      const res = await fetch('/api/kein-beleg-regeln')
      if (res.ok) setRegeln(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    const pattern = newPattern.trim()
    if (pattern.length < 2) {
      toast.error('Mindestens 2 Zeichen erforderlich')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/kein-beleg-regeln', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Fehler')
      }
      const created = await res.json()
      setRegeln(prev => [created, ...prev])
      setNewPattern('')
      toast.success('Regel gespeichert')
      onRuleCreated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/kein-beleg-regeln/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Löschen fehlgeschlagen')
      setRegeln(prev => prev.filter(r => r.id !== id))
      toast.success('Regel gelöscht')
    } catch {
      toast.error('Löschen fehlgeschlagen')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
            Kein-Beleg-Regeln
          </DialogTitle>
          <DialogDescription>
            Transaktionen, deren Beschreibung einen dieser Begriffe enthält, werden beim Matching automatisch als &quot;Kein Beleg erforderlich&quot; markiert.
          </DialogDescription>
        </DialogHeader>

        {/* Add new rule */}
        <div className="flex gap-2">
          <Input
            placeholder="Suchbegriff eingeben (z.B. Trinkgeld, Parkticket)"
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
          />
          <Button onClick={handleAdd} disabled={saving || newPattern.trim().length < 2}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Rules list */}
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Laden...</p>}
          {!loading && regeln.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Noch keine Regeln angelegt.
            </p>
          )}
          {regeln.map(regel => (
            <div key={regel.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <Badge variant="secondary" className="font-mono text-sm font-normal">
                {regel.pattern}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(regel.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
