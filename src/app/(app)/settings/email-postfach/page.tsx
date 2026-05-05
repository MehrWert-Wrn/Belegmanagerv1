'use client'

/**
 * PROJ-32: Settings-Seite fuer das native Mandanten-Postfach
 *
 * Diese Seite bietet Mandanten Self-Service zur Anbindung des eigenen
 * E-Mail-Postfachs (IMAP oder Gmail OAuth2). Microsoft 365 ist als
 * "Demnaechst verfuegbar" sichtbar, aber nicht anklickbar.
 *
 * Drei Hauptzustaende:
 *  1. Loading - Status wird geladen
 *  2. Keine Verbindung - Drei Provider-Karten + IMAP-Formular bei Klick
 *  3. Aktive Verbindung - Status-Card + Einstellungen-Panel
 */

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AnbieterKarten } from '@/components/mailbox/anbieter-karten'
import { ImapFormular } from '@/components/mailbox/imap-formular'
import { VerbindungsStatusCard } from '@/components/mailbox/verbindungs-status-card'
import { EinstellungenPanel } from '@/components/mailbox/einstellungen-panel'
import type { MailboxVerbindung } from '@/components/mailbox/mailbox-types'

const OAUTH_FEHLER_MELDUNGEN: Record<string, string> = {
  zugriff_verweigert: 'Zugriff wurde nicht gewaehrt. Bitte versuche es erneut.',
  state_mismatch: 'Sicherheitspruefung fehlgeschlagen. Bitte starte den Vorgang neu.',
  kein_refresh_token: 'Google hat keinen Refresh-Token gesendet. Bitte verbinde erneut.',
  token_tausch_fehlgeschlagen: 'Tokens konnten nicht ausgetauscht werden. Bitte versuche es erneut.',
  nicht_authentifiziert: 'Du bist nicht angemeldet. Bitte melde dich erneut an.',
  server_fehler: 'Ein Serverfehler ist aufgetreten. Bitte versuche es spaeter erneut.',
}

export default function EmailPostfachPage() {
  const searchParams = useSearchParams()

  const [verbindung, setVerbindung] = useState<MailboxVerbindung | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [imapFormularOffen, setImapFormularOffen] = useState(false)
  const [gmailLaedt, setGmailLaedt] = useState(false)

  // Toast-Handling fuer OAuth-Callback (?status=connected oder ?error=...)
  useEffect(() => {
    const status = searchParams.get('status')
    const errorParam = searchParams.get('error')

    if (status === 'connected') {
      toast.success('E-Mail-Postfach erfolgreich verbunden.')
    }
    if (errorParam) {
      toast.error(OAUTH_FEHLER_MELDUNGEN[errorParam] || 'Ein Fehler ist aufgetreten.')
    }

    if (status || errorParam) {
      window.history.replaceState({}, '', '/settings/email-postfach')
    }
  }, [searchParams])

  const fetchVerbindung = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/mailbox/verbindung')
      if (res.status === 404) {
        setVerbindung(null)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Fehler beim Laden der Verbindung')
      }
      const data: MailboxVerbindung | null = await res.json()
      setVerbindung(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVerbindung()
  }, [fetchVerbindung])

  async function handleGmailVerbinden() {
    setGmailLaedt(true)
    try {
      const res = await fetch('/api/mailbox/gmail/auth')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Gmail-Verbindung konnte nicht gestartet werden.')
      }
      const data = await res.json()
      if (data.auth_url) {
        window.location.href = data.auth_url
      } else {
        throw new Error('Keine OAuth-URL erhalten.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gmail-Verbindung fehlgeschlagen.')
      setGmailLaedt(false)
    }
  }

  async function handleTrennen() {
    try {
      const res = await fetch('/api/mailbox/verbindung', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Verbindung konnte nicht getrennt werden.')
      }
      toast.success('Verbindung getrennt.')
      setVerbindung(null)
      setImapFormularOffen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trennen fehlgeschlagen.')
    }
  }

  function handleImapGespeichert() {
    setImapFormularOffen(false)
    toast.success('IMAP-Verbindung gespeichert.')
    fetchVerbindung()
  }

  function handleNeuVerbinden() {
    if (!verbindung) return
    if (verbindung.provider === 'gmail') {
      handleGmailVerbinden()
      return
    }
    if (verbindung.provider === 'imap') {
      setImapFormularOffen(true)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">E-Mail-Postfach anbinden</h2>
        <p className="text-sm text-muted-foreground">
          Verbinde dein eigenes E-Mail-Postfach, damit Belege automatisch aus deinem Eingang
          importiert werden.
        </p>
      </header>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Dein Postfach bleibt unveraendert</AlertTitle>
        <AlertDescription>
          Die App markiert keine Mails als gelesen, verschiebt nichts und loescht nichts. Alle
          5&nbsp;Minuten werden neue Mails mit PDF-, JPG- oder PNG-Anhaengen geprueft und
          automatisch in deine Belegliste uebernommen.
          <br />
          <span className="mt-2 inline-block">
            <strong>Hinweis:</strong> Wenn du eine Mail innerhalb von 5&nbsp;Minuten nach Eingang
            loeschst oder verschiebst, kann sie nicht mehr verarbeitet werden.
          </span>
        </AlertDescription>
      </Alert>

      {/* Lade-Zustand */}
      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      )}

      {/* Fehler-Zustand */}
      {!loading && error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              setLoading(true)
              fetchVerbindung()
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Aktive Verbindung */}
      {!loading && !error && verbindung && (
        <div className="space-y-6">
          <VerbindungsStatusCard
            verbindung={verbindung}
            onTrennen={handleTrennen}
            onNeuVerbinden={handleNeuVerbinden}
          />

          {/* Wenn Mandant "Neu verbinden" fuer IMAP geklickt hat -> Formular zeigen */}
          {imapFormularOffen && verbindung.provider === 'imap' && (
            <ImapFormular
              onAbbrechen={() => setImapFormularOffen(false)}
              onGespeichert={() => {
                setImapFormularOffen(false)
                fetchVerbindung()
              }}
            />
          )}

          <EinstellungenPanel verbindung={verbindung} onAktualisiert={fetchVerbindung} />
        </div>
      )}

      {/* Keine Verbindung - Provider auswaehlen */}
      {!loading && !error && !verbindung && (
        <div className="space-y-6">
          <AnbieterKarten
            onImapClick={() => setImapFormularOffen((v) => !v)}
            onGmailClick={handleGmailVerbinden}
            imapAusgewaehlt={imapFormularOffen}
            gmailLaedt={gmailLaedt}
          />

          {imapFormularOffen && (
            <ImapFormular
              onAbbrechen={() => setImapFormularOffen(false)}
              onGespeichert={handleImapGespeichert}
            />
          )}
        </div>
      )}
    </div>
  )
}
