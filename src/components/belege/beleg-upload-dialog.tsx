'use client'

import { useState, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Upload,
  X,
  FileText,
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  ScanSearch,
  AlertTriangle,
  SkipForward,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import type { OcrResult } from '@/lib/ocr'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const OCR_MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB for OCR
const MAX_MASS_IMPORT = 20
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}
const MAX_TAX_LINES = 5

async function computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

interface DuplicateInfo {
  id: string
  original_filename: string
  lieferant: string | null
  bruttobetrag: number | null
  rechnungsdatum: string | null
  rechnungsname: string | null
}

const steuerzeileSchema = z.object({
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
})

const metadataSchema = z.object({
  rechnungsname: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges', 'eigenbeleg']),
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

type MetadataFormValues = z.infer<typeof metadataSchema>

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100
}


export type MassImportResult = {
  belegIds: string[]
}

type MassFileStatus = 'pending' | 'uploading' | 'ocr' | 'done' | 'error' | 'duplicate'

interface MassFileItem {
  file: File
  status: MassFileStatus
  error?: string
  belegId?: string
}

interface BelegUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onMassImportComplete?: (result: MassImportResult) => void
}

export function BelegUploadDialog({
  open,
  onOpenChange,
  onSuccess,
  onMassImportComplete,
}: BelegUploadDialogProps) {
  // Mode: 'single' or 'mass'
  const [mode, setMode] = useState<'dropzone' | 'single' | 'mass'>('dropzone')
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // OCR state for single upload
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrFields, setOcrFields] = useState<Set<string>>(new Set())

  // Mass import state
  const [massFiles, setMassFiles] = useState<MassFileItem[]>([])
  const [massProcessing, setMassProcessing] = useState(false)
  const massAbortRef = useRef(false)

  // Duplicate detection state
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null)
  const pendingSubmitRef = useRef<{ values: MetadataFormValues; fileHash: string } | null>(null)

  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      rechnungsname: '',
      rechnungsnummer: '',
      rechnungstyp: 'eingangsrechnung',
      lieferant: '',
      uid_lieferant: '',
      lieferant_iban: '',
      mandatsreferenz: '',
      zahlungsreferenz: '',
      bestellnummer: '',
      steuerzeilen: [{ nettobetrag: null, mwst_satz: null, bruttobetrag: null }],
      rechnungsdatum: null,
      faelligkeitsdatum: null,
      beschreibung: '',
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'steuerzeilen',
  })

  const beschreibungValue = form.watch('beschreibung') ?? ''
  const steuerzeilen = form.watch('steuerzeilen')

  // Track which fields user has manually touched (removes OCR highlight)
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

  // Auto-calculate: when netto or mwst changes, compute brutto; when brutto or mwst changes, compute netto
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

  // Sum calculations for display
  const sumNetto = steuerzeilen.reduce((sum, z) => {
    const val = z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  const sumBrutto = steuerzeilen.reduce((sum, z) => {
    const val = z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : 0
    return sum + (isNaN(val) ? 0 : val)
  }, 0)

  // --- OCR ---
  async function runOcr(targetFile: File): Promise<OcrResult | null> {
    if (targetFile.size > OCR_MAX_FILE_SIZE) {
      toast.info('Datei zu groß für OCR (max. 5 MB) – bitte manuell ausfüllen.')
      return null
    }

    const formData = new FormData()
    formData.append('file', targetFile)

    try {
      const response = await fetch('/api/belege/ocr', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After')
          const seconds = retryAfter ? parseInt(retryAfter, 10) : 60
          toast.warning(`Zu viele OCR-Anfragen – bitte ${seconds} Sekunden warten.`)
        }
        return null
      }

      const result: OcrResult = await response.json()
      if (result.confidence === 0) {
        if (result.error) {
          console.error('[OCR] Server error:', result.error)
          toast.error(`OCR Fehler: ${result.error}`)
        }
        return null
      }
      return result
    } catch (e) {
      console.error('[OCR] Request failed:', e)
      return null
    }
  }

  function applyOcrToForm(result: OcrResult) {
    const newOcrFields = new Set<string>()

    if (result.lieferant) {
      form.setValue('lieferant', result.lieferant)
      newOcrFields.add('lieferant')
    }
    if (result.rechnungsnummer) {
      form.setValue('rechnungsnummer', result.rechnungsnummer)
      newOcrFields.add('rechnungsnummer')
    }
    if (result.rechnungsdatum) {
      form.setValue('rechnungsdatum', result.rechnungsdatum)
      newOcrFields.add('rechnungsdatum')
    }
    if (result.steuerzeilen && result.steuerzeilen.length > 0) {
      // Use multi-line steuerzeilen from OCR
      form.setValue('steuerzeilen', result.steuerzeilen.map(z => ({
        nettobetrag: z.nettobetrag,
        mwst_satz: z.mwst_satz != null ? z.mwst_satz.toString() : null,
        bruttobetrag: z.bruttobetrag,
      })))
      result.steuerzeilen.forEach((_, i) => {
        newOcrFields.add(`steuerzeilen.${i}.nettobetrag`)
        newOcrFields.add(`steuerzeilen.${i}.bruttobetrag`)
        newOcrFields.add(`steuerzeilen.${i}.mwst_satz`)
      })
    } else {
      // Fallback to single line from aggregate values
      if (result.nettobetrag != null) {
        form.setValue('steuerzeilen.0.nettobetrag', result.nettobetrag)
        newOcrFields.add('steuerzeilen.0.nettobetrag')
      }
      if (result.bruttobetrag != null) {
        form.setValue('steuerzeilen.0.bruttobetrag', result.bruttobetrag)
        newOcrFields.add('steuerzeilen.0.bruttobetrag')
      }
      if (result.mwst_satz != null) {
        form.setValue('steuerzeilen.0.mwst_satz', result.mwst_satz.toString())
        newOcrFields.add('steuerzeilen.0.mwst_satz')
      }
    }

    // Auto-generate rechnungsname: "DD.MM.YYYY - Lieferant - Rechnungsnummer"
    const nameParts: string[] = []
    if (result.rechnungsdatum) {
      nameParts.push(new Date(result.rechnungsdatum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }))
    }
    if (result.lieferant) nameParts.push(result.lieferant)
    if (result.rechnungsnummer) nameParts.push(result.rechnungsnummer)
    if (nameParts.length > 0) {
      form.setValue('rechnungsname', nameParts.join(' - '))
      newOcrFields.add('rechnungsname')
    }

    setOcrFields(newOcrFields)
  }

  // --- Dropzone ---
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    if (acceptedFiles.length === 1) {
      // Single upload path
      const selected = acceptedFiles[0]
      if (selected.size > MAX_FILE_SIZE) {
        toast.error('Datei zu gross. Maximal 10 MB erlaubt.')
        return
      }

      setFile(selected)
      if (selected.type.startsWith('image/')) {
        setFilePreview(URL.createObjectURL(selected))
      } else {
        setFilePreview(null)
      }

      setMode('single')

      // Start OCR in background
      setOcrLoading(true)
      const ocrResult = await runOcr(selected)
      setOcrLoading(false)

      if (ocrResult) {
        applyOcrToForm(ocrResult)
      } else {
        toast.info('OCR konnte keine Daten erkennen - bitte manuell ausfuellen')
      }
    } else {
      // Mass import path
      if (acceptedFiles.length > MAX_MASS_IMPORT) {
        toast.error(`Maximal ${MAX_MASS_IMPORT} Dateien pro Massenimport erlaubt.`)
        return
      }

      const validFiles = acceptedFiles.filter((f) => {
        if (f.size > MAX_FILE_SIZE) {
          toast.error(`${f.name}: Datei zu gross (max. 10 MB)`)
          return false
        }
        return true
      })

      if (validFiles.length === 0) return

      const items: MassFileItem[] = validFiles.map((f) => ({
        file: f,
        status: 'pending' as const,
      }))

      setMassFiles(items)
      setMode('mass')
      massAbortRef.current = false
      processMassImport(items)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: MAX_MASS_IMPORT,
    maxSize: MAX_FILE_SIZE,
    disabled: mode !== 'dropzone',
  })

  // --- Mass import processing ---
  async function processMassImport(items: MassFileItem[]) {
    setMassProcessing(true)
    const supabase = createClient()

    // Get mandant_id once
    const { data: mandant, error: mandantError } = await supabase
      .from('mandanten')
      .select('id')
      .single()

    if (mandantError || !mandant) {
      toast.error('Mandant konnte nicht ermittelt werden.')
      setMassProcessing(false)
      return
    }

    const belegIds: string[] = []

    for (let i = 0; i < items.length; i++) {
      if (massAbortRef.current) break

      const item = items[i]

      // Update status to uploading
      setMassFiles((prev) => {
        const next = [...prev]
        next[i] = { ...next[i], status: 'uploading' }
        return next
      })

      try {
        // Check for duplicate before uploading
        const fileHash = await computeFileHash(item.file)
        const encodedFilename = encodeURIComponent(item.file.name)
        const checkRes = await fetch(`/api/belege/check-hash?hash=${fileHash}&filename=${encodedFilename}`)
        if (checkRes.ok) {
          const { duplicate } = await checkRes.json()
          if (duplicate) {
            setMassFiles((prev) => {
              const next = [...prev]
              next[i] = { ...next[i], status: 'duplicate', error: `Bereits vorhanden: ${duplicate.original_filename}` }
              return next
            })
            continue
          }
        }

        // Upload file to storage
        const fileId = crypto.randomUUID()
        const ext = item.file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        const storagePath = `${mandant.id}/${fileId}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('belege')
          .upload(storagePath, item.file, {
            contentType: item.file.type,
            upsert: false,
          })

        if (uploadError) {
          throw new Error(uploadError.message)
        }

        const dateityp = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'png' ? 'png' : 'pdf'

        // Update status to OCR
        setMassFiles((prev) => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'ocr' }
          return next
        })

        // Run OCR
        const ocrResult = await runOcr(item.file)

        // Create beleg in DB (rechnungsname=null -> "nicht reviewed")
        const response = await fetch('/api/belege', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storage_path: storagePath,
            original_filename: item.file.name,
            dateityp,
            file_size: item.file.size,
            file_hash: fileHash,
            rechnungstyp: 'eingangsrechnung',
            // Apply OCR results if available
            lieferant: ocrResult?.lieferant || undefined,
            rechnungsnummer: ocrResult?.rechnungsnummer || undefined,
            bruttobetrag: ocrResult?.bruttobetrag || null,
            nettobetrag: ocrResult?.nettobetrag || null,
            mwst_satz: ocrResult?.mwst_satz || null,
            rechnungsdatum: ocrResult?.rechnungsdatum || null,
          }),
        })

        if (!response.ok) {
          // Clean up storage
          await supabase.storage.from('belege').remove([storagePath])
          throw new Error('Speichern fehlgeschlagen')
        }

        const createdBeleg = await response.json()
        belegIds.push(createdBeleg.id)

        setMassFiles((prev) => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'done', belegId: createdBeleg.id }
          return next
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
        setMassFiles((prev) => {
          const next = [...prev]
          next[i] = { ...next[i], status: 'error', error: message }
          return next
        })
      }
    }

    setMassProcessing(false)

    const successCount = belegIds.length
    const duplicateCount = massFiles.filter(f => f.status === 'duplicate').length
    const errorCount = items.length - successCount - duplicateCount

    if (successCount > 0) {
      const parts = []
      if (duplicateCount > 0) parts.push(`${duplicateCount} Duplikat${duplicateCount !== 1 ? 'e' : ''} übersprungen`)
      if (errorCount > 0) parts.push(`${errorCount} Fehler`)
      toast.success(
        `${successCount} Beleg${successCount !== 1 ? 'e' : ''} importiert${parts.length > 0 ? ` (${parts.join(', ')})` : ''} - bitte Metadaten pruefen`,
        {
          action: onMassImportComplete
            ? {
                label: 'Jetzt pruefen',
                onClick: () => {
                  onMassImportComplete({ belegIds })
                  resetDialog()
                  onOpenChange(false)
                },
              }
            : undefined,
          duration: 10000,
        }
      )
    } else {
      toast.error('Kein Beleg konnte importiert werden.')
    }
  }

  function resetDialog() {
    setMode('dropzone')
    setFile(null)
    if (filePreview) {
      URL.revokeObjectURL(filePreview)
    }
    setFilePreview(null)
    form.reset()
    setUploading(false)
    setOcrLoading(false)
    setOcrFields(new Set())
    setMassFiles([])
    setMassProcessing(false)
    massAbortRef.current = false
    setDuplicateInfo(null)
    pendingSubmitRef.current = null
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
      if (massProcessing) {
        massAbortRef.current = true
      }
      resetDialog()
    }
    onOpenChange(isOpen)
  }

  function openFilePreview() {
    if (!file) return
    const url = URL.createObjectURL(file)
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function onSubmit(values: MetadataFormValues) {
    if (!file) return

    setUploading(true)
    try {
      // Compute hash and check for duplicate before storage upload
      const fileHash = await computeFileHash(file)
      const encodedFilename = encodeURIComponent(file.name)
      const checkRes = await fetch(`/api/belege/check-hash?hash=${fileHash}&filename=${encodedFilename}`)
      if (checkRes.ok) {
        const { duplicate } = await checkRes.json()
        if (duplicate) {
          // Pause and show confirmation dialog
          pendingSubmitRef.current = { values, fileHash }
          setDuplicateInfo(duplicate as DuplicateInfo)
          setUploading(false)
          return
        }
      }
      await proceedWithUpload(values, fileHash)
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
      setUploading(false)
    }
  }

  async function proceedWithUpload(values: MetadataFormValues, fileHash: string) {
    if (!file) return
    setUploading(true)

    try {
      const supabase = createClient()

      const { data: mandant, error: mandantError } = await supabase
        .from('mandanten')
        .select('id')
        .single()

      if (mandantError || !mandant) {
        toast.error('Mandant konnte nicht ermittelt werden.')
        setUploading(false)
        return
      }

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
        toast.error(`Upload fehlgeschlagen: ${uploadError.message}`)
        setUploading(false)
        return
      }

      const dateityp = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'png' ? 'png' : 'pdf'

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

      const response = await fetch('/api/belege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: storagePath,
          original_filename: file.name,
          dateityp,
          file_size: file.size,
          file_hash: fileHash,
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
        await supabase.storage.from('belege').remove([storagePath])
        toast.error(`Fehler beim Speichern: ${err.error || 'Unbekannter Fehler'}`)
        setUploading(false)
        return
      }

      toast.success('Beleg erfolgreich hochgeladen')
      resetDialog()
      onOpenChange(false)
      onSuccess()
    } catch {
      toast.error('Ein unerwarteter Fehler ist aufgetreten.')
    } finally {
      setUploading(false)
    }
  }

  // Mass import progress
  const massCompleted = massFiles.filter((f) => f.status === 'done' || f.status === 'error' || f.status === 'duplicate').length
  const massSucceeded = massFiles.filter((f) => f.status === 'done').length
  const massProgress = massFiles.length > 0 ? (massCompleted / massFiles.length) * 100 : 0

  function getStatusIcon(status: MassFileStatus) {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'uploading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'ocr':
        return <ScanSearch className="h-4 w-4 animate-pulse text-blue-500" />
      case 'done':
        return <CheckCircle2 className="h-4 w-4 text-teal-500" />
      case 'duplicate':
        return <SkipForward className="h-4 w-4 text-amber-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />
    }
  }

  function getStatusLabel(status: MassFileStatus) {
    switch (status) {
      case 'pending': return 'Wartend'
      case 'uploading': return 'Hochladen...'
      case 'ocr': return 'OCR erkennt...'
      case 'done': return 'Fertig'
      case 'duplicate': return 'Duplikat'
      case 'error': return 'Fehler'
    }
  }

  // Dialog title/description
  function getDialogTitle() {
    if (mode === 'mass') return 'Massenimport'
    if (mode === 'single') return 'Beleg hochladen'
    return 'Beleg hochladen'
  }

  function getDialogDescription() {
    if (mode === 'mass') {
      return `${massFiles.length} Dateien werden verarbeitet`
    }
    if (mode === 'single') {
      if (ocrLoading) return 'OCR erkennt Daten...'
      return 'Metadaten zum Beleg eingeben'
    }
    return 'Dateien auswaehlen oder hierher ziehen (PDF, JPG, PNG, max. 10 MB). Mehrere Dateien fuer Massenimport.'
  }

  function formatDate(d: string | null) {
    if (!d) return '–'
    return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatAmount(n: number | null) {
    if (n == null) return '–'
    return n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })
  }

  return (
    <>
    <AlertDialog open={!!duplicateInfo} onOpenChange={(open) => { if (!open) { setDuplicateInfo(null); pendingSubmitRef.current = null } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Mögliches Duplikat erkannt
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>Diese Datei wurde möglicherweise bereits hochgeladen:</p>
              {duplicateInfo && (
                <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                  <div className="font-medium">{duplicateInfo.rechnungsname || duplicateInfo.original_filename}</div>
                  {duplicateInfo.lieferant && <div className="text-muted-foreground">Lieferant: {duplicateInfo.lieferant}</div>}
                  <div className="text-muted-foreground">
                    {duplicateInfo.rechnungsdatum && `Datum: ${formatDate(duplicateInfo.rechnungsdatum)} · `}
                    {duplicateInfo.bruttobetrag != null && `Betrag: ${formatAmount(duplicateInfo.bruttobetrag)}`}
                  </div>
                </div>
              )}
              <p>Möchtest du den Beleg trotzdem hochladen?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { setDuplicateInfo(null); pendingSubmitRef.current = null }}>
            Abbrechen
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              const pending = pendingSubmitRef.current
              if (pending) {
                setDuplicateInfo(null)
                pendingSubmitRef.current = null
                proceedWithUpload(pending.values, pending.fileHash)
              }
            }}
          >
            Trotzdem hochladen
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getDialogTitle()}</DialogTitle>
          <DialogDescription>{getDialogDescription()}</DialogDescription>
        </DialogHeader>

        {/* Step 1: Dropzone (single + multiple) */}
        {mode === 'dropzone' && (
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 transition-colors ${
              isDragActive
                ? 'border-teal-500 bg-teal-50'
                : 'border-muted-foreground/25 hover:border-teal-400 hover:bg-muted/50'
            }`}
          >
            <input {...getInputProps()} aria-label="Dateien auswaehlen" />
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragActive
                  ? 'Dateien hier ablegen...'
                  : 'Klicken oder Dateien hierher ziehen'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, JPG oder PNG - max. 10 MB pro Datei
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Mehrere Dateien fuer Massenimport (max. {MAX_MASS_IMPORT})
              </p>
            </div>
          </div>
        )}

        {/* Single upload with OCR */}
        {mode === 'single' && file && (
          <div className="space-y-4">
            {/* File preview */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg border bg-muted/50 p-3 text-left transition-colors hover:bg-muted/80"
                    onClick={openFilePreview}
                    aria-label="Datei in neuem Tab oeffnen"
                  >
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Vorschau"
                        className="h-12 w-12 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-red-100">
                        <FileText className="h-6 w-6 text-red-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    {ocrLoading && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600">
                        <ScanSearch className="h-4 w-4 animate-pulse" />
                        <span>OCR...</span>
                      </div>
                    )}
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        resetDialog()
                      }}
                      aria-label="Datei entfernen"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{file.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* OCR loading overlay hint */}
            {ocrLoading && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                OCR erkennt Daten... Felder werden automatisch befuellt.
              </div>
            )}

            {/* OCR success hint */}
            {!ocrLoading && ocrFields.size > 0 && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                <ScanSearch className="h-4 w-4" />
                OCR hat {ocrFields.size} Feld{ocrFields.size !== 1 ? 'er' : ''} erkannt (blau markiert). Bitte pruefen und bei Bedarf korrigieren.
              </div>
            )}

            {/* Metadata form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {/* Gruppe 1 - Beleginfo */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Beleginfo
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="rechnungsname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rechnungsname</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="z.B. Bueromaterial Jaenner"
                              disabled={ocrLoading}
                              {...field}
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
                              disabled={ocrLoading}
                              className={getOcrInputClass('rechnungsnummer')}
                              {...field}
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
                    <FormField
                      control={form.control}
                      name="rechnungstyp"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Rechnungstyp <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} disabled={ocrLoading}>
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
                              <SelectItem value="sonstiges">Sonstiges</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Gruppe 2 - Lieferant */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lieferant
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField
                      control={form.control}
                      name="lieferant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="z.B. Amazon"
                              disabled={ocrLoading}
                              className={getOcrInputClass('lieferant')}
                              {...field}
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
                      name="uid_lieferant"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UID Lieferant</FormLabel>
                          <FormControl>
                            <Input placeholder="z.B. ATU12345678" disabled={ocrLoading} {...field} />
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
                            <Input placeholder="z.B. AT12 3456 ..." disabled={ocrLoading} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
                            <Input placeholder="z.B. SEPA-MRF-001" disabled={ocrLoading} {...field} />
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
                            <Input placeholder="z.B. REF-2024-001" disabled={ocrLoading} {...field} />
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
                            <Input placeholder="z.B. 305-1234567-8901234" disabled={ocrLoading} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Gruppe 3 - Steuerzeilen (Betraege) */}
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
                        disabled={ocrLoading}
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
                                    disabled={ocrLoading}
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
                                {index === 0 && <FormLabel>MwSt-Satz</FormLabel>}
                                <Select
                                  onValueChange={(val) => handleMwstChange(index, val)}
                                  value={field.value?.toString() ?? 'none'}
                                  disabled={ocrLoading}
                                >
                                  <FormControl>
                                    <SelectTrigger className={getOcrInputClass(`steuerzeilen.${index}.mwst_satz`)}>
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
                                    disabled={ocrLoading}
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

                {/* Gruppe 4 - Datum */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Datum
                  </p>
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
                              disabled={ocrLoading}
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
                              disabled={ocrLoading}
                              value={field.value ?? ''}
                              onChange={(e) => field.onChange(e.target.value)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Gruppe 5 - Beschreibung */}
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Beschreibung
                  </p>
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
                            disabled={ocrLoading}
                            {...field}
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
                </div>

                <DialogFooter className="gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleClose(false)}
                    disabled={uploading}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={uploading || ocrLoading}>
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Hochladen
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        )}

        {/* Mass import mode */}
        {mode === 'mass' && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {massCompleted} von {massFiles.length} Belegen verarbeitet
                </span>
                <span className="font-medium">
                  {Math.round(massProgress)}%
                </span>
              </div>
              <Progress value={massProgress} className="h-2" />
            </div>

            {/* File list with status */}
            <div className="max-h-[400px] space-y-1 overflow-y-auto rounded-lg border p-2">
              {massFiles.map((item, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    item.status === 'error'
                      ? 'bg-destructive/5'
                      : item.status === 'done'
                        ? 'bg-teal-50'
                        : item.status === 'uploading' || item.status === 'ocr'
                          ? 'bg-blue-50'
                          : ''
                  }`}
                >
                  {getStatusIcon(item.status)}
                  <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.status === 'error' ? item.error : getStatusLabel(item.status)}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <DialogFooter className="gap-2 pt-2">
              {massProcessing ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    massAbortRef.current = true
                  }}
                >
                  Abbrechen
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleClose(false)}
                  >
                    Schliessen
                  </Button>
                  {massSucceeded > 0 && onMassImportComplete && (
                    <Button
                      onClick={() => {
                        const belegIds = massFiles
                          .filter((f) => f.status === 'done' && f.belegId)
                          .map((f) => f.belegId!)
                        onMassImportComplete({ belegIds })
                        resetDialog()
                        onOpenChange(false)
                      }}
                    >
                      Jetzt pruefen ({massSucceeded})
                    </Button>
                  )}
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  )
}
