'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Upload, FileText, X, Loader2, ScanSearch } from 'lucide-react'

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
import type { KassaVorlage } from '@/components/kassabuch/kassa-vorlagen-dialog'

interface KassaKategorie {
  id: string
  name: string
  farbe: string
}

const MAX_BELEG_SIZE = 5 * 1024 * 1024 // 5 MB
const ACCEPTED_FILE_TYPES = '.pdf,.jpg,.jpeg,.png'

interface KassaEintragDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eintrag: KassaEintrag | null
  onSuccess: () => void
  initialVorlage?: KassaVorlage | null
}

type MwstSatzOption = 'none' | '20' | '13' | '10' | '0'
type KassaBuchungstyp = 'EINNAHME' | 'AUSGABE' | 'EINLAGE' | 'ENTNAHME'

// Welche Buchungstypen haben positiven Betrag?
const BUCHUNGSTYP_POSITIV: KassaBuchungstyp[] = ['EINNAHME', 'EINLAGE']

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
  initialVorlage,
}: KassaEintragDialogProps) {
  const isEdit = eintrag !== null

  const [datum, setDatum] = useState('')
  const [betrag, setBetrag] = useState('')
  const [buchungstyp, setBuchungstyp] = useState<KassaBuchungstyp>('AUSGABE')
  const [mwstSatz, setMwstSatz] = useState<MwstSatzOption>('none')
  const [beschreibung, setBeschreibung] = useState('')
  const [lieferant, setLieferant] = useState('')
  const [kategorieId, setKategorieId] = useState<string>('none')
  const [kategorien, setKategorien] = useState<KassaKategorie[]>([])
  const [activeVorlageId, setActiveVorlageId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Beleg anhängen state
  const [belegSectionOpen, setBelegSectionOpen] = useState(false)
  const [pendingBelegFile, setPendingBelegFile] = useState<File | null>(null)
  const [existingBelegName, setExistingBelegName] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrData, setOcrData] = useState<{
    lieferant: string | null
    rechnungsnummer: string | null
    rechnungsdatum: string | null
    bruttobetrag: number | null
    nettobetrag: number | null
    mwst_satz: number | null
  } | null>(null)
  const [ocrFilledFields, setOcrFilledFields] = useState<Set<string>>(new Set())

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

  // Kategorien laden wenn Dialog öffnet
  useEffect(() => {
    if (open) {
      fetch('/api/kassabuch/kategorien')
        .then(r => r.json())
        .then(d => setKategorien(d.kategorien ?? []))
        .catch(() => {})
    }
  }, [open])

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (eintrag) {
        setDatum(eintrag.datum)
        const absAmount = Math.abs(eintrag.betrag)
        setBetrag(absAmount.toFixed(2))
        if (eintrag.kassa_buchungstyp && eintrag.kassa_buchungstyp !== 'STORNO') {
          setBuchungstyp(eintrag.kassa_buchungstyp as KassaBuchungstyp)
        } else {
          setBuchungstyp(eintrag.betrag < 0 ? 'AUSGABE' : 'EINNAHME')
        }

        if (eintrag.mwst_satz != null) {
          const satz = String(eintrag.mwst_satz) as MwstSatzOption
          setMwstSatz(['20', '13', '10', '0'].includes(satz) ? satz : 'none')
        } else {
          setMwstSatz('none')
        }

        const desc = eintrag.beschreibung ?? ''
        const unitSepIdx = desc.indexOf('\x1F')
        if (unitSepIdx >= 0) {
          setLieferant(desc.substring(0, unitSepIdx))
          setBeschreibung(desc.substring(unitSepIdx + 1))
        } else {
          const dashIdx = desc.indexOf(' - ')
          if (dashIdx > 0) {
            setLieferant(desc.substring(0, dashIdx))
            setBeschreibung(desc.substring(dashIdx + 3))
          } else {
            setLieferant('')
            setBeschreibung(desc)
          }
        }

        // kategorie_id aus eintrag
        const eid = (eintrag as KassaEintrag & { kategorie_id?: string | null }).kategorie_id
        setKategorieId(eid ?? 'none')
        setActiveVorlageId(null)

        if (eintrag.beleg_id && eintrag.belege) {
          setExistingBelegName(
            eintrag.belege.lieferant
              ? `${eintrag.belege.lieferant} (${eintrag.belege.rechnungsnummer ?? 'ohne RN'})`
              : eintrag.belege.rechnungsnummer ?? 'Beleg vorhanden'
          )
        } else {
          setExistingBelegName(null)
        }
      } else if (initialVorlage) {
        // BUG-PROJ7-22: Vorlagen-Übernahme befüllt Formular
        const today = new Date().toISOString().split('T')[0]
        setDatum(today)
        setBuchungstyp(initialVorlage.kassa_buchungstyp as KassaBuchungstyp)
        setBetrag(initialVorlage.betrag != null ? String(Math.abs(initialVorlage.betrag)) : '')
        setBeschreibung(initialVorlage.beschreibung ?? '')
        setLieferant('')
        setMwstSatz('none')
        setKategorieId(initialVorlage.kategorie_id ?? 'none')
        setActiveVorlageId(initialVorlage.id)
        setExistingBelegName(null)
      } else {
        const today = new Date().toISOString().split('T')[0]
        setDatum(today)
        setBetrag('')
        setBuchungstyp('AUSGABE')
        setMwstSatz('none')
        setBeschreibung('')
        setLieferant('')
        setKategorieId('none')
        setActiveVorlageId(null)
        setExistingBelegName(null)
      }
      setPendingBelegFile(null)
      setBelegSectionOpen(false)
      setOcrLoading(false)
      setOcrData(null)
      setOcrFilledFields(new Set())
    }
  }, [open, eintrag, initialVorlage])

  async function handleFileSelect(file: File) {
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
    setBelegSectionOpen(true)
    setOcrLoading(true)
    setOcrData(null)
    setOcrFilledFields(new Set())

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/belege/ocr', { method: 'POST', body: formData })

      if (res.status === 429) {
        toast.info('OCR-Limit erreicht – bitte Felder manuell ausfüllen.')
        return
      }
      if (!res.ok) {
        toast.info('OCR konnte keine Daten erkennen – bitte manuell ausfüllen.')
        return
      }

      const data = await res.json()
      if (!data || data.confidence === 0) {
        toast.info('OCR konnte keine Daten erkennen – bitte manuell ausfüllen.')
        return
      }

      setOcrData({
        lieferant: data.lieferant ?? null,
        rechnungsnummer: data.rechnungsnummer ?? null,
        rechnungsdatum: data.rechnungsdatum ?? null,
        bruttobetrag: data.bruttobetrag ?? null,
        nettobetrag: data.nettobetrag ?? null,
        mwst_satz: data.mwst_satz ?? null,
      })

      const filled = new Set<string>()

      if (data.lieferant && !lieferant.trim()) {
        setLieferant(data.lieferant)
        filled.add('lieferant')
      }
      if (data.bruttobetrag !== null && !betrag.trim()) {
        setBetrag(String(Math.abs(data.bruttobetrag)))
        filled.add('betrag')
      }
      if (data.rechnungsdatum && !isEdit) {
        setDatum(data.rechnungsdatum)
        filled.add('datum')
      }
      if (data.mwst_satz !== null && mwstSatz === 'none') {
        const satz = String(data.mwst_satz)
        if (['20', '13', '10', '0'].includes(satz)) {
          setMwstSatz(satz as MwstSatzOption)
          filled.add('mwstSatz')
        }
      }

      setOcrFilledFields(filled)
      if (filled.size > 0) {
        toast.success('OCR hat Daten erkannt – bitte prüfen und ggf. korrigieren.')
      } else {
        toast.info('OCR konnte keine neuen Felder befüllen.')
      }
    } catch {
      toast.info('OCR fehlgeschlagen – bitte manuell ausfüllen.')
    } finally {
      setOcrLoading(false)
    }
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

  async function uploadBelegAndCreate(file: File, ocr: typeof ocrData): Promise<string | null> {
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

    // Create beleg record via API, including OCR metadata if available
    const response = await fetch('/api/belege', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storage_path: storagePath,
        original_filename: file.name,
        dateityp,
        file_size: file.size,
        rechnungstyp: 'eingangsrechnung',
        ...(ocr && {
          lieferant: ocr.lieferant ?? undefined,
          rechnungsnummer: ocr.rechnungsnummer ?? undefined,
          rechnungsdatum: ocr.rechnungsdatum ?? undefined,
          bruttobetrag: ocr.bruttobetrag ?? undefined,
          nettobetrag: ocr.nettobetrag ?? undefined,
          mwst_satz: ocr.mwst_satz ?? undefined,
        }),
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
    if (isNaN(numericBetrag)) {
      toast.error('Bitte geben Sie einen gueltigen Betrag ein.')
      return
    }

    if (!datum) {
      toast.error('Bitte geben Sie ein Datum ein.')
      return
    }

    const isPositiv = BUCHUNGSTYP_POSITIV.includes(buchungstyp)
    const finalBetrag = isPositiv ? Math.abs(numericBetrag) : -Math.abs(numericBetrag)

    // Build description: lieferant + beschreibung, getrennt durch U+001F (Unit Separator)
    // Dieser Trenner kommt nie in natuerlicher Sprache vor – kein falsches Splitting
    const parts: string[] = []
    if (lieferant.trim()) parts.push(lieferant.trim())
    if (beschreibung.trim()) parts.push(beschreibung.trim())
    const fullBeschreibung = parts.join('\x1F') || undefined

    // Resolve mwst_satz for API
    const apiMwstSatz = mwstRate

    setSaving(true)

    try {
      // Upload beleg if file is pending
      let belegId: string | undefined
      if (pendingBelegFile) {
        const uploadedId = await uploadBelegAndCreate(pendingBelegFile, ocrData)
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
          mwst_satz: apiMwstSatz,
          mwst_betrag: ustBetrag,
          kassa_buchungstyp: buchungstyp,
          kategorie_id: kategorieId === 'none' ? null : kategorieId,
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
          mwst_satz: apiMwstSatz,
          mwst_betrag: ustBetrag,
          kassa_buchungstyp: buchungstyp,
          kategorie_id: kategorieId === 'none' ? null : kategorieId,
          kassa_vorlage_id: activeVorlageId ?? null,
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
              onChange={(e) => {
                setDatum(e.target.value)
                setOcrFilledFields(prev => { const s = new Set(prev); s.delete('datum'); return s })
              }}
              className={ocrFilledFields.has('datum') ? 'ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50' : ''}
              required
            />
          </div>

          {/* Buchungstyp */}
          <div className="space-y-2">
            <Label htmlFor="kassa-buchungstyp">Buchungsart</Label>
            <Select
              value={buchungstyp}
              onValueChange={(v) => setBuchungstyp(v as KassaBuchungstyp)}
            >
              <SelectTrigger id="kassa-buchungstyp" aria-label="Buchungsart">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="AUSGABE">Ausgabe</SelectItem>
                <SelectItem value="EINNAHME">Einnahme</SelectItem>
                <SelectItem value="EINLAGE">Einlage (Bargeld eingelegt)</SelectItem>
                <SelectItem value="ENTNAHME">Entnahme (Bargeld entnommen)</SelectItem>
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
                onChange={(e) => {
                  setBetrag(e.target.value)
                  setOcrFilledFields(prev => { const s = new Set(prev); s.delete('betrag'); return s })
                }}
                className={ocrFilledFields.has('betrag') ? 'ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50' : ''}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kassa-mwst-satz">USt.-Satz</Label>
              <Select
                value={mwstSatz}
                onValueChange={(v) => {
                  setMwstSatz(v as MwstSatzOption)
                  setOcrFilledFields(prev => { const s = new Set(prev); s.delete('mwstSatz'); return s })
                }}
              >
                <SelectTrigger id="kassa-mwst-satz" aria-label="Umsatzsteuersatz" className={ocrFilledFields.has('mwstSatz') ? 'ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50' : ''}>
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

          {/* Kategorie */}
          {kategorien.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="kassa-kategorie">Kategorie <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={kategorieId} onValueChange={setKategorieId}>
                <SelectTrigger id="kassa-kategorie" aria-label="Kategorie">
                  <SelectValue placeholder="Keine Kategorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine Kategorie</SelectItem>
                  {kategorien.map(k => (
                    <SelectItem key={k.id} value={k.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: k.farbe }}
                        />
                        {k.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Lieferant */}
          <div className="space-y-2">
            <Label htmlFor="kassa-lieferant">Lieferant / Empfaenger</Label>
            <Input
              id="kassa-lieferant"
              placeholder="z.B. Papierhandel Maier"
              value={lieferant}
              onChange={(e) => {
                setLieferant(e.target.value)
                setOcrFilledFields(prev => { const s = new Set(prev); s.delete('lieferant'); return s })
              }}
              className={ocrFilledFields.has('lieferant') ? 'ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50' : ''}
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
                      setOcrData(null)
                      setOcrLoading(false)
                      setOcrFilledFields(new Set())
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    aria-label="Datei entfernen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* OCR loading / result indicator */}
              {ocrLoading && (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm text-blue-700">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>OCR erkennt Daten...</span>
                </div>
              )}
              {!ocrLoading && ocrData && ocrFilledFields.size > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-sm text-blue-700">
                  <ScanSearch className="h-4 w-4 shrink-0" />
                  <span>OCR hat Felder befüllt – blau markierte Felder bitte prüfen.</span>
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
