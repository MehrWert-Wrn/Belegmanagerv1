'use client'

/**
 * PROJ-32: ImapFormular - Inline-Formular fuer IMAP-Anbindung
 *
 * Felder:
 *  - Host (Pflicht, z.B. imap.gmail.com)
 *  - Port (Pflicht, Default: 993)
 *  - SSL/TLS (Checkbox, Default: aktiv)
 *  - E-Mail-Adresse (Pflicht, type="email")
 *  - Passwort (Pflicht, type="password")
 *  - Ordner (optional, Default: INBOX)
 *
 * Workflow:
 *  1. Mandant fuellt Felder aus
 *  2. Klick auf "Verbindung testen" - API testet IMAP-Login
 *  3. Bei Erfolg: "Verbindung speichern" wird aktiv
 *  4. Klick auf "Verbindung speichern" - API speichert verschluesselte Credentials
 */

import { FormEvent, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { ImapFormularDaten, MailboxTestErgebnis } from './mailbox-types'

interface ImapFormularProps {
  /** Wird aufgerufen wenn der Mandant das Formular abbricht (Klick "Abbrechen"). */
  onAbbrechen: () => void
  /** Wird aufgerufen wenn die Verbindung erfolgreich gespeichert wurde. */
  onGespeichert: () => void
}

const PROVIDER_PRESETS: Array<{ label: string; host: string; port: number }> = [
  { label: 'Gmail', host: 'imap.gmail.com', port: 993 },
  { label: 'GMX', host: 'imap.gmx.net', port: 993 },
  { label: 'web.de', host: 'imap.web.de', port: 993 },
  { label: 'Outlook.com', host: 'outlook.office365.com', port: 993 },
]

export function ImapFormular({ onAbbrechen, onGespeichert }: ImapFormularProps) {
  const [daten, setDaten] = useState<ImapFormularDaten>({
    host: '',
    port: 993,
    ssl: true,
    email: '',
    password: '',
    ordner: 'INBOX',
  })

  const [testet, setTestet] = useState(false)
  const [speichert, setSpeichert] = useState(false)
  const [testErgebnis, setTestErgebnis] = useState<MailboxTestErgebnis | null>(null)
  const [formFehler, setFormFehler] = useState<string | null>(null)

  function setField<K extends keyof ImapFormularDaten>(key: K, value: ImapFormularDaten[K]) {
    setDaten((d) => ({ ...d, [key]: value }))
    // Wenn Daten geaendert werden, ist ein vorheriges Test-Ergebnis ungueltig
    setTestErgebnis(null)
  }

  function setPreset(preset: { host: string; port: number }) {
    setDaten((d) => ({ ...d, host: preset.host, port: preset.port }))
    setTestErgebnis(null)
  }

  function validiereFelder(): string | null {
    if (!daten.host.trim()) return 'Bitte einen Host angeben (z.B. imap.gmail.com).'
    if (!Number.isInteger(daten.port) || daten.port < 1 || daten.port > 65535) {
      return 'Bitte einen gueltigen Port zwischen 1 und 65535 angeben.'
    }
    if (!daten.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(daten.email)) {
      return 'Bitte eine gueltige E-Mail-Adresse angeben.'
    }
    if (!daten.password) return 'Bitte das Passwort angeben.'
    return null
  }

  async function handleTest(e: FormEvent) {
    e.preventDefault()
    const fehler = validiereFelder()
    if (fehler) {
      setFormFehler(fehler)
      setTestErgebnis(null)
      return
    }
    setFormFehler(null)
    setTestet(true)
    try {
      const res = await fetch('/api/mailbox/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'imap', credentials: daten }),
      })
      const result: MailboxTestErgebnis = await res.json().catch(() => ({
        erfolg: false,
        meldung: 'Unerwartete Antwort vom Server.',
      }))
      setTestErgebnis(result)
    } catch (err) {
      setTestErgebnis({
        erfolg: false,
        meldung:
          err instanceof Error
            ? err.message
            : 'Verbindungstest fehlgeschlagen. Pruefe deine Internet-Verbindung.',
      })
    } finally {
      setTestet(false)
    }
  }

  async function handleSpeichern() {
    const fehler = validiereFelder()
    if (fehler) {
      setFormFehler(fehler)
      return
    }
    setFormFehler(null)
    setSpeichert(true)
    try {
      const res = await fetch('/api/mailbox/verbindung', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'imap', credentials: daten }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verbindung konnte nicht gespeichert werden.')
      }
      onGespeichert()
    } catch (err) {
      setFormFehler(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  const speichernAktiv = testErgebnis?.erfolg === true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">IMAP-Verbindung einrichten</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleTest}>
          {/* Provider-Presets */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Schnellauswahl Anbieter</Label>
            <div className="flex flex-wrap gap-2">
              {PROVIDER_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreset(preset)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="imap-host">
                Host <span className="text-destructive">*</span>
              </Label>
              <Input
                id="imap-host"
                type="text"
                placeholder="imap.gmail.com"
                value={daten.host}
                onChange={(e) => setField('host', e.target.value)}
                required
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="imap-port">
                Port <span className="text-destructive">*</span>
              </Label>
              <Input
                id="imap-port"
                type="number"
                min={1}
                max={65535}
                value={daten.port}
                onChange={(e) => setField('port', Number(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="imap-ssl"
              checked={daten.ssl}
              onCheckedChange={(checked) => setField('ssl', checked === true)}
            />
            <Label htmlFor="imap-ssl" className="cursor-pointer">
              SSL/TLS verwenden (empfohlen)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imap-email">
              E-Mail-Adresse <span className="text-destructive">*</span>
            </Label>
            <Input
              id="imap-email"
              type="email"
              placeholder="max.mustermann@gmail.com"
              value={daten.email}
              onChange={(e) => setField('email', e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imap-password">
              Passwort <span className="text-destructive">*</span>
            </Label>
            <Input
              id="imap-password"
              type="password"
              placeholder="App-Passwort oder Mailbox-Passwort"
              value={daten.password}
              onChange={(e) => setField('password', e.target.value)}
              required
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Bei Gmail/GMX wird ein <strong>App-spezifisches Passwort</strong> empfohlen.
              Dein Passwort wird AES-256 verschluesselt gespeichert.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="imap-ordner">Ordner (optional)</Label>
            <Input
              id="imap-ordner"
              type="text"
              placeholder="INBOX"
              value={daten.ordner}
              onChange={(e) => setField('ordner', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Standard: INBOX. Du kannst nach erfolgreicher Verbindung weitere Ordner auswaehlen.
            </p>
          </div>

          {formFehler && (
            <Alert variant="destructive">
              <AlertDescription>{formFehler}</AlertDescription>
            </Alert>
          )}

          {testErgebnis && (
            <Alert variant={testErgebnis.erfolg ? 'default' : 'destructive'}>
              <div className="flex items-start gap-2">
                {testErgebnis.erfolg ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <AlertDescription>
                  {testErgebnis.erfolg
                    ? 'Verbindung erfolgreich getestet. Du kannst nun speichern.'
                    : testErgebnis.meldung || 'Verbindungstest fehlgeschlagen.'}
                </AlertDescription>
              </div>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button type="submit" variant="outline" disabled={testet || speichert}>
              {testet ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Teste Verbindung...
                </>
              ) : (
                'Verbindung testen'
              )}
            </Button>
            <Button
              type="button"
              onClick={handleSpeichern}
              disabled={!speichernAktiv || speichert || testet}
            >
              {speichert ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Speichert...
                </>
              ) : (
                'Verbindung speichern'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onAbbrechen}
              disabled={testet || speichert}
            >
              Abbrechen
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
