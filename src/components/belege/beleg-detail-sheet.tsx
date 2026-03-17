'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, FileText } from 'lucide-react'
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
  lieferant: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  bruttobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  nettobetrag: z.union([z.number(), z.literal('')]).nullable().optional(),
  mwst_satz: z.union([z.number(), z.string()]).nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

type UpdateFormValues = z.infer<typeof updateSchema>

function cleanFormValues(values: UpdateFormValues) {
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
  const [saving, setSaving] = useState(false)

  const form = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
  })

  // Reset form when beleg changes
  useEffect(() => {
    if (beleg) {
      form.reset({
        lieferant: beleg.lieferant ?? '',
        rechnungsnummer: beleg.rechnungsnummer ?? '',
        bruttobetrag: beleg.bruttobetrag,
        nettobetrag: beleg.nettobetrag,
        mwst_satz: beleg.mwst_satz,
        rechnungsdatum: beleg.rechnungsdatum,
        faelligkeitsdatum: beleg.faelligkeitsdatum,
      })
    }
  }, [beleg, form])

  // Fetch signed URL for preview
  useEffect(() => {
    if (!beleg || !open) {
      setPreviewUrl(null)
      return
    }

    setLoadingPreview(true)
    fetch(`/api/belege/${beleg.id}/signed-url`)
      .then((res) => res.json())
      .then((data) => {
        if (data.url) {
          setPreviewUrl(data.url)
        }
      })
      .catch(() => {
        toast.error('Vorschau konnte nicht geladen werden.')
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
              {loadingPreview ? (
                <Skeleton className="h-64 w-full" />
              ) : previewUrl ? (
                isPdf ? (
                  <iframe
                    src={previewUrl}
                    title="Beleg-Vorschau"
                    className="h-80 w-full"
                  />
                ) : isImage ? (
                  <img
                    src={previewUrl}
                    alt={beleg.original_filename}
                    className="h-auto max-h-80 w-full object-contain"
                  />
                ) : (
                  <div className="flex h-64 items-center justify-center">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  </div>
                )
              ) : (
                <div className="flex h-64 flex-col items-center justify-center gap-2">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Vorschau nicht verfugbar
                  </p>
                </div>
              )}
            </div>

            {/* Edit form */}
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
                            onChange={(e) => field.onChange(e.target.value)}
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
                            onChange={(e) => field.onChange(e.target.value)}
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
