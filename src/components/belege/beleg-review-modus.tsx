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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FastForward,
  AlertTriangle,
  ScanText,
  Copy,
  XCircle,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges', 'eigenbeleg', 'eigenverbrauch']),
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

function buildAutoRechnungsname(beleg: Beleg): string {
  const parts: string[] = []
  if (beleg.rechnungsdatum) {
    parts.push(new Date(beleg.rechnungsdatum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }))
  }
  if (beleg.lieferant) parts.push(beleg.lieferant)
  if (beleg.rechnungsnummer) parts.push(beleg.rechnungsnummer)
  return parts.join(' - ')
}

interface BelegReviewModusProps {
  belegIds: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  mandantFirmenname?: string
}

/**
 * Returns true if the OCR-extracted lieferant appears to be the mandant's own company
 * (signals an Ausgangsrechnung rather than an Eingangsrechnung).
 */
function isOwnCompany(lieferant: string | null | undefined, firmenname: string | undefined): boolean {
  if (!lieferant || !firmenname || firmenname.length < 5) return false
  const l = lieferant.toLowerCase().replace(/[^\w\s]/g, '')
  const f = firmenname.toLowerCase().replace(/[^\w\s]/g, '')
  // Match if either string contains a 10-char prefix of the other
  const prefix = f.slice(0, Math.min(f.length, 10))
  const lprefix = l.slice(0, Math.min(l.length, 10))
  return l.includes(prefix) || f.includes(lprefix)
}

