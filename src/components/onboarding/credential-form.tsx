'use client'

import { useState, useEffect, useCallback } from 'react'
import { Shield, CheckCircle2, Loader2, AlertCircle, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

type Provider = 'microsoft365' | 'gmail' | 'imap'

interface CredentialStatus {
  provider: string
  submitted_at: string
  acknowledged_at: string | null
}

interface CredentialFormProps {
  onSubmitted?: () => void
}

const PROVIDER_LABELS: Record<Provider, string> = {
  microsoft365: 'Microsoft 365',
  gmail: 'Gmail',
  imap: 'IMAP',
}

export function CredentialForm({ onSubmitted }: CredentialFormProps) {
  const [status, setStatus] = useState<CredentialStatus[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState<Provider | ''>('')

  // IMAP fields
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [imapSsl, setImapSsl] = useState(true)
  const [imapEmail, setImapEmail] = useState('')
  const [imapPassword, setImapPassword] = useState('')

  // Microsoft 365 fields
  const [msTenantId, setMsTenantId] = useState('')
  const [msClientId, setMsClientId] = useState('')
  const [msClientSecret, setMsClientSecret] = useState('')

  // Gmail fields
  const [gmailEmail, setGmailEmail] = useState('')
  const [gmailClientId, setGmailClientId] = useState('')
  const [gmailClientSecret, setGmailClientSecret] = useState('')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/onboarding/credentials')
      if (res.status === 404) {
        setStatus(null)
        return
      }
      if (!res.ok) throw new Error('Fehler beim Laden')
      const data = await res.json()
      setStatus(Array.isArray(data) ? data : null)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!provider) return

    setSubmitting(true)
    setError(null)

    let fields: Record<string, unknown>

    if (provider === 'imap') {
      if (!imapHost || !imapEmail || !imapPassword) {
        setError('Bitte alle Pflichtfelder ausfuellen.')
        setSubmitting(false)
        return
      }
      fields = {
        host: imapHost.trim(),
        port: parseInt(imapPort, 10) || 993,
        ssl: imapSsl,
        email: imapEmail.trim(),
        password: imapPassword,
      }
    } else if (provider === 'microsoft365') {
      if (!msTenantId || !msClientId || !msClientSecret) {
        setError('Bitte alle Pflichtfelder ausfuellen.')
        setSubmitting(false)
        return
      }
      fields = {
        tenant_id: msTenantId.trim(),
        client_id: msClientId.trim(),
        client_secret: msClientSecret,
      }
    } else if (provider === 'gmail') {
      if (!gmailEmail || !gmailClientId || !gmailClientSecret) {
        setError('Bitte alle Pflichtfelder ausfuellen.')
        setSubmitting(false)
        return
      }
      fields = {
        email: gmailEmail.trim(),
        client_id: gmailClientId.trim(),
        client_secret: gmailClientSecret,
      }
    } else {
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/onboarding/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, fields }),
      })

      if (res.status === 409) {
        setError('Zugangsdaten fuer diesen Anbieter wurden bereits uebermittelt.')
        setSubmitting(false)
        return
      }

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Fehler beim Absenden')
      }

      toast.success('Zugangsdaten wurden sicher uebermittelt.')
      await fetchStatus()
      onSubmitted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Status wird geladen...
      </div>
    )
  }

  // If credentials already submitted
  if (status && status.length > 0) {
    const allAcknowledged = status.every((s) => s.acknowledged_at)
    const pendingSubmissions = status.filter((s) => !s.acknowledged_at)

    if (allAcknowledged) {
      return (
        <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-teal-900">
                Deine E-Mail-Anbindung ist aktiv.
              </p>
              <p className="text-sm text-teal-700">
                {status.map((s) => PROVIDER_LABELS[s.provider as Provider] || s.provider).join(', ')} wurde erfolgreich eingerichtet.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-teal-900">
              Zugangsdaten uebermittelt
            </p>
            <p className="text-sm text-teal-700">
              Deine Zugangsdaten ({pendingSubmissions.map((s) => PROVIDER_LABELS[s.provider as Provider] || s.provider).join(', ')}) wurden sicher uebermittelt. Wir richten deine E-Mail-Anbindung ein und loeschen die Daten danach.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show the form
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-foreground">
          Zugangsdaten direkt uebermitteln
        </h4>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider selection */}
          <div className="space-y-2">
            <Label htmlFor="provider-select">Anbieter</Label>
            <Select
              value={provider}
              onValueChange={(val) => setProvider(val as Provider)}
            >
              <SelectTrigger id="provider-select" className="w-full">
                <SelectValue placeholder="E-Mail-Anbieter waehlen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="microsoft365">Microsoft 365</SelectItem>
                <SelectItem value="gmail">Gmail</SelectItem>
                <SelectItem value="imap">IMAP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Provider-specific fields */}
          {provider === 'imap' && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="imap-host">Host *</Label>
                  <Input
                    id="imap-host"
                    type="text"
                    placeholder="imap.example.com"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    required
                    maxLength={253}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-port">Port</Label>
                  <Input
                    id="imap-port"
                    type="number"
                    placeholder="993"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    min={1}
                    max={65535}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="imap-ssl"
                  checked={imapSsl}
                  onCheckedChange={(checked) => setImapSsl(checked === true)}
                />
                <Label htmlFor="imap-ssl" className="text-sm font-normal">
                  SSL/TLS verwenden
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imap-email">E-Mail-Adresse *</Label>
                <Input
                  id="imap-email"
                  type="email"
                  placeholder="belege@deinefirma.at"
                  value={imapEmail}
                  onChange={(e) => setImapEmail(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imap-password">Passwort *</Label>
                <Input
                  id="imap-password"
                  type="password"
                  placeholder="Passwort eingeben"
                  value={imapPassword}
                  onChange={(e) => setImapPassword(e.target.value)}
                  required
                  maxLength={500}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {provider === 'microsoft365' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="ms-tenant-id">Tenant ID *</Label>
                <Input
                  id="ms-tenant-id"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={msTenantId}
                  onChange={(e) => setMsTenantId(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ms-client-id">Client ID *</Label>
                <Input
                  id="ms-client-id"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={msClientId}
                  onChange={(e) => setMsClientId(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ms-client-secret">Client Secret *</Label>
                <Input
                  id="ms-client-secret"
                  type="password"
                  placeholder="Client Secret eingeben"
                  value={msClientSecret}
                  onChange={(e) => setMsClientSecret(e.target.value)}
                  required
                  maxLength={500}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {provider === 'gmail' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="gmail-email">E-Mail-Adresse des Google-Kontos *</Label>
                <Input
                  id="gmail-email"
                  type="email"
                  placeholder="name@gmail.com"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gmail-client-id">Client ID *</Label>
                <Input
                  id="gmail-client-id"
                  type="text"
                  placeholder="xxxxxxxxx.apps.googleusercontent.com"
                  value={gmailClientId}
                  onChange={(e) => setGmailClientId(e.target.value)}
                  required
                  maxLength={500}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gmail-client-secret">Client Secret *</Label>
                <Input
                  id="gmail-client-secret"
                  type="password"
                  placeholder="Client Secret eingeben"
                  value={gmailClientSecret}
                  onChange={(e) => setGmailClientSecret(e.target.value)}
                  required
                  maxLength={500}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {/* Security badge */}
          {provider && (
            <>
              <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/60 px-3 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-teal-600" />
                <p className="text-xs text-teal-800">
                  <span className="font-semibold">AES-256-verschluesselt</span> &middot; Nach Einrichtung geloescht &middot; DSGVO-konform
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={submitting || !provider}
                className="w-full bg-[#08525E] hover:bg-[#1D8A9E]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird uebermittelt...
                  </>
                ) : (
                  <>
                    <Shield className="mr-2 h-4 w-4" />
                    Zugangsdaten einreichen
                  </>
                )}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
