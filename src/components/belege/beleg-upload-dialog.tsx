'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, FileText, Loader2, Plus, Trash2, ExternalLink } from 'lucide-react'
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
import { createClient } from '@/lib/supabase/client'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}
const MAX_TAX_LINES = 5

const steuerzeileSchema = z.object({
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
})

const metadataSchema = z.object({
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

type MetadataFormValues = z.infer<typeof metadataSchema>

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100
}

interface BelegUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function BelegUploadDialog({
  open,
  onOpenChange,
  onSuccess,
}: BelegUploadDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const form = useForm<MetadataFormValues>({
    resolver: zodResolver(metadataSchema),
    defaultValues: {
      rechnungsname: '',
      rechnungsnummer: '',
      rechnungstyp: 'eingangsrechnung',
      lieferant: '',
      uid_lieferant: '',
      lieferant_iban: '',
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

  // Auto-calculate: when netto or mwst changes, compute brutto; when brutto or mwst changes, compute netto
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
        // MwSt 0%: netto = brutto
        if (netto != null && !isNaN(netto)) {
          form.setValue(`steuerzeilen.${index}.bruttobetrag`, netto)
        } else if (brutto != null && !isNaN(brutto)) {
          form.setValue(`steuerzeilen.${index}.nettobetrag`, brutto)
        }
      } else if (netto != null && !isNaN(netto)) {
        // Netto vorhanden -> Brutto neu berechnen
        const newBrutto = roundTwo(netto * (1 + mwst / 100))
        form.setValue(`steuerzeilen.${index}.bruttobetrag`, newBrutto)
      } else if (brutto != null && !isNaN(brutto)) {
        // Nur Brutto vorhanden -> Netto berechnen
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selected = acceptedFiles[0]
    if (!selected) return

    if (selected.size > MAX_FILE_SIZE) {
      toast.error('Datei zu gross. Maximal 10 MB erlaubt.')
      return
    }

    setFile(selected)

    if (selected.type.startsWith('image/')) {
      const url = URL.createObjectURL(selected)
      setFilePreview(url)
    } else {
      setFilePreview(null)
    }

    setStep(2)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
  })

  function resetDialog() {
    setStep(1)
    setFile(null)
    if (filePreview) {
      URL.revokeObjectURL(filePreview)
    }
    setFilePreview(null)
    form.reset()
    setUploading(false)
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) {
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
      const supabase = createClient()

      // Get mandant_id
      const { data: mandant, error: mandantError } = await supabase
        .from('mandanten')
        .select('id')
        .single()

      if (mandantError || !mandant) {
        toast.error('Mandant konnte nicht ermittelt werden.')
        setUploading(false)
        return
      }

      // Generate unique filename
      const fileId = crypto.randomUUID()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const storagePath = `${mandant.id}/${fileId}.${ext}`

      // Upload file to Supabase Storage
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

      // Determine dateityp
      const dateityp = ext === 'jpg' || ext === 'jpeg' ? 'jpg' : ext === 'png' ? 'png' : 'pdf'

      // Calculate totals from steuerzeilen
      const totalBrutto = values.steuerzeilen.reduce((sum, z) => {
        const val = z.bruttobetrag != null && z.bruttobetrag !== '' ? Number(z.bruttobetrag) : 0
        return sum + (isNaN(val) ? 0 : val)
      }, 0)

      const totalNetto = values.steuerzeilen.reduce((sum, z) => {
        const val = z.nettobetrag != null && z.nettobetrag !== '' ? Number(z.nettobetrag) : 0
        return sum + (isNaN(val) ? 0 : val)
      }, 0)

      // MwSt-Satz from first line
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
          rechnungsname: values.rechnungsname || undefined,
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
        // Clean up orphaned storage file since metadata save failed
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Beleg hochladen</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Datei auswaehlen oder hierher ziehen (PDF, JPG, PNG, max. 10 MB)'
              : 'Metadaten zum Beleg eingeben'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-10 transition-colors ${
              isDragActive
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'
            }`}
          >
            <input {...getInputProps()} aria-label="Datei auswaehlen" />
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {isDragActive
                  ? 'Datei hier ablegen...'
                  : 'Klicken oder Datei hierher ziehen'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, JPG oder PNG - max. 10 MB
              </p>
            </div>
          </div>
        )}

        {step === 2 && file && (
          <div className="space-y-4">
            {/* File preview - clickable to open in new tab */}
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
                            <Input placeholder="z.B. Bueromaterial Jaenner" {...field} />
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
                            <Input placeholder="z.B. RE-2024-001" {...field} />
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
                            <Input placeholder="z.B. Amazon" {...field} />
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
                            <Input placeholder="z.B. ATU12345678" {...field} />
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
                            <Input placeholder="z.B. AT12 3456 ..." {...field} />
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
                        {/* Spacer when only 1 line to keep alignment */}
                        {fields.length === 1 && <div className="w-9 shrink-0" />}
                      </div>
                    ))}
                  </div>

                  {/* Summenzeile - only shown when 2+ lines */}
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
                  <Button type="submit" disabled={uploading}>
                    {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Hochladen
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
