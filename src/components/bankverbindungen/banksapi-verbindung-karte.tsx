'use client'

/**
 * PROJ-20: BanksAPI Bankverbindung Karte
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { BanksApiSyncErgebnis, BanksApiVerbindung } from './banksapi-types'

interface Props {
  verbindung: BanksApiVerbindung
  onSync: (id: string) => Promise<BanksApiSyncErgebnis | null>
  onTrennen: (id: string) => Promise<void>
}

function formatIBAN(iban: string | null): string {
  if (!iban) return '-'
  if (iban.length <= 8) return iban
  return `${iban.substring(0, 4)} **** ${iban.slice(-4)}`
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Intl.DateTimeFormat('de-AT', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateStr))
}

function StatusBadge({ status }: { status: BanksApiVerbindung['status'] }) {
  switch (status) {
    case 'aktiv':
      return <Badge className="bg-teal-600 hover:bg-teal-600">Aktiv</Badge>
    case 'sca_faellig':
      return <Badge variant="destructive">SCA-Erneuerung notwendig</Badge>
    case 'fehler':
      return <Badge variant="destructive">Fehler</Badge>
    case 'getrennt':
      return <Badge variant="secondary">Getrennt</Badge>
    default:
      return null
  }
}

export function BanksApiVerbindungKarte({ verbindung, onSync, onTrennen }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [trennen, setTrennen] = useState(false)
  const [syncResult, setSyncResult] = useState<BanksApiSyncErgebnis | null>(null)
  const [showHistorie, setShowHistorie] = useState(false)

  const isSyncDisabled = verbindung.status === 'sca_faellig' || verbindung.status === 'fehler'

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await onSync(verbindung.id)
      setSyncResult(result)
    } finally {
      setSyncing(false)
    }
  }

  async function handleTrennen() {
    setTrennen(true)
    try {
      await onTrennen(verbindung.id)
    } finally {
      setTrennen(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{verbindung.bank_name || 'Bankkonto'}</CardTitle>
            <p className="text-sm text-muted-foreground font-mono">{formatIBAN(verbindung.iban)}</p>
          </div>
          <StatusBadge status={verbindung.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {verbindung.zahlungsquellen && (
          <div className="text-sm text-muted-foreground">
            Zahlungsquelle:{' '}
            <span className="font-medium text-foreground">{verbindung.zahlungsquellen.name}</span>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          Letzter Sync: {formatDateTime(verbindung.letzter_sync_at)}
          {verbindung.letzter_sync_at && (
            <span className="ml-1">({verbindung.letzter_sync_anzahl} Transaktionen)</span>
          )}
        </div>

        {syncResult && (
          <div className="rounded-md border bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">Synchronisierung abgeschlossen</p>
            <p>
              {syncResult.importiert} importiert, {syncResult.duplikate} Duplikate
            </p>
            {(syncResult.gesperrte_monate ?? 0) > 0 && (
              <p className="text-amber-600">
                {syncResult.gesperrte_monate} in gesperrten Monaten (uebersprungen)
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSync}
                    disabled={isSyncDisabled || syncing}
                  >
                    {syncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Jetzt synchronisieren
                  </Button>
                </span>
              </TooltipTrigger>
              {isSyncDisabled && (
                <TooltipContent>
                  {verbindung.status === 'sca_faellig'
                    ? 'Bitte erneuere zuerst die Bankverbindung (SCA)'
                    : 'Verbindung hat einen Fehler. Bitte erneuern.'}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={trennen}
              >
                {trennen ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Trennen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Bankverbindung trennen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Die Verbindung zu {verbindung.bank_name || 'diesem Bankkonto'} wird getrennt.
                  Bereits importierte Transaktionen bleiben erhalten, es werden jedoch keine neuen
                  Transaktionen mehr synchronisiert.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleTrennen}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Trennen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {verbindung.sync_historie.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistorie(!showHistorie)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showHistorie ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Sync-Historie ({verbindung.sync_historie.length})
            </button>
            {showHistorie && (
              <div className="mt-2 space-y-1">
                {verbindung.sync_historie.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={entry.status === 'error' ? 'text-destructive' : 'text-teal-600'}>
                      {entry.status === 'error' ? 'Fehler' : 'Erfolg'}
                    </span>
                    <span>{formatDateTime(entry.synced_at)}</span>
                    {entry.status === 'success' && (
                      <span>{entry.anzahl_importiert} importiert</span>
                    )}
                    {entry.fehler_meldung && (
                      <span
                        className="text-destructive truncate max-w-48"
                        title={entry.fehler_meldung}
                      >
                        {entry.fehler_meldung}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
