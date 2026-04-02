'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import type { TransaktionWithRelations } from '@/lib/supabase/types'

interface MandantProfil {
  firmenname: string
  strasse: string | null
  plz: string | null
  ort: string | null
  land: string
  uid_nummer: string | null
}

interface EigenbelegDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaktion: TransaktionWithRelations
  onCreated: () => void
}

const MWST_SAETZE = [
  { label: '0 %', value: 0 },
  { label: '5 %', value: 5 },
  { label: '10 %', value: 10 },
  { label: '13 %', value: 13 },
  { label: '20 %', value: 20 },
]

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function EigenbelegDialog({
  open,
  onOpenChange,
  transaktion,
  onCreated,
}: EigenbelegDialogProps) {
  const brutto = Math.abs(transaktion.betrag)

  const [mandant, setMandant] = useState<MandantProfil | null>(null)
  const [beschreibung, setBeschreibung] = useState('')
  const [mwstSatz, setMwstSatz] = useState<number>(20)
  const [keinBelegGrund, setKeinBelegGrund] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const netto = mwstSatz > 0
    ? Math.round((brutto / (1 + mwstSatz / 100)) * 100) / 100
    : brutto
  const mwstBetrag = Math.round((brutto - netto) * 100) / 100

  useEffect(() => {
    if (!open) return
    fetch('/api/mandant')
      .then(r => r.ok ? r.json() : null)
      .then(setMandant)
      .catch(() => null)
  }, [open])

  function handleClose() {
    setBeschreibung('')
    setMwstSatz(20)
    setKeinBelegGrund('')
    onOpenChange(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!beschreibung.trim() || !keinBelegGrund.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch(`/api/transaktionen/${transaktion.id}/eigenbeleg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beschreibung: beschreibung.trim(),
          mwst_satz: mwstSatz,
          kein_beleg_grund: keinBelegGrund.trim(),
          datum: transaktion.datum,
          bruttobetrag: brutto,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Eigenbeleg konnte nicht erstellt werden')
      }

      toast.success(`${data.bezeichnung} erstellt`)
      handleClose()
      onCreated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSubmitting(false)
    }
  }

  const firmenadresse = [
    mandant?.strasse,
    [mandant?.plz, mandant?.ort].filter(Boolean).join(' '),
    mandant?.land !== 'AT' ? mandant?.land : null,
  ].filter(Boolean).join(', ')

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Eigenbeleg erstellen</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Unternehmensdaten (schreibgeschützt) */}
          <div className="rounded-md border bg-muted/40 p-3 space-y-1 text-sm">
            <p className="font-medium">{mandant?.firmenname ?? '…'}</p>
            {firmenadresse && (
              <p className="text-muted-foreground">{firmenadresse}</p>
            )}
            {mandant?.uid_nummer && (
              <p className="text-muted-foreground">UID: {mandant.uid_nummer}</p>
            )}
          </div>

          <Separator />

          {/* Transaktion: Datum + Betrag (schreibgeschützt) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input
                value={new Date(transaktion.datum).toLocaleDateString('de-AT')}
                readOnly
                className="bg-muted/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bruttobetrag</Label>
              <Input
                value={formatCurrency(brutto)}
                readOnly
                className="bg-muted/40 font-mono"
              />
            </div>
          </div>

          {/* MwSt-Satz + berechnetes Netto */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mwst">MwSt-Satz</Label>
              <Select
                value={String(mwstSatz)}
                onValueChange={v => setMwstSatz(Number(v))}
              >
                <SelectTrigger id="mwst">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MWST_SAETZE.map(s => (
                    <SelectItem key={s.value} value={String(s.value)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nettobetrag</Label>
              <Input
                value={formatCurrency(netto)}
                readOnly
                className="bg-muted/40 font-mono"
              />
            </div>
          </div>

          {mwstSatz > 0 && (
            <p className="text-xs text-muted-foreground -mt-3">
              MwSt-Betrag: {formatCurrency(mwstBetrag)}
            </p>
          )}

          {/* Beschreibung der Ausgabe */}
          <div className="space-y-1.5">
            <Label htmlFor="beschreibung">
              Beschreibung der Ausgabe <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="beschreibung"
              placeholder="z.B. Büromaterial, Taxi zum Kundentermin, …"
              value={beschreibung}
              onChange={e => setBeschreibung(e.target.value)}
              rows={2}
              maxLength={500}
              required
            />
          </div>

          {/* Grund kein regulärer Beleg */}
          <div className="space-y-1.5">
            <Label htmlFor="grund">
              Grund für fehlenden Originalbeleg <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="grund"
              placeholder="z.B. Beleg verloren, Barausgabe ohne Kassenbon, …"
              value={keinBelegGrund}
              onChange={e => setKeinBelegGrund(e.target.value)}
              rows={2}
              maxLength={500}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Abbrechen
            </Button>
            <Button
              type="submit"
              disabled={submitting || !beschreibung.trim() || !keinBelegGrund.trim()}
            >
              {submitting ? 'Wird erstellt…' : 'Eigenbeleg erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
