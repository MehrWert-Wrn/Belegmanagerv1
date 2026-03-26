'use client'

import { useState, useEffect, useCallback } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2,
  FileText,
  FileQuestion,
  ExternalLink,
  Plus,
  Trash2,
  ChevronRight,
  SkipForward,
  ScanSearch,
} from 'lucide-react'
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
import { Progress } from '@/components/ui/progress'
import type { Beleg } from '@/lib/supabase/types'

const MAX_TAX_LINES = 5

const steuerzeileSchema = z.object({
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
})

const reviewSchema = z.object({
  rechnungsname: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges']),
  lieferant: z.string().optional(),
  uid_lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  steuerzeilen: z.array(steuerzeileSchema).min(1),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
  beschreibung: z.string().max(100, 'Maximal 100 Zeichen').optional(),
})

type ReviewFormValues = z.infer<typeof reviewSchema>

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100
}

interface BelegReviewModusProps {
  belegIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export function BelegReviewModus({
  belegIds,
  open,
  onOpenChange,
  onComplete,
}: BelegReviewModusProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [belege, setBelege] = useState<Beleg[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())

  // OCR highlight tracking
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set())

  const form = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewSchema),
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'steuerzeilen',
  })

  const beschreibungValue = form.watch('beschreibung') ?? ''
  const steuerzeilen = form.watch('steuerzeilen') ?? []

  const currentBeleg = belege[currentIndex] ?? null
  const totalCount = belege.length
  const progressPercent = totalCount > 0 ? ((reviewedCount + skippedIds.size) / totalCount) * 100 : 0

  // Fetch all belege data on mount
  useEffect(() => {
    if (!open || belegIds.length === 0) return

    setLoading(true)
    setCurrentIndex(0)
    setReviewedCount(0)
    setSkippedIds(new Set())

    async function fetchBelege() {
      try {
        const results: Beleg[] = []
        for (const id of belegIds) {
          const response = await fetch(`/api/belege/${id}`)
          if (response.ok) {
            const data = await response.json()
            results.push(data)
          }
        }
        setBelege(results)
      } catch {
        toast.error('Belege konnten nicht geladen werden.')
      } finally {
        setLoading(false)
      }
    }

    fetchBelege()
  }, [open, belegIds])

  // Load preview for current beleg
  useEffect(() => {
    if (!currentBeleg || !open) {
      setPreviewUrl(null)
      setPreviewError(false)
      return
    }

    if (!currentBeleg.storage_path) {
      setPreviewUrl(null)
      setLoadingPreview(false)
      return
    }

    setLoadingPreview(true)
    setPreviewError(false)
    fetch(`/api/belege/${currentBeleg.id}/signed-url`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed')
        return res.json()
      })
      .then((data) => {
        if (data.url) {
          setPreviewUrl(data.url)
        } else {
          setPreviewError(true)
        }
      })
      .catch(() => setPreviewError(true))
      .finally(() => setLoadingPreview(false))
  }, [currentBeleg, open])

  // Populate form when beleg changes
  useEffect(() => {
    if (!currentBeleg) return

    // Determine which fields have OCR data (fields that are populated when rechnungsname is null)
    const newOcrFields = new Set<string>()
    if (currentBeleg.lieferant) newOcrFields.add('lieferant')
    if (currentBeleg.rechnungsnummer) newOcrFields.add('rechnungsnummer')
    if (currentBeleg.rechnungsdatum) newOcrFields.add('rechnungsdatum')
    if (currentBeleg.nettobetrag != null) newOcrFields.add('steuerzeilen.0.nettobetrag')
    if (currentBeleg.bruttobetrag != null) newOcrFields.add('steuerzeilen.0.bruttobetrag')
    if (currentBeleg.mwst_satz != null) newOcrFields.add('steuerzeilen.0.mwst_satz')

    // Only show OCR highlights if rechnungsname is not set (unreviewed)
    if (!currentBeleg.rechnungsname) {
      setOcrFields(newOcrFields)
    } else {
      setOcrFields(new Set())
    }

    form.reset({
      rechnungsname: currentBeleg.rechnungsname ?? '',
      rechnungsnummer: currentBeleg.rechnungsnummer ?? '',
      rechnungstyp: currentBeleg.rechnungstyp ?? 'eingangsrechnung',
      lieferant: currentBeleg.lieferant ?? '',
      uid_lieferant: currentBeleg.uid_lieferant ?? '',
      lieferant_iban: currentBeleg.lieferant_iban ?? '',
      steuerzeilen: [{
        nettobetrag: currentBeleg.nettobetrag,
        mwst_satz: currentBeleg.mwst_satz,
        bruttobetrag: currentBeleg.bruttobetrag,
      }],
      rechnungsdatum: currentBeleg.rechnungsdatum,
      faelligkeitsdatum: currentBeleg.faelligkeitsdatum,
      beschreibung: currentBeleg.beschreibung ?? '',
    })
  }, [currentBeleg, form])

  function clearOcrHighlight(fieldName: string) {
    setOcrFields((prev) => {
      const next = new Set(prev)
      next.delete(fieldName)
      return next
    })
  }

  function getOcrInputClass(fieldName: string): string {
    return ocrFields.has(fieldName)
      ? 'ring-2 ring-blue-300 ring-offset-1 bg-blue-50/50'
      : ''
  }

  // Auto-calculate functions
  function handleNettoChange(index: number, value: string) {
    clearOcrHighlight(`steuerzeilen.${index}.nettobetrag`)
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
    clearOcrHighlight(`steuerzeilen.${index}.bruttobetrag`)
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
    clearOcrHighlight(`steuerzeilen.${index}.mwst_satz`)
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

  const sumNetto = steuerzeilen.reduce((sum, z) => {
    const val = z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  const sumBrutto = steuerzeilen.reduce((sum, z) => {
    const val = z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  function moveToNext() {
    if (currentIndex < totalCount - 1) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      // All done
      toast.success(`Review abgeschlossen. ${reviewedCount} Beleg${reviewedCount !== 1 ? 'e' : ''} gespeichert, ${skippedIds.size} uebersprungen.`)
      onComplete()
      onOpenChange(false)
    }
  }

  async function onSubmit(values: ReviewFormValues) {
    if (!currentBeleg) return
    setSaving(true)

    try {
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

      const response = await fetch(`/api/belege/${currentBeleg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rechnungsname: values.rechnungsname || currentBeleg.original_filename,
          rechnungsnummer: values.rechnungsnummer || undefined,
          rechnungstyp: values.rechnungstyp,
          lieferant: values.lieferant || undefined,
          uid_lieferant: values.uid_lieferant || undefined,
          lieferant_iban: values.lieferant_iban || undefined,
          bruttobetrag: totalBrutto || null,
          nettobetrag: totalNetto || null,
          mwst_satz: mwstSatz,
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

      setReviewedCount((prev) => prev + 1)
      moveToNext()
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
    }
  }

  function handleSkip() {
    if (!currentBeleg) return
    setSkippedIds((prev) => new Set(prev).add(currentBeleg.id))
    moveToNext()
  }

  function openPreviewInNewTab() {
    if (previewUrl) {
      window.open(previewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const isPdf = currentBeleg?.dateityp === 'pdf'
  const isImage = currentBeleg?.dateityp === 'jpg' || currentBeleg?.dateityp === 'jpeg' || currentBeleg?.dateityp === 'png'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            Beleg-Review
            {totalCount > 0 && (
              <span className="rounded-full bg-muted px-3 py-0.5 text-sm font-normal text-muted-foreground">
                Beleg {currentIndex + 1} von {totalCount}
              </span>
            )}
          </SheetTitle>
          <SheetDescription>
            Pruefen und korrigieren Sie die OCR-erkannten Metadaten fuer jeden Beleg.
          </SheetDescription>
        </SheetHeader>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-3 space-y-1">
            <Progress value={progressPercent} className="h-1.5" />
            <p className="text-xs text-muted-foreground">
              {reviewedCount} gespeichert, {skippedIds.size} uebersprungen
            </p>
          </div>
        )}

        {loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : totalCount === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Keine Belege zum Reviewen gefunden.
            </p>
          </div>
        ) : currentBeleg ? (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            {/* Left: Preview */}
            <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
              {loadingPreview ? (
                <Skeleton className="min-h-[400px] w-full" />
              ) : previewError ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Vorschau nicht verfuegbar
                  </p>
                </div>
              ) : previewUrl ? (
                <>
                  {isPdf ? (
                    <iframe
                      src={previewUrl}
                      title="Beleg-Vorschau"
                      className="min-h-[500px] w-full"
                    />
                  ) : isImage ? (
                    <img
                      src={previewUrl}
                      alt={currentBeleg.original_filename}
                      className="min-h-[300px] w-full cursor-pointer object-contain"
                      onClick={openPreviewInNewTab}
                    />
                  ) : (
                    <div className="flex min-h-[300px] items-center justify-center">
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
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-2">
                  <FileQuestion className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Kein Dokument vorhanden
                  </p>
                </div>
              )}

              {/* File info */}
              <div className="border-t px-3 py-2">
                <p className="truncate text-xs font-medium">{currentBeleg.original_filename}</p>
                <p className="text-xs text-muted-foreground">
                  {currentBeleg.dateityp?.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Right: Form */}
            <div>
              {/* OCR hint */}
              {ocrFields.size > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  <ScanSearch className="h-4 w-4 shrink-0" />
                  OCR hat {ocrFields.size} Feld{ocrFields.size !== 1 ? 'er' : ''} erkannt (blau markiert).
                </div>
              )}

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
                            <Input
                              placeholder="z.B. Amazon"
                              className={getOcrInputClass('lieferant')}
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                clearOcrHighlight('lieferant')
                                field.onChange(e)
                              }}
                            />
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
                            <Input
                              placeholder="z.B. RE-2024-001"
                              className={getOcrInputClass('rechnungsnummer')}
                              {...field}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                clearOcrHighlight('rechnungsnummer')
                                field.onChange(e)
                              }}
                            />
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

                  {/* Steuerzeilen */}
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
                          Zeile
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
                                  {index === 0 && <FormLabel>Netto</FormLabel>}
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      className={getOcrInputClass(`steuerzeilen.${index}.nettobetrag`)}
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
                                  {index === 0 && <FormLabel>MwSt</FormLabel>}
                                  <Select
                                    onValueChange={(val) => handleMwstChange(index, val)}
                                    value={field.value?.toString() ?? 'none'}
                                  >
                                    <FormControl>
                                      <SelectTrigger className={getOcrInputClass(`steuerzeilen.${index}.mwst_satz`)}>
                                        <SelectValue placeholder="%" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">Keine</SelectItem>
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
                                  {index === 0 && <FormLabel>Brutto</FormLabel>}
                                  <FormControl>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      className={getOcrInputClass(`steuerzeilen.${index}.bruttobetrag`)}
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

                    {fields.length >= 2 && (
                      <div className="mt-3 flex items-center gap-2">
                        <div className="grid flex-1 gap-2 sm:grid-cols-3">
                          <div className="rounded-md bg-muted px-3 py-2">
                            <p className="text-xs text-muted-foreground">Netto</p>
                            <p className="text-sm font-semibold">
                              {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(sumNetto)}
                            </p>
                          </div>
                          <div />
                          <div className="rounded-md bg-muted px-3 py-2">
                            <p className="text-xs text-muted-foreground">Brutto</p>
                            <p className="text-sm font-semibold">
                              {new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(sumBrutto)}
                            </p>
                          </div>
                        </div>
                        <div className="w-9 shrink-0" />
                      </div>
                    )}
                  </div>

                  {/* Datum */}
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
                              className={getOcrInputClass('rechnungsdatum')}
                              value={field.value ?? ''}
                              onChange={(e) => {
                                clearOcrHighlight('rechnungsdatum')
                                field.onChange(e.target.value)
                              }}
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
                            placeholder="Optionale Beschreibung..."
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

                  {/* Actions */}
                  <SheetFooter className="gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSkip}
                      disabled={saving}
                      className="gap-1"
                    >
                      <SkipForward className="h-4 w-4" />
                      Ueberspringen
                    </Button>
                    <Button type="submit" disabled={saving} className="gap-1">
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {currentIndex < totalCount - 1 ? 'Speichern & Weiter' : 'Speichern & Fertig'}
                    </Button>
                  </SheetFooter>
                </form>
              </Form>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
