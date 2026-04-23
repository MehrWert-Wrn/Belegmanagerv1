'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, FileText, FileQuestion, ExternalLink, Plus, Trash2, ScanText } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import type { Beleg } from '@/lib/supabase/types'

const MAX_TAX_LINES = 5

function buildAutoRechnungsname(beleg: { rechnungsdatum?: string | null; lieferant?: string | null; rechnungsnummer?: string | null }): string {
  const parts: string[] = []
  if (beleg.rechnungsdatum) {
    parts.push(new Date(beleg.rechnungsdatum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }))
  }
  if (beleg.lieferant) parts.push(beleg.lieferant)
  if (beleg.rechnungsnummer) parts.push(beleg.rechnungsnummer)
  return parts.join(' - ')
}

const isUnbekannt = (v: string | null | undefined) => (v ?? '').toLowerCase() === 'unbekannt'

const steuerzeileSchema = z.object({
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
})

const updateSchema = z.object({
  rechnungsname: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges', 'eigenbeleg', 'eigenverbrauch']),
  lieferant: z.string().optional(),
  uid_lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  mandatsreferenz: z.string().optional(),
  zahlungsreferenz: z.string().optional(),
  bestellnummer: z.string().optional(),
  steuerzeilen: z.array(steuerzeileSchema).min(1),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
  beschreibung: z.string().max(100, 'Maximal 100 Zeichen').optional(),
})

type UpdateFormValues = z.infer<typeof updateSchema>

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100
}

interface BelegDetailSheetProps {
  beleg: Beleg | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}

