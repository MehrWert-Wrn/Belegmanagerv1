'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, FileText, FileQuestion } from 'lucide-react'
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

const updateSchema = z.object({
  rechnungsname: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges']),
  lieferant: z.string().optional(),
  uid_lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
  beschreibung: z.string().max(100, 'Maximal 100 Zeichen').optional(),
})

type UpdateFormValues = z.infer<typeof updateSchema>

function cleanFormValues(values: UpdateFormValues) {
  return {
    rechnungsname: values.rechnungsname || undefined,
    rechnungsnummer: values.rechnungsnummer || undefined,
    rechnungstyp: values.rechnungstyp,
    lieferant: values.lieferant || undefined,
    uid_lieferant: values.uid_lieferant || undefined,
    lieferant_iban: values.lieferant_iban || undefined,
    bruttobetrag: values.bruttobetrag === '' ? null : values.bruttobetrag ? Number(values.bruttobetrag) : null,
    nettobetrag: values.nettobetrag === '' ? null : values.nettobetrag ? Number(values.nettobetrag) : null,
    mwst_satz: !values.mwst_satz || values.mwst_satz === 'none' ? null : Number(values.mwst_satz),
    rechnungsdatum: values.rechnungsdatum || null,
    faelligkeitsdatum: values.faelligkeitsdatum || null,
    beschreibung: values.beschreibung || undefined,
  }
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

  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
  })

  const beschreibungValue = form.watch('beschreibung') ?? ''

  // Reset form when beleg changes
  useEffect(() => {
    if (beleg) {
      form.reset({
        rechnungsname: beleg.rechnungsname ?? '',
        rechnungsnummer: beleg.rechnungsnummer ?? '',
        rechnungstyp: beleg.rechnungstyp ?? 'eingangsrechnung',
        lieferant: beleg.lieferant ?? '',
        uid_lieferant: beleg.uid_lieferant ?? '',
        lieferant_iban: beleg.lieferant_iban ?? '',
        bruttobetrag: beleg.bruttobetrag,
        nettobetrag: beleg.nettobetrag,
        mwst_satz: beleg.mwst_satz,
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

  async function onSubmit(values: UpdateFormValues) {
    if (!beleg) return
    setSaving(true)

    try {
      const response = await fetch(`/api/belege/${beleg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanFormValues(values)),
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

  const isPdf = beleg?.dateityp === 'pdf'
  const isImage = beleg?.dateityp === 'jpg' || beleg?.dateityp === 'jpeg' || beleg?.dateityp === 'png'
  const hasDocument = !!beleg?.storage_path

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Beleg-Details
            {beleg && (
              beleg.zuordnungsstatus === 'zugeordnet' ? (
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
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
          <div className="mt-4 space-y-6">
            {/* Document preview */}
            <div className="overflow-hidden rounded-lg border bg-muted/30">
              {!hasDocument ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileQuestion className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Kein Dokument vorhanden
                  </p>
                </div>
              ) : loadingPreview ? (
                <Skeleton className="min-h-[600px] w-full" />
              ) : previewError ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Dokument nicht verfuegbar
                  </p>
                </div>
              ) : previewUrl ? (
                isPdf ? (
                  <iframe
                    src={previewUrl}
                    title="Beleg-Vorschau"
                    className="min-h-[600px] w-full"
                  />
                ) : isImage ? (
                  <img
                    src={previewUrl}
                    alt={beleg.original_filename}
                    className="min-h-[400px] w-full object-contain"
                  />
                ) : (
                  <div className="flex min-h-[200px] items-center justify-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  </div>
                )
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Vorschau nicht verfuegbar
                  </p>
                </div>
              )}
            </div>

            {/* Edit form */}
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
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                              <SelectValue placeholder="Auswaehlen" />
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
        )}
      </SheetContent>
    </Sheet>
  )
}
