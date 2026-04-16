'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  Copy,
  Mail,
  Building2,
  MessageCircle,
  Plug,
  X,
  Calendar,
  ExternalLink,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { CredentialForm } from '@/components/onboarding/credential-form'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toast } from 'sonner'

type StepKey =
  | 'email_address_done'
  | 'email_connection_done'
  | 'company_data_done'
  | 'whatsapp_done'
  | 'portal_connections_done'

interface OnboardingProgress {
  email_address_done: boolean
  email_connection_done: boolean
  company_data_done: boolean
  whatsapp_done: boolean
  portal_connections_done: boolean
  dismissed_at: string | null
}

const STEPS: Array<{ key: StepKey; title: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'email_address_done', title: 'E-Mail-Adresse für Belege', icon: Mail },
  { key: 'email_connection_done', title: 'Daten für Anbindung an das E-Mail-Postfach', icon: Plug },
  { key: 'company_data_done', title: 'Firmendaten', icon: Building2 },
  { key: 'whatsapp_done', title: 'WhatsApp-Nummer für DSGVO-konforme Belegübergabe', icon: MessageCircle },
  { key: 'portal_connections_done', title: 'Portalanbindungen (optional)', icon: Plug },
]

const MEETING_URL = 'https://cal.meetergo.com/pkindlmayr/15-min-meeting-onboarding-belegerfassung'
const WHATSAPP_NUMBER = '+4367761906498'
const WHATSAPP_LINK = 'https://wa.me/4367761906498'

