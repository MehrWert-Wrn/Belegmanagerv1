'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Landmark, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { BanksApiVerbindungKarte } from '@/components/bankverbindungen/banksapi-verbindung-karte'
import type {
  BanksApiSyncErgebnis,
  BanksApiVerbindung,
} from '@/components/bankverbindungen/banksapi-types'
import { toast } from 'sonner'

export default function BankverbindungenPage() {
  const searchParams = useSearchParams()

  const [verbindungen, setVerbindungen] = useState<BanksApiVerbindung[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const success = searchParams.get('banksapi_success')
    const errorParam = searchParams.get('banksapi_error')

    if (success === 'true') {
      toast.success('Bankkonto erfolgreich verbunden')
    }
    if (errorParam) {
      const messages: Record<string, string> = {
        nicht_authentifiziert: 'Du bist nicht angemeldet. Bitte melde dich erneut an.',
        session_fehlt: 'Sitzungsdaten fehlen. Bitte versuche es erneut.',
        ungueltige_session: 'Ungültige Sitzung. Bitte versuche es erneut.',
        session_nicht_gefunden: 'Sitzung nicht gefunden. Bitte versuche es erneut.',
        session_bereits_verwendet: 'Diese Sitzung wurde bereits verwendet.',
        session_abgelaufen: 'Die Sitzung ist abgelaufen. Bitte versuche es erneut.',
        zugriff_verweigert: 'Zugriff verweigert.',
        kein_mandant: 'Kein Mandant für den aktuellen User gefunden.',
        keine_callback_url: 'Keine Callback-URL konfiguriert.',
        ungueltige_callback_url: 'Ungültige Callback-URL.',
        keine_verbindung: 'Es wurde keine Bankverbindung erstellt. Bitte versuche es erneut.',
        abgebrochen: 'Verbindungsvorgang wurde abgebrochen.',
        server_fehler: 'Ein Serverfehler ist aufgetreten. Bitte versuche es später erneut.',
      }
      toast.error(messages[errorParam] || 'Ein Fehler ist aufgetreten.')
    }

    if (success || errorParam) {
      window.history.replaceState({}, '', '/settings/bankverbindungen')
    }
  }, [searchParams])

  const fetchVerbindungen = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/banksapi/verbindungen')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Laden der Bankverbindungen')
      }
      const data = await res.json()
      setVerbindungen(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVerbindungen()
  }, [fetchVerbindungen])

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch('/api/banksapi/verbindungen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verbindung konnte nicht gestartet werden')
      }
      const data = await res.json()
      if (data.webform_url) {
        window.location.href = data.webform_url
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen')
      setConnecting(false)
    }
  }

  async function handleSync(id: string): Promise<BanksApiSyncErgebnis | null> {
    try {
      const res = await fetch(`/api/banksapi/sync/${id}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || 'Synchronisierung fehlgeschlagen')
        fetchVerbindungen()
        return null
      }
      const result: BanksApiSyncErgebnis = await res.json()
      toast.success(`${result.importiert} Transaktionen importiert`)
      fetchVerbindungen()
      return result
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Synchronisierung fehlgeschlagen')
      return null
    }
  }

  async function handleTrennen(id: string) {
    try {
      const res = await fetch(`/api/banksapi/verbindungen/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verbindung konnte nicht getrennt werden')
      }
      toast.success('Bankverbindung getrennt')
      fetchVerbindungen()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennung fehlgeschlagen')
    }
  }

  const scaCount = verbindungen.filter((v) => v.status === 'sca_faellig').length

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-10 w-44" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setLoading(true)
              fetchVerbindungen()
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bankverbindungen</h2>
              <p className="text-sm text-muted-foreground">
                Verbinde dein Bankkonto, um Transaktionen automatisch zu importieren
              </p>
            </div>
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Bankkonto verbinden
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Hinweis:</span> Beim Verbinden wirst du
            zweimal zur Anmeldung bei deiner Bank aufgefordert – das ist der normale Prozess und
            kein Fehler.
          </p>

          {scaCount > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Aktion erforderlich</AlertTitle>
              <AlertDescription>
                {scaCount === 1
                  ? 'Eine Bankverbindung muss neu verbunden werden.'
                  : `${scaCount} Bankverbindungen müssen neu verbunden werden.`}{' '}
                Bitte trenne die betroffenen Verbindungen und verbinde sie erneut.
              </AlertDescription>
            </Alert>
          )}

          {verbindungen.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Landmark className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                Noch keine Bankverbindungen vorhanden.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verbinde dein Bankkonto, um Transaktionen automatisch zu importieren.
                Der CSV-Upload bleibt weiterhin verfügbar.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Erstes Bankkonto verbinden
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {verbindungen.map((v) => (
                <BanksApiVerbindungKarte
                  key={v.id}
                  verbindung={v}
                  onSync={handleSync}
                  onTrennen={handleTrennen}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
