'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const RECHTSFORMEN = ['GmbH', 'GmbH & Co KG', 'Einzelunternehmen', 'OG', 'KG', 'AG', 'Verein', 'Sonstige']
const MONATE = [
  { value: '1', label: 'Jänner' }, { value: '2', label: 'Februar' },
  { value: '3', label: 'März' }, { value: '4', label: 'April' },
  { value: '5', label: 'Mai' }, { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' }, { value: '8', label: 'August' },
  { value: '9', label: 'September' }, { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' }, { value: '12', label: 'Dezember' },
]

const schema = z.object({
  firmenname: z.string().min(1, 'Firmenname ist erforderlich'),
  rechtsform: z.string().optional(),
  uid_nummer: z.string().regex(/^(ATU\d{8})?$/, 'Format: ATU gefolgt von 8 Ziffern').optional().or(z.literal('')),
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  geschaeftsjahr_beginn: z.string(),
  beraternummer: z.string().regex(/^(\d{5,7})?$/, 'Beraternummer: 5–7 Ziffern').optional().or(z.literal('')),
  mandantennummer: z.string().regex(/^(\d{1,5})?$/, 'Mandantennummer: 1–5 Ziffern').optional().or(z.literal('')),
})

type FormData = z.infer<typeof schema>

export default function FirmaSettingsPage() {
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  const { register, handleSubmit, setValue, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { geschaeftsjahr_beginn: '1' },
  })

  useEffect(() => {
    async function loadMandant() {
      const supabase = createClient()
      const { data } = await supabase.from('mandanten').select('*').maybeSingle()
      if (data) {
        reset({
          firmenname: data.firmenname,
          rechtsform: data.rechtsform ?? '',
          uid_nummer: data.uid_nummer ?? '',
          strasse: data.strasse ?? '',
          plz: data.plz ?? '',
          ort: data.ort ?? '',
          geschaeftsjahr_beginn: String(data.geschaeftsjahr_beginn),
          beraternummer: data.beraternummer ?? '',
          mandantennummer: data.mandantennummer ?? '',
        })
      }
      setFetching(false)
    }
    loadMandant()
  }, [reset])

  async function onSubmit(data: FormData) {
    setSaved(false)
    setLoading(true)

    const response = await fetch('/api/firma', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firmenname: data.firmenname,
        rechtsform: data.rechtsform || null,
        uid_nummer: data.uid_nummer || null,
        strasse: data.strasse || null,
        plz: data.plz || null,
        ort: data.ort || null,
        geschaeftsjahr_beginn: parseInt(data.geschaeftsjahr_beginn),
        beraternummer: data.beraternummer || null,
        mandantennummer: data.mandantennummer || null,
      }),
    })

    if (response.ok) {
      setSaved(true)
    }
    setLoading(false)
  }

  if (fetching) return <div className="h-64 rounded-lg bg-white animate-pulse" />

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Card>
        <CardHeader>
          <CardTitle>Firmendaten</CardTitle>
          <CardDescription>Bearbeite die Stammdaten deines Unternehmens</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {saved && (
            <div className="rounded-md bg-accent text-accent-foreground text-sm px-3 py-2">
              Änderungen gespeichert.
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="firmenname">Firmenname *</Label>
            <Input id="firmenname" {...register('firmenname')} />
            {errors.firmenname && <p className="text-xs text-destructive">{errors.firmenname.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Rechtsform</Label>
              <Select onValueChange={(v) => setValue('rechtsform', v)} value={watch('rechtsform') || ''}>
                <SelectTrigger><SelectValue placeholder="Wählen..." /></SelectTrigger>
                <SelectContent>
                  {RECHTSFORMEN.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="uid_nummer">UID-Nummer</Label>
              <Input id="uid_nummer" placeholder="ATU12345678" {...register('uid_nummer')} />
              {errors.uid_nummer && <p className="text-xs text-destructive">{errors.uid_nummer.message}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strasse">Straße & Hausnummer</Label>
            <Input id="strasse" {...register('strasse')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plz">PLZ</Label>
              <Input id="plz" {...register('plz')} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="ort">Ort</Label>
              <Input id="ort" {...register('ort')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Beginn Geschäftsjahr</Label>
            <Select onValueChange={(v) => setValue('geschaeftsjahr_beginn', v)} value={watch('geschaeftsjahr_beginn') || ''}>
              <SelectTrigger><SelectValue placeholder="Monat wählen..." /></SelectTrigger>
              <SelectContent>
                {MONATE.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-3">DATEV-Einstellungen</p>
            <p className="text-xs text-muted-foreground mb-3">
              Beraternummer und Mandantennummer werden vom Steuerberater vergeben und im DATEV-Export-Header benötigt.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="beraternummer">Beraternummer</Label>
                <Input id="beraternummer" placeholder="12345" maxLength={7} {...register('beraternummer')} />
                {errors.beraternummer && <p className="text-xs text-destructive">{errors.beraternummer.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mandantennummer">Mandantennummer</Label>
                <Input id="mandantennummer" placeholder="1" maxLength={5} {...register('mandantennummer')} />
                {errors.mandantennummer && <p className="text-xs text-destructive">{errors.mandantennummer.message}</p>}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading}>
            {loading ? 'Speichern...' : 'Änderungen speichern'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
