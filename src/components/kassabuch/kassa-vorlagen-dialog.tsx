'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface KassaVorlage {
  id: string
  name: string
  kassa_buchungstyp: 'EINNAHME' | 'AUSGABE' | 'EINLAGE' | 'ENTNAHME'
  betrag: number | null
  beschreibung: string | null
  kategorie_id: string | null
  kategorie_name?: string | null
  erstellt_am: string
}

export interface KategorieOption {
  id: string
  name: string
  farbe?: string | null
}

interface KassaVorlagenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vorlage: KassaVorlage | null // null = neu
  kategorien: KategorieOption[]
  onSuccess: () => void
}

const BUCHUNGSTYPEN = [
  { value: 'AUSGABE', label: 'Ausgabe' },
  { value: 'EINNAHME', label: 'Einnahme' },
  { value: 'ENTNAHME', label: 'Entnahme (Privat)' },
  { value: 'EINLAGE', label: 'Einlage (Privat)' },
] as const

const NONE_KATEGORIE = '__none__'

export function KassaVorlagenDialog({
  open,
  onOpenChange,
  vorlage,
  kategorien,
  onSuccess,
}: KassaVorlagenDialogProps) {
  const [name, setName] = useState('')
  const [buchungstyp, setBuchungstyp] =
    useState<KassaVorlage['kassa_buchungstyp']>('AUSGABE')
  const [betrag, setBetrag] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [kategorieId, setKategorieId] = useState<string>(NONE_KATEGORIE)
  const [saving, setSaving] = useState(false)

  const isEdit = vorlage !== null

  useEffect(() => {
    if (open) {
      if (vorlage) {
        setName(vorlage.name)
        setBuchungstyp(vorlage.kassa_buchungstyp)
        setBetrag(vorlage.betrag !== null ? vorlage.betrag.toFixed(2) : '')
        setBeschreibung(vorlage.beschreibung ?? '')
        setKategorieId(vorlage.kategorie_id ?? NONE_KATEGORIE)
      } else {
        setName('')
        setBuchungstyp('AUSGABE')
        setBetrag('')
        setBeschreibung('')
        setKategorieId(NONE_KATEGORIE)
      }
    }
  }, [open, vorlage])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Bitte geben Sie einen Namen ein.')
      return
    }

    const parsedBetrag = (() => {
      const trimmed = betrag.trim()
      if (trimmed === '') return null
      const num = parseFloat(trimmed.replace(',', '.'))
      return isNaN(num) ? NaN : num
    })()

    if (parsedBetrag !== null && isNaN(parsedBetrag)) {
      toast.error('Ungültiger Betrag.')
      return
    }

    setSaving(true)
    try {
      // TODO (Backend): Implement API routes
      //   POST /api/kassabuch/vorlagen            – create (max 50 per mandant)
      //   PATCH /api/kassabuch/vorlagen/[id]      – update
      const body = {
        name: name.trim(),
        kassa_buchungstyp: buchungstyp,
        betrag: parsedBetrag,
        beschreibung: beschreibung.trim() || null,
        kategorie_id: kategorieId === NONE_KATEGORIE ? null : kategorieId,
      }

      const url = isEdit
        ? `/api/kassabuch/vorlagen/${vorlage!.id}`
        : '/api/kassabuch/vorlagen'
      const method = isEdit ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Vorlage konnte nicht gespeichert werden')
      }

      toast.success(isEdit ? 'Vorlage aktualisiert' : 'Vorlage erstellt')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Vorlage bearbeiten' : 'Neue Vorlage'}
          </DialogTitle>
          <DialogDescription>
            Wiederkehrende Buchungen als Vorlage speichern.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vorlage-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="vorlage-name"
              placeholder="z.B. Portokosten Österr. Post"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vorlage-buchungstyp">Buchungsart</Label>
            <Select
              value={buchungstyp}
              onValueChange={(v) =>
                setBuchungstyp(v as KassaVorlage['kassa_buchungstyp'])
              }
            >
              <SelectTrigger id="vorlage-buchungstyp">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCHUNGSTYPEN.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vorlage-betrag">Betrag (optional)</Label>
            <Input
              id="vorlage-betrag"
              type="text"
              inputMode="decimal"
              placeholder="Leer lassen wenn variabel"
              value={betrag}
              onChange={(e) => setBetrag(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Bleibt leer, wenn der Betrag pro Buchung variiert.
            </p>
          </div>

          {kategorien.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="vorlage-kategorie">Kategorie (optional)</Label>
              <Select value={kategorieId} onValueChange={setKategorieId}>
                <SelectTrigger id="vorlage-kategorie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_KATEGORIE}>Keine Kategorie</SelectItem>
                  {kategorien.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="vorlage-beschreibung">Beschreibung (optional)</Label>
            <Textarea
              id="vorlage-beschreibung"
              placeholder="Vorgeschlagener Buchungstext"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={2}
              maxLength={500}
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
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Speichern...
                </>
              ) : isEdit ? (
                'Aktualisieren'
              ) : (
                'Vorlage erstellen'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