export function BelegDetailSheet({
  beleg,
  open,
  onOpenChange,
  onUpdated,
}: BelegDetailSheetProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)

  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'steuerzeilen',
  })

  const beschreibungValue = form.watch('beschreibung') ?? ''
  const steuerzeilen = form.watch('steuerzeilen') ?? []

  // Auto-calculate functions
  function handleNettoChange(index: number, value: string) {
    const netto = value === '' ? null : parseFloat(value)
    form.setValue(`steuerzeilen.${index}.nettobetrag`, netto)

    const mwstRaw = form.getValues(`steuerzeilen.${index}.mwst_satz`)
    const mwst = mwstRaw != null && mwstRaw !== 'none' && mwstRaw !== '' ? Number(mwstRaw) : null

    if (netto != null && !isNaN(netto) && mwst != null) {
      const brutto = roundTwo(netto * (1 + mwst / 100))
      form.setValue(`steuerzeilen.${index}.bruttobetrag`, brutto)
    }
  }

  function handleBruttoChange(index: number, value: string) {
    const brutto = value === '' ? null : parseFloat(value)
    form.setValue(`steuerzeilen.${index}.bruttobetrag`, brutto)

    const mwstRaw = form.getValues(`steuerzeilen.${index}.mwst_satz`)
    const mwst = mwstRaw != null && mwstRaw !== 'none' && mwstRaw !== '' ? Number(mwstRaw) : null

    if (brutto != null && !isNaN(brutto) && mwst != null) {
      const netto = roundTwo(brutto / (1 + mwst / 100))
      form.setValue(`steuerzeilen.${index}.nettobetrag`, netto)
    }
  }

  function handleMwstChange(index: number, value: string) {
    form.setValue(`steuerzeilen.${index}.mwst_satz`, value === 'none' ? null : value)

    const mwst = value !== 'none' && value !== '' ? Number(value) : null
    const nettoRaw = form.getValues(`steuerzeilen.${index}.nettobetrag`)
    const netto = nettoRaw != null && nettoRaw !== '' ? Number(nettoRaw) : null
    const bruttoRaw = form.getValues(`steuerzeilen.${index}.bruttobetrag`)
    const brutto = bruttoRaw != null && bruttoRaw !== '' ? Number(bruttoRaw) : null

    if (mwst != null) {
      if (mwst === 0) {
        if (netto != null && !isNaN(netto)) {
          form.setValue(`steuerzeilen.${index}.bruttobetrag`, netto)
        } else if (brutto != null && !isNaN(brutto)) {
          form.setValue(`steuerzeilen.${index}.nettobetrag`, brutto)
        }
      } else if (netto != null && !isNaN(netto)) {
        const newBrutto = roundTwo(netto * (1 + mwst / 100))
        form.setValue(`steuerzeilen.${index}.bruttobetrag`, newBrutto)
      } else if (brutto != null && !isNaN(brutto)) {
        const newNetto = roundTwo(brutto / (1 + mwst / 100))
        form.setValue(`steuerzeilen.${index}.nettobetrag`, newNetto)
      }
    }
  }

  // Sum calculations
  const sumNetto = steuerzeilen.reduce((sum, z) => {
    const val = z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  const sumBrutto = steuerzeilen.reduce((sum, z) => {
    const val = z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  // Reset form when beleg changes
  useEffect(() => {
    if (beleg) {
      form.reset({
        rechnungsname: isUnbekannt(beleg.rechnungsname) ? buildAutoRechnungsname(beleg) : (beleg.rechnungsname ?? ''),
        rechnungsnummer: beleg.rechnungsnummer ?? '',
        rechnungstyp: beleg.rechnungstyp ?? 'eingangsrechnung',
        lieferant: beleg.lieferant ?? '',
        uid_lieferant: beleg.uid_lieferant ?? '',
        lieferant_iban: beleg.lieferant_iban ?? '',
        mandatsreferenz: beleg.mandatsreferenz ?? '',
        zahlungsreferenz: beleg.zahlungsreferenz ?? '',
        bestellnummer: beleg.bestellnummer ?? '',
        steuerzeilen: beleg.steuerzeilen && beleg.steuerzeilen.length > 0
          ? beleg.steuerzeilen.map(z => ({
              nettobetrag: z.nettobetrag,
              mwst_satz: z.mwst_satz,
              bruttobetrag: z.bruttobetrag,
            }))
          : [{
              nettobetrag: beleg.nettobetrag,
              mwst_satz: beleg.mwst_satz,
              bruttobetrag: beleg.bruttobetrag,
            }],
        rechnungsdatum: beleg.rechnungsdatum,
        faelligkeitsdatum: beleg.faelligkeitsdatum,
        beschreibung: beleg.beschreibung ?? '',
      })
    }
  }, [beleg, form])

  // Fetch signed URL for preview
  useEffect(() => {
    if (!beleg || !open) {
      setPreviewUrl(null)
      setPreviewError(false)
      return
    }

    // No storage_path means no document
    if (!beleg.storage_path) {
      setPreviewUrl(null)
      setPreviewError(false)
      setLoadingPreview(false)
      return
    }

    setLoadingPreview(true)
    setPreviewError(false)
    fetch(`/api/belege/${beleg.id}/signed-url`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch URL')
        return res.json()
      })
      .then((data) => {
        if (data.url) {
          setPreviewUrl(data.url)
        } else {
          setPreviewError(true)
        }
      })
      .catch(() => {
        setPreviewError(true)
      })
      .finally(() => setLoadingPreview(false))
  }, [beleg, open])

  async function handleReOcr() {
    if (!beleg) return
    setOcrRunning(true)

    try {
      const response = await fetch(`/api/belege/${beleg.id}/ocr`, { method: 'POST' })
      if (!response.ok) {
        const err = await response.json()
        toast.error(`OCR fehlgeschlagen: ${err.error || 'Unbekannter Fehler'}`)
        return
      }

      const ocr = await response.json()
      let filled = 0

      // Helper: is a form string field empty?
      const isEmpty = (v: string | null | undefined) => !v || v.trim() === ''

      if (isEmpty(form.getValues('lieferant')) && ocr.lieferant) {
        form.setValue('lieferant', ocr.lieferant)
        filled++
      }
      if (isEmpty(form.getValues('rechnungsnummer')) && ocr.rechnungsnummer) {
        form.setValue('rechnungsnummer', ocr.rechnungsnummer)
        filled++
      }
      if (isEmpty(form.getValues('rechnungsdatum')) && ocr.rechnungsdatum) {
        form.setValue('rechnungsdatum', ocr.rechnungsdatum)
        filled++
      }

      // Steuerzeilen: only fill if the single existing row has no amounts at all
      const currentRows = form.getValues('steuerzeilen')
      const allEmpty = currentRows.every(
        (z) =>
          (z.bruttobetrag == null || z.bruttobetrag === '') &&
          (z.nettobetrag == null || z.nettobetrag === '') &&
          (z.mwst_satz == null || z.mwst_satz === '')
      )

      if (allEmpty) {
        const ocrRows = ocr.steuerzeilen ?? (
          ocr.bruttobetrag != null || ocr.nettobetrag != null
            ? [{ nettobetrag: ocr.nettobetrag, mwst_satz: ocr.mwst_satz, bruttobetrag: ocr.bruttobetrag }]
            : null
        )
        if (ocrRows && ocrRows.length > 0) {
          form.setValue('steuerzeilen', ocrRows)
          filled++
        }
      }

      // Auto-build rechnungsname if currently empty or "Unbekannt"
      const currentName = form.getValues('rechnungsname')
      if (isEmpty(currentName) || isUnbekannt(currentName)) {
        const autoName = buildAutoRechnungsname({
          rechnungsdatum: form.getValues('rechnungsdatum'),
          lieferant: form.getValues('lieferant'),
          rechnungsnummer: form.getValues('rechnungsnummer'),
        })
        if (autoName) {
          form.setValue('rechnungsname', autoName)
          filled++
        }
      }

      if (filled > 0) {
        toast.success(`${filled} Feld${filled === 1 ? '' : 'er'} durch OCR ausgefüllt`)
      } else {
        toast.info('Alle Felder sind bereits ausgefüllt – keine Änderungen.')
      }
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setOcrRunning(false)
    }
  }

  async function onSubmit(values: UpdateFormValues) {
    if (!beleg) return
    setSaving(true)

    try {
      // Calculate totals from steuerzeilen
      const totalBrutto = values.steuerzeilen.reduce((sum, z) => {
        const val = z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : 0
        return sum + (isNaN(val) ? 0 : val)
      }, 0)

      const totalNetto = values.steuerzeilen.reduce((sum, z) => {
        const val = z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : 0
        return sum + (isNaN(val) ? 0 : val)
      }, 0)

      const firstMwst = values.steuerzeilen[0]?.mwst_satz
      const mwstSatz = firstMwst != null && firstMwst !== 'none' && firstMwst !== '' ? Number(firstMwst) : null

      const response = await fetch(`/api/belege/${beleg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsname: values.rechnungsname || undefined,
          rechnungsnummer: values.rechnungsnummer || undefined,
          rechnungstyp: values.rechnungstyp,
          lieferant: values.lieferant || undefined,
          uid_lieferant: values.uid_lieferant || undefined,
          lieferant_iban: values.lieferant_iban || undefined,
          mandatsreferenz: values.mandatsreferenz || undefined,
          zahlungsreferenz: values.zahlungsreferenz || undefined,
          bestellnummer: values.bestellnummer || undefined,
          bruttobetrag: totalBrutto || null,
          nettobetrag: totalNetto || null,
          mwst_satz: mwstSatz,
          steuerzeilen: values.steuerzeilen.map(z => ({
            nettobetrag: z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : null,
            mwst_satz: z.mwst_satz != null && z.mwst_satz !== 'none' && z.mwst_satz !== '' ? Number(z.mwst_satz) : null,
            bruttobetrag: z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : null,
          })),
          rechnungsdatum: values.rechnungsdatum || null,
          faelligkeitsdatum: values.faelligkeitsdatum || null,
          beschreibung: values.beschreibung || undefined,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        toast.error(`Fehler: ${err.error || 'Unbekannter Fehler'}`)
        return
      }

      toast.success('Beleg aktualisiert')
      onUpdated()
      onOpenChange(false)
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
    }
  }

  function openPreviewInNewTab() {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const fileExt = beleg?.original_filename?.split('.').pop()?.toLowerCase() ?? ''
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const isImage = imageExts.includes(beleg?.dateityp ?? '') || imageExts.includes(fileExt)
  const isPdf = !isImage && (beleg?.dateityp === 'pdf' || fileExt === 'pdf')
  const hasDocument = !!beleg?.storage_path

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:w-[calc(100vw-260px)] sm:max-w-none overflow-hidden p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <SheetTitle className="flex items-center gap-2">
            Beleg-Details
            {beleg && (
              beleg.zuordnungsstatus === 'zugeordnet' ? (
                <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                  Zugeordnet
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                  Offen
                </Badge>
              )
            )}
          </SheetTitle>
          <SheetDescription>
            {beleg?.original_filename ?? 'Beleg anzeigen und bearbeiten'}
          </SheetDescription>
        </SheetHeader>

        {beleg && (
          <div className="flex flex-1 min-h-0 gap-0">
            {/* Document preview - left column, full height */}
            <div className="w-3/5 border-r flex flex-col min-h-0">
            <div className="group relative flex-1 overflow-hidden bg-muted/30">
              {!hasDocument ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileQuestion className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Kein Dokument vorhanden
                  </p>
                </div>
              ) : loadingPreview ? (
                <Skeleton className="h-full w-full" />
              ) : previewError ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Dokument nicht verfuegbar
                  </p>
                </div>
              ) : previewUrl ? (
                <>
                  {isPdf ? (
                    <iframe
                      src={previewUrl}
                      title="Beleg-Vorschau"
                      className="absolute inset-0 h-full w-full"
                    />
                  ) : isImage ? (
                    <img
                      src={previewUrl}
                      alt={beleg.original_filename ?? ''}
                      className="absolute inset-0 h-full w-full cursor-pointer object-contain"
                      onClick={openPreviewInNewTab}
                    />
                  ) : (
                    <div className="flex min-h-[200px] items-center justify-center">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="absolute right-2 top-2 gap-1 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={openPreviewInNewTab}
                    aria-label="In neuem Tab oeffnen"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Oeffnen
                  </Button>
                </>
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Vorschau nicht verfuegbar
                  </p>
                </div>
              )}
            </div>
            </div>

            {/* Edit form - right column, scrollable */}
            <div className="w-2/5 flex flex-col min-h-0 overflow-y-auto px-6 py-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Beleginfo */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="rechnungsname"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rechnungsname</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Bueromaterial Jaenner" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rechnungstyp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Rechnungstyp <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Typ auswaehlen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="eingangsrechnung">Eingangsrechnung</SelectItem>
                            <SelectItem value="ausgangsrechnung">Ausgangsrechnung</SelectItem>
                            <SelectItem value="gutschrift">Gutschrift</SelectItem>
                            <SelectItem value="sonstiges">Sonstiges</SelectItem>
                            <SelectItem value="eigenbeleg">Eigenbeleg</SelectItem>
                            <SelectItem value="eigenverbrauch">Eigenverbrauch</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="lieferant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lieferant</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Amazon" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="rechnungsnummer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rechnungsnummer</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. RE-2024-001" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="uid_lieferant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UID Lieferant</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. ATU12345678" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lieferant_iban"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IBAN Lieferant</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. AT12 3456 ..." {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Zahlungsreferenzen fuer Matching */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Zahlungsreferenzen
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="mandatsreferenz"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mandatsreferenz</FormLabel>
                          <FormControl>
                            <Input placeholder="z.B. SEPA-MRF-001" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="zahlungsreferenz"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zahlungsreferenz</FormLabel>
                          <FormControl>
                            <Input placeholder="z.B. REF-2024-001" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bestellnummer"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bestellnummer</FormLabel>
                          <FormControl>
                            <Input placeholder="z.B. 305-1234567-8901234" {...field} value={field.value ?? ''} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Steuerzeilen (Betraege) with auto-calculation */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Betraege
                    </p>
                    {fields.length < MAX_TAX_LINES && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => append({ nettobetrag: null, mwst_satz: null, bruttobetrag: null })}
                      >
                        <Plus className="h-3 w-3" />
                        Zeile hinzufuegen
                      </Button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {fields.map((fieldItem, index) => (
                      <div key={fieldItem.id} className="flex items-end gap-2">
                        <div className="grid flex-1 gap-2 sm:grid-cols-3">
                          <FormField
                            control={form.control}
                            name={`steuerzeilen.${index}.nettobetrag`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Nettobetrag</FormLabel>}
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={field.value ?? ''}
                                    onChange={(e) => handleNettoChange(index, e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`steuerzeilen.${index}.mwst_satz`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>MwSt-Satz</FormLabel>}
                                <Select
                                  onValueChange={(val) => handleMwstChange(index, val)}
                                  value={field.value?.toString() ?? 'none'}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Auswaehlen" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="none">Keine Angabe</SelectItem>
                                    <SelectItem value="20">20%</SelectItem>
                                    <SelectItem value="10">10%</SelectItem>
                                    <SelectItem value="13">13%</SelectItem>
                                    <SelectItem value="0">0%</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`steuerzeilen.${index}.bruttobetrag`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Bruttobetrag</FormLabel>}
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={field.value ?? ''}
                                    onChange={(e) => handleBruttoChange(index, e.target.value)}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => remove(index)}
                            aria-label="Zeile entfernen"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {fields.length === 1 && <div className="w-9 shrink-0" />}
                      </div>
                    ))}
                  </div>

                  {/* Summenzeile */}
                  {fields.length >= 2 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="grid flex-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-md bg-muted px-3 py-2">
                          <p className="text-xs text-muted-foreground">Gesamt Netto</p>
                          <p className="text-sm font-semibold">
                            {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(sumNetto)}
                          </p>
                        </div>
                        <div />
                        <div className="rounded-md bg-muted px-3 py-2">
                          <p className="text-xs text-muted-foreground">Gesamt Brutto</p>
                          <p className="text-sm font-semibold">
                            {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(sumBrutto)}
                          </p>
                        </div>
                      </div>
                      <div className="w-9 shrink-0" />
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="rechnungsdatum"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rechnungsdatum</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="faelligkeitsdatum"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Faelligkeitsdatum</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="beschreibung"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Beschreibung</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optionale Beschreibung zum Beleg..."
                          className="resize-none"
                          maxLength={100}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <div className="flex justify-between">
                        <FormMessage />
                        <span className="text-xs text-muted-foreground">
                          {beschreibungValue.length}/100
                        </span>
                      </div>
                    </FormItem>
                  )}
                />

                <SheetFooter className="gap-2 pt-4">
                  {hasDocument && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReOcr}
                      disabled={ocrRunning || saving}
                      className="mr-auto"
                      title="Felder automatisch aus dem Beleg auslesen"
                    >
                      {ocrRunning
                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        : <ScanText className="mr-2 h-4 w-4" />}
                      Automatisch auslesen
                    </Button>
                  )}
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
                    Speichern
                  </Button>
                </SheetFooter>
              </form>
            </Form>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
