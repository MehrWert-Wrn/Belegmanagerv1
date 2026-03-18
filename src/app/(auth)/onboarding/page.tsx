'use client'

import { Suspense, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'

const TOTAL_STEPS = 3

const RECHTSFORMEN = [
  'GmbH',
  'GmbH & Co KG',
  'Einzelunternehmen',
  'OG',
  'KG',
  'AG',
  'Verein',
  'Sonstige',
]

const MONATE = [
  { value: '1', label: 'Jänner' },
  { value: '2', label: 'Februar' },
  { value: '3', label: 'März' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mai' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
]

const step1Schema = z.object({
  firmenname: z.string().min(1, 'Firmenname ist erforderlich'),
  rechtsform: z.string().min(1, 'Rechtsform ist erforderlich'),
  uid_nummer: z.string().regex(/^(ATU\d{8})?$/, 'Format: ATU gefolgt von 8 Ziffern (z.B. ATU12345678)').optional().or(z.literal('')),
})

const step2Schema = z.object({
  strasse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
})

const step3Schema = z.object({
  geschaeftsjahr_beginn: z.string().min(1, 'Bitte wähle den Beginn des Geschäftsjahres'),
})

type Step1Data = z.infer<typeof step1Schema>
type Step2Data = z.infer<typeof step2Schema>
type Step3Data = z.infer<typeof step3Schema>

type WizardData = {
  firmenname: string
  rechtsform: string
  uid_nummer: string
  strasse: string
  plz: string
  ort: string
  geschaeftsjahr_beginn: string
}

const STORAGE_KEY = 'onboarding_wizard_data'

function OnboardingWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentStep = Math.min(Math.max(parseInt(searchParams.get('step') || '1'), 1), TOTAL_STEPS)
  const [data, setData] = useState<Partial<WizardData>>({})

  // Load persisted data after mount to avoid SSR hydration mismatch,
  // then reset forms so react-hook-form picks up the restored values
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return
      const parsed: Partial<WizardData> = JSON.parse(saved)
      setData(parsed)
      form1.reset({ firmenname: parsed.firmenname || '', rechtsform: parsed.rechtsform || '', uid_nummer: parsed.uid_nummer || '' })
      form2.reset({ strasse: parsed.strasse || '', plz: parsed.plz || '', ort: parsed.ort || '' })
      form3.reset({ geschaeftsjahr_beginn: parsed.geschaeftsjahr_beginn || '1' })
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guard: step 1 data (firmenname) must exist before accessing steps 2 or 3
  useEffect(() => {
    if (currentStep > 1 && !data.firmenname) {
      setStep(1)
    }
  }, [currentStep, data.firmenname])

  function persist(updated: Partial<WizardData>) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
  }

  function setStep(step: number) {
    const url = new URL(window.location.href)
    url.searchParams.set('step', String(step))
    router.push(url.pathname + url.search)
  }

  // Step 1
  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: { firmenname: data.firmenname || '', rechtsform: data.rechtsform || '', uid_nummer: data.uid_nummer || '' },
  })

  // Step 2
  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: { strasse: data.strasse || '', plz: data.plz || '', ort: data.ort || '' },
  })

  // Step 3
  const form3 = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: { geschaeftsjahr_beginn: data.geschaeftsjahr_beginn || '1' },
  })

  function handleStep1(values: Step1Data) {
    const updated = { ...data, ...values }
    setData(updated)
    persist(updated)
    setStep(2)
  }

  function handleStep2(values: Step2Data) {
    const updated = { ...data, ...values }
    setData(updated)
    persist(updated)
    setStep(3)
  }

  async function handleStep3(values: Step3Data) {
    setError(null)
    setLoading(true)

    const merged = { ...data, ...values }

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmenname: merged.firmenname,
          rechtsform: merged.rechtsform || null,
          uid_nummer: merged.uid_nummer || null,
          strasse: merged.strasse || null,
          plz: merged.plz || null,
          ort: merged.ort || null,
          geschaeftsjahr_beginn: parseInt(merged.geschaeftsjahr_beginn || '1'),
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        setError(err.error || 'Fehler beim Speichern. Bitte versuche es erneut.')
        setLoading(false)
        return
      }
    } catch {
      setError('Ein unerwarteter Fehler ist aufgetreten.')
      setLoading(false)
      return
    }

    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Schritt {currentStep} von {TOTAL_STEPS}</span>
          <span>{Math.round((currentStep / TOTAL_STEPS) * 100)}%</span>
        </div>
        <Progress value={(currentStep / TOTAL_STEPS) * 100} className="h-2" />
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Firmendaten</CardTitle>
            <CardDescription>Grundlegende Informationen zu deinem Unternehmen</CardDescription>
          </CardHeader>
          <form onSubmit={form1.handleSubmit(handleStep1)}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="firmenname">Firmenname *</Label>
                <Input id="firmenname" placeholder="Muster GmbH" {...form1.register('firmenname')} />
                {form1.formState.errors.firmenname && (
                  <p className="text-xs text-destructive">{form1.formState.errors.firmenname.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rechtsform">Rechtsform *</Label>
                <Select
                  onValueChange={(v) => form1.setValue('rechtsform', v)}
                  value={form1.watch('rechtsform') || ''}
                >
                  <SelectTrigger id="rechtsform">
                    <SelectValue placeholder="Bitte wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RECHTSFORMEN.map(r => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form1.formState.errors.rechtsform && (
                  <p className="text-xs text-destructive">{form1.formState.errors.rechtsform.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="uid_nummer">UID-Nummer <span className="text-gray-400">(optional)</span></Label>
                <Input id="uid_nummer" placeholder="ATU12345678" {...form1.register('uid_nummer')} />
                {form1.formState.errors.uid_nummer && (
                  <p className="text-xs text-destructive">{form1.formState.errors.uid_nummer.message}</p>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full">Weiter</Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {currentStep === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Adresse</CardTitle>
            <CardDescription>Firmenadresse für Exporte und Berichte</CardDescription>
          </CardHeader>
          <form onSubmit={form2.handleSubmit(handleStep2)}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="strasse">Straße & Hausnummer</Label>
                <Input id="strasse" placeholder="Musterstraße 1" {...form2.register('strasse')} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="plz">PLZ</Label>
                  <Input id="plz" placeholder="1010" {...form2.register('plz')} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="ort">Ort</Label>
                  <Input id="ort" placeholder="Wien" {...form2.register('ort')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Land</Label>
                <Input value="Österreich" disabled className="bg-gray-50" />
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Zurück
              </Button>
              <Button type="submit" className="flex-1">Weiter</Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {currentStep === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Geschäftsjahr</CardTitle>
            <CardDescription>Wann beginnt dein Geschäftsjahr?</CardDescription>
          </CardHeader>
          <form onSubmit={form3.handleSubmit(handleStep3)}>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="geschaeftsjahr_beginn">Beginn des Geschäftsjahres *</Label>
                <Select
                  onValueChange={(v) => form3.setValue('geschaeftsjahr_beginn', v)}
                  defaultValue={data.geschaeftsjahr_beginn || '1'}
                >
                  <SelectTrigger id="geschaeftsjahr_beginn">
                    <SelectValue placeholder="Monat wählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MONATE.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form3.formState.errors.geschaeftsjahr_beginn && (
                  <p className="text-xs text-destructive">{form3.formState.errors.geschaeftsjahr_beginn.message}</p>
                )}
              </div>

              {/* Zusammenfassung */}
              <div className="rounded-md bg-gray-50 p-4 space-y-2 text-sm">
                <p className="font-medium text-gray-700">Zusammenfassung</p>
                <div className="space-y-1 text-gray-600">
                  <p><span className="text-gray-400">Firma:</span> {data.firmenname} ({data.rechtsform})</p>
                  {data.uid_nummer && <p><span className="text-gray-400">UID:</span> {data.uid_nummer}</p>}
                  {data.ort && <p><span className="text-gray-400">Adresse:</span> {data.strasse}, {data.plz} {data.ort}</p>}
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
                  {error}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)} disabled={loading}>
                Zurück
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? 'Speichern...' : 'Abschließen'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="h-96 rounded-lg bg-white animate-pulse" />}>
      <OnboardingWizard />
    </Suspense>
  )
}
