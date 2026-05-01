'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
import { ChevronDown } from 'lucide-react'
import type { ZahlungsquelleWithMeta } from '@/app/(app)/settings/zahlungsquellen/page'
import type { ZahlungsquelleTyp } from '@/lib/supabase/types'

const TYP_OPTIONS: { value: ZahlungsquelleTyp; label: string }[] = [
  { value: 'kontoauszug', label: 'Bank' },
  { value: 'kreditkarte', label: 'Kreditkarte' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'kassa', label: 'Kassa' },
  { value: 'sonstige', label: 'Sonstige' },
]

const schema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  typ: z.enum(['kontoauszug', 'kassa', 'kreditkarte', 'paypal', 'sonstige']),
  iban: z.string().optional(),
  kuerzel: z.string().max(10).optional(),
  aktiv: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface CsvMapping {
  datum: string
  betrag: string
  beschreibung: string
  iban: string
  referenz: string
}

const EMPTY_CSV_MAPPING: CsvMapping = {
  datum: '',
  betrag: '',
  beschreibung: '',
  iban: '',
  referenz: '',
}

interface QuelleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quelle: ZahlungsquelleWithMeta | null
  onSaved: () => void
  existingTypen?: string[]
}

export function QuelleDialog({
  open,
  onOpenChange,
  quelle,
  onSaved,
  existingTypen = [],
}: QuelleDialogProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csvMapping, setCsvMapping] = useState<CsvMapping>(EMPTY_CSV_MAPPING)
  const [csvMappingOpen, setCsvMappingOpen] = useState(false)
  const isEdit = !!quelle

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      typ: 'kontoauszug',
      iban: '',
      aktiv: true,
    },
  })

  const aktiv = watch('aktiv')
  const typ = watch('typ')

  useEffect(() => {
    if (open) {
      if (quelle) {
        reset({
          name: quelle.name,
          typ: quelle.typ,
          iban: quelle.iban ?? '',
          kuerzel: quelle.kuerzel ?? '',
          aktiv: quelle.aktiv,
        })
        const existing = quelle.csv_mapping as Record<string, unknown> | null
        setCsvMapping({
          datum: (existing?.datum as string) ?? '',
          betrag: (existing?.betrag as string) ?? '',
          beschreibung: (existing?.beschreibung as string) ?? '',
          iban: (existing?.iban as string) ?? '',
          referenz: (existing?.referenz as string) ?? '',
        })
      } else {
        reset({
          name: '',
          typ: 'kontoauszug',
          iban: '',
          kuerzel: '',
          aktiv: true,
        })
        setCsvMapping(EMPTY_CSV_MAPPING)
      }
      setCsvMappingOpen(false)
      setError(null)
    }
  }, [open, quelle, reset])

  async function onSubmit(data: FormData) {
    setSaving(true)
    setError(null)

    try {
      const url = isEdit
        ? `/api/zahlungsquellen/${quelle.id}`
        : '/api/zahlungsquellen'
      const method = isEdit ? 'PATCH' : 'POST'

      // Only include csv_mapping if at least one field is filled
      const hasCsvMapping = Object.values(csvMapping).some((v) => v.trim() !== '')
      const mappingPayload = hasCsvMapping
        ? Object.fromEntries(
            Object.entries(csvMapping).filter(([, v]) => v.trim() !== '')
          )
        : undefined

      const body: Record<string, unknown> = {
        name: data.name,
        iban: data.iban || undefined,
        csv_mapping: mappingPayload,
      }
      if (!isEdit) {
        body.typ = data.typ
      }
      if (isEdit) {
        body.aktiv = data.aktiv
        if (data.kuerzel !== undefined) {
          body.kuerzel = data.kuerzel || undefined
        }
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Fehler beim Speichern')
      }

      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Zahlungsquelle bearbeiten' : 'Neue Zahlungsquelle'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Bearbeite die Einstellungen dieser Zahlungsquelle.'
              : 'Erstelle eine neue Zahlungsquelle für dein Unternehmen.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="quelle-name">Name *</Label>
            <Input
              id="quelle-name"
              placeholder="z.B. Firmenkreditkarte Visa"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Typ {isEdit && <span className="text-muted-foreground">(nicht änderbar)</span>}</Label>
            <Select
              value={typ}
              onValueChange={(v) => setValue('typ', v as ZahlungsquelleTyp)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen..." />
              </SelectTrigger>
              <SelectContent>
                {TYP_OPTIONS.map((opt) => {
                  const alreadyExists = existingTypen.includes(opt.value)
                  return (
                    <SelectItem key={opt.value} value={opt.value} disabled={alreadyExists}>
                      {opt.label}{alreadyExists ? ' (bereits vorhanden)' : ''}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quelle-iban">IBAN / Kontonummer</Label>
            <Input
              id="quelle-iban"
              placeholder="AT12 3456 7890 1234 5678"
              {...register('iban')}
            />
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="quelle-kuerzel">
                Kuerzel
                <span className="ml-1 text-muted-foreground text-xs font-normal">
                  (fuer Buchungsnummern)
                </span>
              </Label>
              <Input
                id="quelle-kuerzel"
                placeholder="z.B. B1, K1, CC1"
                maxLength={10}
                {...register('kuerzel')}
              />
              <p className="text-xs text-muted-foreground">
                Wird automatisch vergeben. Aenderung hat keine Auswirkung auf bestehende Buchungsnummern.
              </p>
            </div>
          )}

          {isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="quelle-aktiv">Aktiv</Label>
              <Switch
                id="quelle-aktiv"
                checked={aktiv}
                onCheckedChange={(checked) => setValue('aktiv', checked)}
              />
            </div>
          )}

          {/* CSV-Spalten-Mapping */}
          <Collapsible open={csvMappingOpen} onOpenChange={setCsvMappingOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 font-normal">
                <span className="text-sm text-muted-foreground">CSV-Spaltenzuordnung (optional)</span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${csvMappingOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">
                Gib die genauen Spaltenbezeichnungen aus deiner CSV-Datei an. Diese werden beim Import automatisch erkannt.
              </p>
              {(
                [
                  { field: 'datum', label: 'Datum-Spalte', placeholder: 'z.B. Buchungsdatum' },
                  { field: 'betrag', label: 'Betrags-Spalte', placeholder: 'z.B. Betrag' },
                  { field: 'beschreibung', label: 'Beschreibungs-Spalte', placeholder: 'z.B. Verwendungszweck' },
                  { field: 'iban', label: 'IBAN-Spalte (Gegenseite)', placeholder: 'z.B. Gegenkonto IBAN' },
                  { field: 'referenz', label: 'Referenz-Spalte', placeholder: 'z.B. Auftragsnummer' },
                ] as const
              ).map(({ field, label, placeholder }) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    placeholder={placeholder}
                    value={csvMapping[field]}
                    onChange={(e) =>
                      setCsvMapping((prev) => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Speichern...' : isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