export function BelegReviewModus({
  belegIds,
  open,
  onOpenChange,
  onComplete,
  mandantFirmenname,
}: BelegReviewModusProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [belege, setBelege] = useState<Beleg[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const [showSkipAllConfirm, setShowSkipAllConfirm] = useState(false)
  const [bulkSkipReasons, setBulkSkipReasons] = useState<{ id: string; name: string; reason: string }[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set())
  const [pdfZoom, setPdfZoom] = useState(1)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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
    setPdfZoom(1)

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

    // Use steuerzeilen JSONB array if available, fall back to aggregate fields
    const initSteuerzeilen = currentBeleg.steuerzeilen && currentBeleg.steuerzeilen.length > 0
      ? currentBeleg.steuerzeilen.map((z: { nettobetrag?: number | null; mwst_satz?: number | null; bruttobetrag?: number | null }) => ({
          nettobetrag: z.nettobetrag,
          mwst_satz: z.mwst_satz != null ? z.mwst_satz : null,
          bruttobetrag: z.bruttobetrag,
        }))
      : [{ nettobetrag: currentBeleg.nettobetrag, mwst_satz: currentBeleg.mwst_satz, bruttobetrag: currentBeleg.bruttobetrag }]

    // Mark all steuerzeilen fields as OCR-highlighted if unreviewed
    const rechnungsnameUnset = !currentBeleg.rechnungsname || currentBeleg.rechnungsname.toLowerCase() === 'unbekannt'

    if (rechnungsnameUnset) {
      initSteuerzeilen.forEach((_: unknown, i: number) => {
        newOcrFields.add(`steuerzeilen.${i}.nettobetrag`)
        newOcrFields.add(`steuerzeilen.${i}.bruttobetrag`)
        newOcrFields.add(`steuerzeilen.${i}.mwst_satz`)
      })
    }

    // Only show OCR highlights if rechnungsname is not set (unreviewed)
    if (rechnungsnameUnset) {
      setOcrFields(newOcrFields)
    } else {
      setOcrFields(new Set())
    }

    // Detect Ausgangsrechnung: if OCR identified the mandant's own company as lieferant
    const detectedTyp: ReviewFormValues['rechnungstyp'] =
      currentBeleg.rechnungstyp ??
      (rechnungsnameUnset && isOwnCompany(currentBeleg.lieferant, mandantFirmenname)
        ? 'ausgangsrechnung'
        : 'eingangsrechnung')

    // For own-company invoices (Ausgangsrechnung), clear lieferant — the mandant IS the lieferant
    const lieferantValue =
      detectedTyp === 'ausgangsrechnung' && isOwnCompany(currentBeleg.lieferant, mandantFirmenname)
        ? ''
        : (currentBeleg.lieferant ?? '')

    form.reset({
      rechnungsname: rechnungsnameUnset ? buildAutoRechnungsname(currentBeleg) : (currentBeleg.rechnungsname ?? undefined),
      rechnungsnummer: currentBeleg.rechnungsnummer ?? '',
      rechnungstyp: detectedTyp,
      lieferant: lieferantValue,
      uid_lieferant: currentBeleg.uid_lieferant ?? '',
      lieferant_iban: currentBeleg.lieferant_iban ?? '',
      steuerzeilen: initSteuerzeilen,
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

  async function handleSkipReview() {
    setSavingAll(true)
    setShowSkipAllConfirm(false)

    const toSave: Beleg[] = []
    const skipped: { id: string; name: string; reason: string }[] = []

    // Duplicate detection within batch: same rechnungsnummer + lieferant
    const seen = new Map<string, string>()

    for (const beleg of belege) {
      // Already reviewed (has rechnungsname set and is not "Unbekannt") – no action needed
      if (beleg.rechnungsname && beleg.rechnungsname.toLowerCase() !== 'unbekannt') continue

      // Check required fields
      if (!beleg.rechnungsdatum) {
        skipped.push({ id: beleg.id, name: beleg.original_filename ?? beleg.id, reason: 'Rechnungsdatum fehlt' })
        continue
      }
      if (!beleg.bruttobetrag) {
        skipped.push({ id: beleg.id, name: beleg.original_filename ?? beleg.id, reason: 'Bruttobetrag fehlt' })
        continue
      }

      // Intra-batch duplicate check
      if (beleg.rechnungsnummer && beleg.lieferant) {
        const key = `${beleg.lieferant.toLowerCase()}__${beleg.rechnungsnummer.toLowerCase()}`
        if (seen.has(key)) {
          skipped.push({ id: beleg.id, name: beleg.original_filename ?? beleg.id, reason: 'Dublett (gleiche Rechnungsnummer + Lieferant im Batch)' })
          continue
        }
        seen.set(key, beleg.id)
      }

      toSave.push(beleg)
    }

    let savedCount = 0
    const failedNames: string[] = []

    for (const beleg of toSave) {
      try {
        const res = await fetch(`/api/belege/${beleg.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rechnungsname: buildAutoRechnungsname(beleg) || beleg.original_filename }),
        })
        if (res.ok) {
          savedCount++
        } else {
          failedNames.push(beleg.original_filename ?? beleg.id)
        }
      } catch {
        failedNames.push(beleg.original_filename ?? beleg.id)
      }
    }

    setSavingAll(false)

    if (failedNames.length > 0) {
      toast.error(`${savedCount} Beleg${savedCount !== 1 ? 'e' : ''} gespeichert, ${failedNames.length} fehlgeschlagen.`)
    }

    if (skipped.length > 0) {
      setBulkSkipReasons(skipped)
      // Keep only skipped belege in the queue for manual review
      setBelege(prev => prev.filter(b => skipped.some(s => s.id === b.id)))
      setCurrentIndex(0)
      setReviewedCount(savedCount)
      toast.info(
        `${savedCount} Beleg${savedCount !== 1 ? 'e' : ''} direkt gespeichert. ${skipped.length} Beleg${skipped.length !== 1 ? 'e benötigen' : ' benötigt'} manuelle Prüfung.`
      )
    } else {
      toast.success(`${savedCount} Beleg${savedCount !== 1 ? 'e' : ''} direkt gespeichert.`)
      onComplete()
      onOpenChange(false)
    }
  }

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

  async function handleReOcr() {
    if (!currentBeleg) return
    setOcrRunning(true)
    try {
      const response = await fetch(`/api/belege/${currentBeleg.id}/ocr`, { method: 'POST' })
      if (!response.ok) {
        const err = await response.json()
        toast.error(`OCR fehlgeschlagen: ${err.error || 'Unbekannter Fehler'}`)
        return
      }
      const ocr = await response.json()

      function isEmpty(v: unknown) { return v == null || v === '' }

      let filled = 0
      if (isEmpty(form.getValues('lieferant')) && ocr.lieferant) { form.setValue('lieferant', ocr.lieferant); filled++ }
      if (isEmpty(form.getValues('rechnungsnummer')) && ocr.rechnungsnummer) { form.setValue('rechnungsnummer', ocr.rechnungsnummer); filled++ }
      if (isEmpty(form.getValues('rechnungsdatum')) && ocr.rechnungsdatum) { form.setValue('rechnungsdatum', ocr.rechnungsdatum); filled++ }
      if (isEmpty(form.getValues('uid_lieferant')) && ocr.uid_lieferant) { form.setValue('uid_lieferant', ocr.uid_lieferant); filled++ }
      if (isEmpty(form.getValues('lieferant_iban')) && ocr.lieferant_iban) { form.setValue('lieferant_iban', ocr.lieferant_iban); filled++ }

      const currentSteuerzeilen = form.getValues('steuerzeilen')
      const allEmpty = currentSteuerzeilen.every(
        z => (z.bruttobetrag == null || z.bruttobetrag === '') && (z.nettobetrag == null || z.nettobetrag === '')
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

      if (filled > 0) {
        toast.success(`${filled} Feld${filled === 1 ? '' : 'er'} automatisch ausgefüllt`)
      } else {
        toast.info('Keine neuen Felder erkannt.')
      }
    } catch {
      toast.error('OCR konnte nicht ausgeführt werden.')
    } finally {
      setOcrRunning(false)
    }
  }

  async function handleDelete() {
    if (!currentBeleg) return
    setSaving(true)
    try {
      const res = await fetch(`/api/belege/${currentBeleg.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(`Löschen fehlgeschlagen: ${err.error || 'Unbekannter Fehler'}`)
        return
      }
      toast.success('Beleg gelöscht.')
      setBelege(prev => prev.filter(b => b.id !== currentBeleg.id))
      setBulkSkipReasons(prev => prev.filter(r => r.id !== currentBeleg.id))
      const newTotal = belege.length - 1
      if (newTotal === 0) {
        onComplete()
        onOpenChange(false)
      } else {
        setCurrentIndex(prev => Math.min(prev, newTotal - 1))
      }
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setSaving(false)
      setShowDeleteConfirm(false)
    }
  }

  const isPdf = currentBeleg?.dateityp === 'pdf'
  const isImage = currentBeleg?.dateityp === 'jpg' || currentBeleg?.dateityp === 'jpeg' || currentBeleg?.dateityp === 'png'

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-[calc(100vw-260px)] sm:max-w-none overflow-hidden p-0" side="right">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-base font-semibold">
              Beleg-Review
            </SheetTitle>
            {totalCount > 0 && (
              <span className="rounded-full bg-muted px-3 py-0.5 text-sm font-normal text-muted-foreground">
                Beleg {currentIndex + 1} von {totalCount}
              </span>
            )}
          </div>
          <SheetDescription className="sr-only">
            Pruefen und korrigieren Sie die OCR-erkannten Metadaten fuer jeden Beleg.
          </SheetDescription>
          {totalCount > 0 && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={savingAll || saving}
                onClick={() => setShowSkipAllConfirm(true)}
              >
                {savingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FastForward className="h-3.5 w-3.5" />
                )}
                Belegprüfung überspringen
              </Button>
              <div className="min-w-[160px] space-y-0.5">
                <Progress value={progressPercent} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  {reviewedCount} gespeichert, {skippedIds.size} uebersprungen
                </p>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex-1 space-y-4 p-6">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Keine Belege zum Reviewen gefunden.</p>
          </div>
        ) : currentBeleg ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Document preview */}
            <div className="relative flex w-3/5 flex-col border-r">
              {/* Zoom controls for PDF */}
              {isPdf && previewUrl && (
                <div className="flex items-center gap-1 border-b px-3 py-1.5">
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setPdfZoom(z => Math.max(0.5, z - 0.25))}
                    disabled={pdfZoom <= 0.5}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[3rem] text-center text-xs text-muted-foreground">
                    {Math.round(pdfZoom * 100)}%
                  </span>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setPdfZoom(z => Math.min(3, z + 0.25))}
                    disabled={pdfZoom >= 3}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button" variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setPdfZoom(1)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                  <div className="mx-2 h-4 w-px bg-border" />
                  <Button
                    type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs"
                    onClick={openPreviewInNewTab}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Oeffnen
                  </Button>
                  <p className="ml-auto truncate text-xs text-muted-foreground">{currentBeleg.original_filename}</p>
                </div>
              )}
              <div className="relative flex-1 overflow-auto">
                {loadingPreview ? (
                  <Skeleton className="absolute inset-0" />
                ) : previewError ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Vorschau nicht verfuegbar</p>
                  </div>
                ) : previewUrl ? (
                  isPdf ? (
                    <div
                      style={{
                        width: `${pdfZoom * 100}%`,
                        height: `${pdfZoom * 100}%`,
                        minWidth: '100%',
                        minHeight: '100%',
                      }}
                    >
                      <iframe
                        src={previewUrl}
                        title="Beleg-Vorschau"
                        className="h-full w-full"
                      />
                    </div>
                  ) : isImage ? (
                    <img
                      src={previewUrl}
                      alt={currentBeleg.original_filename ?? ''}
                      className="h-full w-full cursor-pointer object-contain"
                      onClick={openPreviewInNewTab}
                      style={{ transform: `scale(${pdfZoom})`, transformOrigin: 'top center' }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileText className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2">
                    <FileQuestion className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Kein Dokument vorhanden</p>
                  </div>
                )}
              </div>
              {!isPdf && previewUrl && (
                <div className="flex items-center justify-between border-t px-3 py-1.5">
                  <p className="truncate text-xs text-muted-foreground">{currentBeleg.original_filename}</p>
                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={openPreviewInNewTab}>
                    <ExternalLink className="h-3.5 w-3.5" /> Oeffnen
                  </Button>
                </div>
              )}
            </div>

            {/* Right: Form */}
            <div className="flex w-2/5 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {/* Bulk-skip reason banner */}
              {bulkSkipReasons.length > 0 && (() => {
                const reason = bulkSkipReasons.find(r => r.id === currentBeleg?.id)
                if (!reason) return null
                const isDuplicate = reason.reason.toLowerCase().includes('dublett')
                if (isDuplicate) {
                  return (
                    <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-3 py-3 text-sm text-orange-800">
                      <div className="flex items-start gap-2">
                        <Copy className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="flex-1">
                          <p className="font-medium">Mögliches Duplikat erkannt</p>
                          <p className="mt-0.5 text-xs text-orange-700">Ein Beleg mit gleicher Rechnungsnummer und gleichem Lieferant existiert bereits. Bitte prüfen und entscheiden.</p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-orange-300 bg-white text-xs text-orange-800 hover:bg-orange-100"
                          disabled={saving}
                          onClick={() => setShowDeleteConfirm(true)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Verwerfen
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 border-orange-300 bg-white text-xs text-orange-800 hover:bg-orange-100"
                          disabled={saving}
                          onClick={() => setBulkSkipReasons(prev => prev.filter(r => r.id !== currentBeleg?.id))}
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                          Trotzdem behalten
                        </Button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>Manuelle Prüfung nötig: <strong>{reason.reason}</strong></span>
                  </div>
                )
              })()}
              {/* Failed OCR banner – when no meaningful data was extracted */}
              {!ocrFields.size && !currentBeleg?.rechnungsname && !currentBeleg?.bruttobetrag && !currentBeleg?.lieferant && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
                  <div className="flex items-start gap-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">Automatisches Auslesen fehlgeschlagen</p>
                      <p className="mt-0.5 text-xs text-red-700">Es konnten keine Daten erkannt werden. Bitte nochmals auslesen oder die Felder manuell ausfüllen.</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 gap-1 border-red-300 bg-white text-xs text-red-800 hover:bg-red-100"
                    disabled={ocrRunning}
                    onClick={handleReOcr}
                  >
                    {ocrRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
                    Nochmals auslesen
                  </Button>
                </div>
              )}
              {/* OCR hint */}
              {ocrFields.size > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                  <ScanSearch className="h-4 w-4 shrink-0" />
                  Automatisch ausgelesen: {ocrFields.size} Feld{ocrFields.size !== 1 ? 'er' : ''} erkannt (blau markiert).
                </div>
              )}

              <Form {...form}>
                <form id="review-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                              <SelectItem value="eigenbeleg">Eigenbeleg</SelectItem>
                              <SelectItem value="eigenverbrauch">Eigenverbrauch</SelectItem>
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
                              onChange={(e) => { clearOcrHighlight('lieferant'); field.onChange(e) }}
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
                              onChange={(e) => { clearOcrHighlight('rechnungsnummer'); field.onChange(e) }}
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
                                      type="number" step="0.01" placeholder="0.00"
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
                                      type="number" step="0.01" placeholder="0.00"
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
                              type="button" variant="ghost" size="icon"
                              className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => remove(index)}
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
                              onChange={(e) => { clearOcrHighlight('rechnungsdatum'); field.onChange(e.target.value) }}
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
                          <span className="text-xs text-muted-foreground">{beschreibungValue.length}/100</span>
                        </div>
                      </FormItem>
                    )}
                  />

                </form>
              </Form>
            </div>

            {/* Sticky footer – always visible regardless of scroll */}
            <div className="flex shrink-0 items-center gap-2 border-t bg-background px-6 py-4">
              <div className="mr-auto flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={saving || ocrRunning}
                  className="gap-1 text-destructive hover:text-destructive"
                  title="Beleg unwiderruflich löschen"
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReOcr}
                  disabled={saving || ocrRunning}
                  className="gap-1"
                  title="Felder automatisch aus dem Beleg auslesen"
                >
                  {ocrRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                  Automatisch auslesen
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleSkip}
                disabled={saving || ocrRunning}
                className="gap-1"
              >
                <SkipForward className="h-4 w-4" />
                Überspringen
              </Button>
              <Button
                type="submit"
                form="review-form"
                disabled={saving || ocrRunning}
                className="gap-1"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {currentIndex < totalCount - 1 ? 'Speichern & Weiter' : 'Speichern & Fertig'}
              </Button>
            </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Beleg löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            Der Beleg <strong>{currentBeleg?.original_filename}</strong> wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Endgültig löschen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showSkipAllConfirm} onOpenChange={setShowSkipAllConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Belegprüfung überspringen?</AlertDialogTitle>
          <AlertDialogDescription>
            Alle Belege mit vollständigen Pflichtfeldern (Rechnungsdatum und Bruttobetrag) werden direkt gespeichert.
            Belege mit fehlenden Feldern oder Dubletten bleiben zur manuellen Prüfung in der Warteschlange.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={handleSkipReview}>
            Direkt speichern
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
