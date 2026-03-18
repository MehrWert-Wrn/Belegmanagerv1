'use client'

import { useState, useEffect } from 'react'
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
import type { KassaEintrag } from '@/components/kassabuch/kassabuch-tabelle'

interface KassaEintragDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eintrag: KassaEintrag | null // null = neuer Eintrag
  onSuccess: () => void
}

export function KassaEintragDialog({
  open,
  onOpenChange,
  eintrag,
  onSuccess,
}: KassaEintragDialogProps) {
  const isEdit = eintrag !== null

  const [datum, setDatum] = useState('')
  const [betrag, setBetrag] = useState('')
  const [vorzeichen, setVorzeichen] = useState<'ausgabe' | 'einnahme'>(
    'ausgabe'
  )
  const [beschreibung, setBeschreibung] = useState('')
  const [lieferant, setLieferant] = useState('')
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (eintrag) {
        setDatum(eintrag.datum)
        const absAmount = Math.abs(eintrag.betrag)
        setBetrag(absAmount.toFixed(2))
        setVorzeichen(eintrag.betrag < 0 ? 'ausgabe' : 'einnahme')
        // Lieferant und Beschreibung wurden beim Speichern mit " - " verbunden
        const desc = eintrag.beschreibung ?? ''
        const sepIdx = desc.indexOf(' - ')
        if (sepIdx > 0) {
          setLieferant(desc.substring(0, sepIdx))
          setBeschreibung(desc.substring(sepIdx + 3))
        } else {
          setLieferant('')
          setBeschreibung(desc)
        }
      } else {
        const today = new Date().toISOString().split('T')[0]
        setDatum(today)
        setBetrag('')
        setVorzeichen('ausgabe')
        setBeschreibung('')
        setLieferant('')
      }
    }
  }, [open, eintrag])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const numericBetrag = parseFloat(betrag.replace(',', '.'))
    if (isNaN(numericBetrag) || numericBetrag === 0) {
      toast.error('Bitte geben Sie einen gueltigen Betrag ein.')
      return
    }

    if (!datum) {
      toast.error('Bitte geben Sie ein Datum ein.')
      return
    }

    const finalBetrag =
      vorzeichen === 'ausgabe' ? -Math.abs(numericBetrag) : Math.abs(numericBetrag)

    // Build description: combine lieferant and beschreibung
    const parts: string[] = []
    if (lieferant.trim()) parts.push(lieferant.trim())
    if (beschreibung.trim()) parts.push(beschreibung.trim())
    const fullBeschreibung = parts.join(' - ') || undefined

    setSaving(true)

    try {
      if (isEdit) {
        // PATCH existing entry
        const response = await fetch(
          `/api/kassabuch/eintraege/${eintrag.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              datum,
              betrag: finalBetrag,
              beschreibung: fullBeschreibung,
              lieferant: lieferant.trim() || undefined,
            }),
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error ?? 'Eintrag konnte nicht gespeichert werden')
        }

        toast.success('Eintrag aktualisiert')
      } else {
        // POST new entry
        const response = await fetch('/api/kassabuch/eintraege', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            datum,
            betrag: finalBetrag,
            beschreibung: fullBeschreibung,
            lieferant: lieferant.trim() || undefined,
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error ?? 'Eintrag konnte nicht erstellt werden')
        }

        toast.success('Kassaeintrag erstellt')
      }

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
            {isEdit ? 'Kassaeintrag bearbeiten' : 'Neuer Kassaeintrag'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Bearbeiten Sie die Daten des Kassaeintrags.'
              : 'Erfassen Sie eine neue Bargeldbewegung.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Datum */}
          <div className="space-y-2">
            <Label htmlFor="kassa-datum">Datum</Label>
            <Input
              id="kassa-datum"
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              required
            />
          </div>

          {/* Vorzeichen + Betrag */}
          <div className="flex gap-3">
            <div className="w-36 space-y-2">
              <Label htmlFor="kassa-vorzeichen">Art</Label>
              <Select
                value={vorzeichen}
                onValueChange={(v) =>
                  setVorzeichen(v as 'ausgabe' | 'einnahme')
                }
              >
                <SelectTrigger id="kassa-vorzeichen" aria-label="Art der Bewegung">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ausgabe">Ausgabe</SelectItem>
                  <SelectItem value="einnahme">Einnahme</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="kassa-betrag">Betrag (EUR)</Label>
              <Input
                id="kassa-betrag"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={betrag}
                onChange={(e) => setBetrag(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Lieferant */}
          <div className="space-y-2">
            <Label htmlFor="kassa-lieferant">Lieferant / Empfaenger</Label>
            <Input
              id="kassa-lieferant"
              placeholder="z.B. Papierhandel Maier"
              value={lieferant}
              onChange={(e) => setLieferant(e.target.value)}
            />
          </div>

          {/* Beschreibung */}
          <div className="space-y-2">
            <Label htmlFor="kassa-beschreibung">Beschreibung</Label>
            <Textarea
              id="kassa-beschreibung"
              placeholder="z.B. Bueroartikel, Porti, Bewirtung..."
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              rows={2}
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
              {saving
                ? 'Wird gespeichert...'
                : isEdit
                  ? 'Speichern'
                  : 'Eintrag erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
