'use client'

/**
 * PROJ-32: AnbieterKarten - Drei Provider-Karten zur Auswahl
 *
 * Zeigt drei Karten nebeneinander:
 *  - IMAP (empfohlen, Badge in Teal)
 *  - Gmail OAuth2
 *  - Microsoft 365 (deaktiviert, Badge "Demnaechst")
 *
 * Klick auf IMAP oeffnet das Inline-Formular (gesteuert vom Parent).
 * Klick auf Gmail startet den OAuth2-Flow (Redirect via window.location).
 */

import { Inbox, Mail, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface AnbieterKartenProps {
  onImapClick: () => void
  onGmailClick: () => void
  imapAusgewaehlt: boolean
  gmailLaedt?: boolean
}

export function AnbieterKarten({
  onImapClick,
  onGmailClick,
  imapAusgewaehlt,
  gmailLaedt = false,
}: AnbieterKartenProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* IMAP */}
      <Card
        className={
          imapAusgewaehlt
            ? 'border-teal-500 ring-1 ring-teal-500'
            : 'transition-colors hover:border-teal-300'
        }
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                <Inbox className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base">IMAP</CardTitle>
            </div>
            <Badge className="bg-teal-600 hover:bg-teal-600">Empfohlen</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Funktioniert mit Gmail, GMX, web.de und jedem IMAP-faehigen Postfach.
          </p>
          <Button
            type="button"
            variant={imapAusgewaehlt ? 'secondary' : 'default'}
            className="w-full"
            onClick={onImapClick}
            aria-expanded={imapAusgewaehlt}
          >
            {imapAusgewaehlt ? 'Formular schliessen' : 'Verbinden'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Gmail OAuth2 */}
      <Card className="transition-colors hover:border-red-300">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-red-50 text-red-600">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <CardTitle className="text-base">Gmail</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Sicher ohne Passwort - direkte Google-Verbindung via OAuth2.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onGmailClick}
            disabled={gmailLaedt}
          >
            {gmailLaedt ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird weitergeleitet...
              </>
            ) : (
              'Mit Google verbinden'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Microsoft 365 - Demnaechst */}
      <Card className="opacity-60">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </div>
              <CardTitle className="text-base text-muted-foreground">Microsoft 365</CardTitle>
            </div>
            <Badge variant="secondary">Demnaechst</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Microsoft 365 &amp; Outlook - kommt in Kuerze.
          </p>
          <Button type="button" variant="outline" className="w-full" disabled>
            Mit Microsoft verbinden
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
