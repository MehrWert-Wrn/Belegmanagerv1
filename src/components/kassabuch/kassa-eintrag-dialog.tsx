'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, FileText, X, Loader2 } from 'lucide-react'

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { createClient } from '@/lib/supabase/client'
import type { KassaEintrag } from '@/components/kassabuch/kassabuch-tabelle'

const MAX_BELEG_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png'

interface KassaEintragDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eintrag: KassaEintrag | null // null = neuer Eintrag
  onSuccess: () => void
}

type MwstSatzOption = 'none' | '20' | '13' | '10' | '0'

function formatEur(value: number): string {
  return new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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
  const [mwstSatz, setMwstSatz] = useState<MwstSatzOption>('none')
  const [beschreibung, setBeschreibung] = useState('')
  const [lieferant, setLieferant] = useState('')
  const [saving, setSaving] = useState(false)

  // Beleg anhängen state
  const [belegSectionOpen, setBelegSectionOpen] = useState(false)
  const [pendingBelegFile, setPendingBelegFile] = useState<File | null>(null)
  const [existingBelegName, setExistingBelegName] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Computed values for Netto/USt display
  const bruttoParsed = useMemo(() => {
    const num = parseFloat(betrag.replace(',', '.'))
    return isNaN(num) || num === 0 ? null : num
  }, [betrag])

  const mwstRate = useMemo(() => {
    if (mwstSatz === 'none') return null
    return parseInt(mwstSatz, 10)
  }, [mwstSatz])

  const nettobetrag = useMemo(() => {
    if (bruttoParsed === null || mwstRate === null) return null
    if (mwstRate === 0) return bruttoParsed
    return bruttoParsed / (1 + mwstRate / 100)
  }, [bruttoParsed, mwstRate])

  const ustBetrag = useMemo(() => {
    if (bruttoParsed === null || nettobetrag === null) return null
    return bruttoParsed - nettobetrag
  }, [bruttoParsed, nettobetrag])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (eintrag) {
        setDatum(eintrag.datum)
        const absAmount = Math.abs(eintrag.betrag)
        setBetrag(absAmount.toFixed(2))
        setVorzeichen(eintrag.betrag < 0 ? 'ausgabe' : 'einnahme')

        // MwSt-Satz from eintrag
        if (eintrag.mwst_satz != null) {
          const satz = String(eintrag.mwst_satz) as MwstSatzOption
          if (['20', '13', '10', '0'].includes(satz)) {
            setMwstSatz(satz)
          } else {
            setMwstSatz('none')
          }
        } else {
          setMwstSatz('none')
        }

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

        // Show existing beleg info if linked
        if (eintrag.beleg_id && eintrag.belege) {
          setExistingBelegName(
            eintrag.belege.lieferant
              ? `${eintrag.belege.lieferant} (${eintrag.belege.rechnungsnummer ?? 'ohne RN'})`
              : eintrag.belege.rechnungsnummer ?? 'Beleg vorhanden'
          )
        } else {
          setExistingBelegName(null)
        }
      } else {
        const today = new Date().toISOString().split('T')[0]
        setDatum(today)
        setBetrag('')
        setVorzeichen('ausgabe')
        setMwstSatz('none')
        setBeschreibung('')
        setLieferant('')
        setExistingBelegName(null)
      }
      // Always reset file state
      setPendingBelegFile(null)
      setBelegSectionOpen(false)
    }
  }, [open, eintrag])

  function handleFileSelect(file: File) {
    if (file.size > MAX_BELEG_SIZE) {
      toast.error('Datei zu gross. Maximal 5 MB erlaubt.')
      return
    }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
      toast.error('Nur PDF, JPG und PNG Dateien erlaubt.')
      return
    }
    setPendingBelegFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function uploadBelegAndCreate(file: File): Promise<string | null> {
    const supabase = createClient()

    // Get mandant id
    const { data: mandant, error: mandantError } = await supabase
      .from('mandanten')
      .select('id')
      .single()

    if (mandantError || !mandant) {
      throw new Error('Mandant konnte nicht ermittelt werden')
    }

    // Upload to storage
    const fileId = crypto.randomUUID()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const storagePath = `${mandant.id}/${fileId}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('belege')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)
    }

    const dateityp = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'png' ? 'png' : 'pdf'

    // Create beleg record via API
    const response = await fetch('/api/belege', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: storagePath,
        original_filename: file.name,
        dateityp,
        file_size: file.size,
        rechnungstyp: 'eingangsrechnung',
      }),
    })

    if (!response.ok) {
      // Clean up storage on failure
      await supabase.storage.from('belege').remove([storagePath])
      const err = await response.json()
      throw new Error(err.error ?? 'Beleg konnte nicht erstellt werden')
    }

    const belegData = await response.json()
    return belegData.id as string
  }

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

    // Resolve mwst_satz for API
    const apiMwstSatz = mwstRate

    setSaving(true)

    try {
      // Upload beleg if file is pending
      let belegId: string | undefined
      if (pendingBelegFile) {
        const uploadedId = await uploadBelegAndCreate(pendingBelegFile)
        if (uploadedId) {
          belegId = uploadedId
        }
      }

      if (isEdit) {
        // PATCH existing entry
        const body: Record<string, unknown> = {
          datum,
          betrag: finalBetrag,
          beschreibung: fullBeschreibung,
          lieferant: lieferant.trim() || undefined,
          mwst_satz: apiMwstSatz,
        }
        if (belegId) {
          body.beleg_id = belegId
        }

        const response = await fetch(
          `/api/kassabuch/eintraege/${eintrag.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        )

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error ?? 'Eintrag konnte nicht gespeichert werden')
        }

        toast.success('Eintrag aktualisiert')
      } else {
        // POST new entry
        const body: Record<string, unknown> = {
          datum,
          betrag: finalBetrag,
          beschreibung: fullBeschreibung,
          lieferant: lieferant.trim() || undefined,
          mwst_satz: apiMwstSatz,
        }
        if (belegId) {
          body.beleg_id = belegId
        }

        const response = await fetch('/api/kassabuch/eintraege', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
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
      <DialogContent className="sm:max-w-lg">
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

          {/* Vorzeichen */}
          <div className="space-y-2">
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

          {/* Bruttobetrag + USt.-Satz row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="kassa-bruttobetrag">Bruttobetrag (EUR)</Label>
              <Input
                id="kassa-bruttobetrag"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={betrag}
                onChange={(e) => setBetrag(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kassa-mwst-satz">USt.-Satz</Label>
              <Select
                value={mwstSatz}
                onValueChange={(v) => setMwstSatz(v as MwstSatzOption)}
              >
                <SelectTrigger id="kassa-mwst-satz" aria-label="Umsatzsteuersatz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Angabe</SelectItem>
                  <SelectItem value="20">20%</SelectItem>
                  <SelectItem value="13">13%</SelectItem>
                  <SelectItem value="10">10%</SelectItem>
                  <SelectItem value="0">0%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Computed Netto + USt display */}
          {bruttoParsed !== null && mwstRate !== null && nettobetrag !== null && ustBetrag !== null && (
            <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div>
                <span className="text-muted-foreground">Nettobetrag: </span>
                <span className="font-medium">{formatEur(nettobetrag)} EUR</span>
              </div>
              <div>
                <span className="text-muted-foreground">USt.-Betrag: </span>
                <span className="font-medium">{formatEur(ustBetrag)} EUR</span>
              </div>
            </div>
          )}

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

          {/* Beleg anhängen section */}
          <Collapsible open={belegSectionOpen} onOpenChange={setBelegSectionOpen}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="flex w-full items-center justify-between px-0 text-sm font-medium hover:bg-transparent"
              >
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Beleg anhaengen (optional)
                </span>
                <span className="text-xs text-muted-foreground">
                  {belegSectionOpen ? 'Einklappen' : 'Aufklappen'}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3">
              {/* Show existing beleg if in edit mode */}
              {existingBelegName && !pendingBelegFile && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{existingBelegName}</span>
                  <span className="ml-auto text-xs text-muted-foreground">Verknuepft</span>
                </div>
              )}

              {/* Pending file display */}
              {pendingBelegFile && (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{pendingBelegFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(pendingBelegFile.size)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => {
                      setPendingBelegFile(null)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Datei entfernen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Drop zone / file input */}
              {!pendingBelegFile && (
                <div
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
                    isDragOver
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Beleg hochladen"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Datei hierher ziehen oder klicken
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, JPG, PNG - max. 5 MB
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_FILE_TYPES}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFileSelect(file)
                }}
              />
            </CollapsibleContent>
          </Collapsible>

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
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