export function OnboardingCheckliste() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [updating, setUpdating] = useState<StepKey | null>(null)
  const [dismissing, setDismissing] = useState(false)

  const fetchProgress = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding/progress')
      if (res.status === 404) {
        setNotFound(true)
        setProgress(null)
        return
      }
      if (!res.ok) {
        throw new Error('Fehler beim Laden des Onboarding-Fortschritts')
      }
      const data = (await res.json()) as OnboardingProgress
      setProgress(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProgress()
  }, [fetchProgress])

  const handleToggleStep = async (stepKey: StepKey) => {
    if (!progress || progress[stepKey]) return
    setUpdating(stepKey)
    // Optimistic update
    const previous = progress
    setProgress({ ...progress, [stepKey]: true })
    try {
      const res = await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step_key: stepKey }),
      })
      if (!res.ok) throw new Error('Fehler beim Speichern')
      const data = (await res.json()) as OnboardingProgress
      setProgress(data)
    } catch (err) {
      setProgress(previous)
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setUpdating(null)
    }
  }

  const handleDismiss = async () => {
    if (!progress) return
    setDismissing(true)
    try {
      const res = await fetch('/api/onboarding/progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' }),
      })
      if (!res.ok) throw new Error('Fehler beim Schließen der Checkliste')
      const data = (await res.json()) as OnboardingProgress
      setProgress(data)
      toast.success('Checkliste geschlossen. Viel Erfolg mit Belegmanager!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Schließen')
    } finally {
      setDismissing(false)
    }
  }

  const handleCopyWhatsApp = async () => {
    try {
      await navigator.clipboard.writeText(WHATSAPP_NUMBER)
      toast.success('Nummer kopiert')
    } catch {
      toast.error('Kopieren fehlgeschlagen')
    }
  }

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardHeader>
          <CardTitle className="text-base text-red-800">Fehler</CardTitle>
          <CardDescription className="text-red-700">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={fetchProgress}>
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Empty state: no progress row exists (existing mandant) or dismissed
  if (notFound || !progress || progress.dismissed_at) {
    return null
  }

  const completedCount = STEPS.filter((s) => progress[s.key]).length
  const totalSteps = STEPS.length
  const percent = Math.round((completedCount / totalSteps) * 100)
  const allDone = completedCount === totalSteps

  return (
    <Card className="border-teal-200 bg-gradient-to-br from-teal-50/60 to-white">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl">Willkommen bei Belegmanager</CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-relaxed">
              Du kannst nun 30 Tage kostenlos unsere Belegmanager Software testen.
              Bitte versuche so schnell wie möglich, uns deine Zugangsdaten bzw. die
              geforderten Daten unten zuzusenden, damit wir dir die automatisierte
              Belegerfassung freischalten können.
            </CardDescription>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-teal-900">
              {completedCount} von {totalSteps} Schritten erledigt
            </span>
            <span className="font-semibold text-teal-700">{percent}%</span>
          </div>
          <Progress
            value={percent}
            aria-label="Onboarding-Fortschritt"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <Accordion type="multiple" className="w-full">
          {STEPS.map((step, index) => {
            const isDone = progress[step.key]
            const Icon = step.icon
            return (
              <AccordionItem key={step.key} value={step.key} className="border-teal-100">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 items-center gap-3 text-left">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                        isDone
                          ? 'border-teal-500 bg-teal-500 text-white'
                          : 'border-teal-200 bg-white text-teal-600'
                      }`}
                      aria-hidden="true"
                    >
                      {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            isDone ? 'text-muted-foreground line-through' : 'text-foreground'
                          }`}
                        >
                          Schritt {index + 1}: {step.title}
                        </span>
                        {step.key === 'portal_connections_done' && (
                          <Badge variant="secondary" className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                            +5€ netto pro Portalanbindung
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pl-11">
                  <StepContent
                    stepKey={step.key}
                    isDone={isDone}
                    updating={updating === step.key}
                    onToggle={() => handleToggleStep(step.key)}
                    onCopyWhatsApp={handleCopyWhatsApp}
                    onCredentialSubmitted={fetchProgress}
                  />
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>

        {/* Dismiss button */}
        <div className="flex justify-end pt-2">
          {allDone ? (
            <Button
              onClick={handleDismiss}
              disabled={dismissing}
              className="bg-teal-600 hover:bg-teal-700"
            >
              <X className="mr-2 h-4 w-4" />
              {dismissing ? 'Wird geschlossen...' : 'Checkliste schließen'}
            </Button>
          ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" disabled>
                      <X className="mr-2 h-4 w-4" />
                      Checkliste schließen
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Bitte alle Schritte abschließen</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

      </CardContent>
    </Card>
  )
}

interface StepContentProps {
  stepKey: StepKey
  isDone: boolean
  updating: boolean
  onToggle: () => void
  onCopyWhatsApp: () => void
  onCredentialSubmitted?: () => void
}

function StepContent({ stepKey, isDone, updating, onToggle, onCopyWhatsApp, onCredentialSubmitted }: StepContentProps) {
  const markAsDone = (
    <div className="mt-4 flex items-center gap-2">
      <Checkbox
        id={`check-${stepKey}`}
        checked={isDone}
        disabled={isDone || updating}
        onCheckedChange={() => onToggle()}
        aria-label="Als erledigt markieren"
      />
      <label
        htmlFor={`check-${stepKey}`}
        className={`text-sm ${isDone ? 'text-muted-foreground' : 'cursor-pointer text-foreground'}`}
      >
        {isDone ? 'Erledigt' : 'Als erledigt markieren'}
      </label>
    </div>
  )

  switch (stepKey) {
    case 'email_address_done':
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Richte idealerweise eine eigene E-Mail-Adresse (z.B.{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">belege@deinefirma.at</code>)
            ein, die ausschließlich für Rechnungen und Belege verwendet wird.
          </p>
          <p>
            Das ist ein Vorschlag, deinen Prozess zu optimieren, aber kein Muss!
            Der Belegmanager läuft auch mit deiner persönlichen Mailadresse oder
            einer Office-Mailadresse.
          </p>
          {markAsDone}
        </div>
      )

    case 'email_connection_done':
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>Klicke auf deinen E-Mail-Anbieter fuer eine Schritt-fuer-Schritt-Anleitung:</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/help/erste-schritte/email-microsoft-365">
                Microsoft 365
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/help/erste-schritte/email-gmail">
                Gmail
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/help/erste-schritte/email-imap">
                IMAP
                <ExternalLink className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
          </div>
          <p>
            Falls du dir nicht sicher bist, wie die Postfach-Anbindung funktioniert,
            wende dich gerne an deinen IT-Dienstleister &ndash; er kann dir dabei helfen.
          </p>

          {/* Credential submission form */}
          <CredentialForm onSubmitted={onCredentialSubmitted} />

          {markAsDone}
        </div>
      )

    case 'company_data_done':
      return (
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">Firmenanschrift</strong> (wie auf Rechnungen) &{' '}
            <strong className="text-foreground">UID-Nummer</strong>
          </p>
          <p>
            Hinterlege deine vollständigen Firmendaten in den{' '}
            <Link href="/settings" className="font-medium text-teal-700 underline underline-offset-2">
              Einstellungen
            </Link>
            {' '}oder sende sie an das Mehr.Wert-Team.
          </p>
          {markAsDone}
        </div>
      )

    case 'whatsapp_done':
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Speichere dir die Nummer der Mehr.Wert Gruppe GmbH ein und sende uns
            ganz einfach pro Beleg ein Bild oder Datei an diese Nummer.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                {WHATSAPP_NUMBER}
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={onCopyWhatsApp}>
              <Copy className="mr-1.5 h-4 w-4" />
              Nummer kopieren
            </Button>
          </div>
          {markAsDone}
        </div>
      )

    case 'portal_connections_done':
      return (
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Falls vorhanden: Benutzername & Passwort für{' '}
            <strong className="text-foreground">Amazon, Lieferanten-Portale</strong>, etc.
          </p>
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            Bitte Meeting vereinbaren für die gemeinsame Portalanbindung.
          </p>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700" asChild>
            <a href={MEETING_URL} target="_blank" rel="noopener noreferrer">
              <Calendar className="mr-1.5 h-4 w-4" />
              Meeting vereinbaren
            </a>
          </Button>
          {markAsDone}
        </div>
      )

    default:
      return null
  }
}

