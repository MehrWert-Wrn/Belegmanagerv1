'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

const metadataSchema = z.object({
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

type MetadataFormValues = z.infer<typeof metadataSchema>

function cleanFormValues(values: MetadataFormValues) {
  return {
    lieferant: values.lieferant || undefined,
    rechnungsnummer: values.rechnungsnummer || undefined,
    bruttobetrag: values.bruttobetrag === '' ? null : values.bruttobetrag ? Number(values.bruttobetrag) : null,
    nettobetrag: values.nettobetrag === '' ? null : values.nettobetrag ? Number(values.nettobetrag) : null,
    mwst_satz: !values.mwst_satz || values.mwst_satz === 'none' ? null : Number(values.mwst_satz),
    rechnungsdatum: values.rechnungsdatum || null,
    faelligkeitsdatum: values.faelligkeitsdatum || null,
  }
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
      lieferant: '',
      rechnungsnummer: '',
      bruttobetrag: null,
      nettobetrag: null,
      mwst_satz: null,
      rechnungsdatum: null,
      faelligkeitsdatum: null,
    },
  })

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

      // Save metadata via API
      const cleaned = cleanFormValues(values)
      const response = await fetch('/api/belege', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: storagePath,
          original_filename: file.name,
          dateityp,
          ...cleaned,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Beleg hochladen</DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Datei auswahlen oder hierher ziehen (PDF, JPG, PNG, max. 10 MB)'
              : 'Optional: Metadaten zum Beleg eingeben'}
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
            <input {...getInputProps()} aria-label="Datei auswahlen" />
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
            {/* File preview */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => {
                  resetDialog()
                }}
                aria-label="Datei entfernen"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Metadata form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="lieferant"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lieferant</FormLabel>
                        <FormControl>
                          <Input placeholder="z.B. Amazon" {...field} />
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
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="bruttobetrag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bruttobetrag</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === '' ? null : parseFloat(e.target.value)
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nettobetrag"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nettobetrag</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={field.value ?? ''}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value === '' ? null : parseFloat(e.target.value)
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mwst_satz"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>MwSt-Satz</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value?.toString() ?? 'none'}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Auswahlen" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Keine Angabe</SelectItem>
                            <SelectItem value="20">20%</SelectItem>
                            <SelectItem value="10">10%</SelectItem>
                            <SelectItem value="0">0%</SelectItem>
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
                        <FormLabel>Falligkeitsdatum</FormLabel>
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
