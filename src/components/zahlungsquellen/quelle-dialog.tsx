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
  aktiv: z.boolean(),
})

type FormData = z.infer<typeof schema>

interface QuelleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quelle: ZahlungsquelleWithMeta | null
  onSaved: () => void
}

export function QuelleDialog({
  open,
  onOpenChange,
  quelle,
  onSaved,
}: QuelleDialogProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    if (open) {
      if (quelle) {
        reset({
          name: quelle.name,
          typ: quelle.typ,
          iban: quelle.iban ?? '',
          aktiv: quelle.aktiv,
        })
      } else {
        reset({
          name: '',
          typ: 'kontoauszug',
          iban: '',
          aktiv: true,
        })
      }
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

      const body: Record<string, unknown> = {
        name: data.name,
        iban: data.iban || undefined,
      }
      if (!isEdit) {
        body.typ = data.typ
      }
      if (isEdit) {
        body.aktiv = data.aktiv
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
      <DialogContent className="sm:max-w-md">
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
              defaultValue={quelle?.typ ?? 'kontoauszug'}
              onValueChange={(v) => setValue('typ', v as ZahlungsquelleTyp)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue placeholder="Typ wählen..." />
              </SelectTrigger>
              <SelectContent>
                {TYP_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="quelle-aktiv">Aktiv</Label>
              <Switch
                id="quelle-aktiv"
                checked={aktiv}
                onCheckedChange={(checked) => setValue('aktiv', checked)}
              />
            </div>
          )}

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
