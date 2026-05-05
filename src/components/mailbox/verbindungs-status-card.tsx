'use client'

/**
 * PROJ-32: VerbindungsStatusCard - Status der aktiven Mailbox-Verbindung
 *
 * Zeigt:
 *  - Provider + E-Mail-Adresse
 *  - Status (Aktiv / Verbindungsfehler)
 *  - Letzter erfolgreicher Poll (relativ, "vor X Minuten")
 *  - Fehlermeldung (nur bei status='error')
 *  - Aktionen: "Verbindung testen" (immer), "Neu verbinden" (nur bei error),
 *    "Verbindung trennen"
 */

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TrennenDialog } from './trennen-dialog'
import type { MailboxTestErgebnis, MailboxVerbindung } from './mailbox-types'

interface VerbindungsStatusCardProps {
  verbindung: MailboxVerbindung
  onTrennen: () => Promise<void>
  onNeuVerbinden: () => void
}

function providerLabel(provider: MailboxVerbindung['provider']): string {
  switch (provider) {
    case 'imap':
      return 'IMAP'
    case 'gmail':
      return 'Gmail'
    case 'microsoft':
      return 'Microsoft 365'
  }
}

function providerIcon(provider: MailboxVerbindung['provider']) {
  if (provider === 'imap') return <Inbox className="h-5 w-5" aria-hidden="true" />
  return <Mail className="h-5 w-5" aria-hidden="true" />
}

function formatRelative(dateStr: string | null): string {
  if (!dateStr) return 'Noch nicht geprueft'
  const date = new Date(dateStr)
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'gerade eben'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} ${minutes === 1 ? 'Minute' : 'Minuten'}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} ${hours === 1 ? 'Stunde' : 'Stunden'}`
  const days = Math.floor(hours / 24)
  if (days < 30) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' }).format(date)
}

export function VerbindungsStatusCard({
  verbindung,
  onTrennen,
  onNeuVerbinden,
}: VerbindungsStatusCardProps) {
  const [testet, setTestet] = useState(false)
  const [testErgebnis, setTestErgebnis] = useState<MailboxTestErgebnis | null>(null)

  const istFehler = verbindung.status === 'error'
  const label = providerLabel(verbindung.provider)

  async function handleTest() {
    setTestet(true)
    setTestErgebnis(null)
    try {
      const res = await fetch('/api/mailbox/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verbindung_id: verbindung.id }),
      })
      const result: MailboxTestErgebnis = await res.json().catch(() => ({
        erfolg: false,
        meldung: 'Unerwartete Antwort vom Server.',
      }))
      setTestErgebnis(result)
    } catch (err) {
      setTestErgebnis({
        erfolg: false,
        meldung: err instanceof Error ? err.message : 'Verbindungstest fehlgeschlagen.',
      })
    } finally {
      setTestet(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={
                istFehler
                  ? 'flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-600'
                  : 'flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700'
              }
            >
              {providerIcon(verbindung.provider)}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base">
                {label}
                {verbindung.email_adresse && (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {verbindung.email_adresse}
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Zuletzt erfolgreich geprueft: {formatRelative(verbindung.last_successful_poll_at)}
              </p>
            </div>
          </div>
          {istFehler ? (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" />
              Verbindungsfehler
            </Badge>
          ) : (
            <Badge className="bg-teal-600 hover:bg-teal-600 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Aktiv
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {istFehler && verbindung.error_message && (
          <Alert variant="destructive">
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>{verbindung.error_message}</AlertDescription>
          </Alert>
        )}

        {testErgebnis && (
          <Alert variant={testErgebnis.erfolg ? 'default' : 'destructive'}>
            <div className="flex items-start gap-2">
              {testErgebnis.erfolg ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <AlertDescription>
                {testErgebnis.erfolg
                  ? 'Verbindung erfolgreich getestet.'
                  : testErgebnis.meldung || 'Verbindungstest fehlgeschlagen.'}
              </AlertDescription>
            </div>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTest}
            disabled={testet}
          >
            {testet ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Teste...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Verbindung testen
              </>
            )}
          </Button>

          {istFehler && (
            <Button type="button" size="sm" onClick={onNeuVerbinden}>
              Neu verbinden
            </Button>
          )}

          <TrennenDialog
            providerLabel={
              verbindung.email_adresse ? `${label} (${verbindung.email_adresse})` : label
            }
            onTrennen={onTrennen}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Verbindung trennen
            </Button>
          </TrennenDialog>
        </div>
      </CardContent>
    </Card>
  )
}
