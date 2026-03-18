'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Lock,
  LockOpen,
  Download,
  RotateCcw,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { VollstaendigkeitsPruefung } from '@/components/monatsabschluss/vollstaendigkeits-pruefung'
import { AbschlussDialog } from '@/components/monatsabschluss/abschluss-dialog'
import { WiedereroeffnenDialog } from '@/components/monatsabschluss/wiedereroeffnen-dialog'
import { ExportDialog } from '@/components/monatsabschluss/export-dialog'
import type { MonatsDetail } from '@/lib/monatsabschluss-types'
import { getMonatsname } from '@/lib/monatsabschluss-types'

export default function MonatsDetailPage() {
  const params = useParams()
  const router = useRouter()
  const jahr = Number(params.jahr)
  const monat = Number(params.monat)

  const [detail, setDetail] = useState<MonatsDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dialogs
  const [abschlussOpen, setAbschlussOpen] = useState(false)
  const [wiedereroeffnenOpen, setWiedereroeffnenOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const fetchDetail = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/monatsabschluss/${jahr}/${monat}`)
      if (!response.ok) {
        throw new Error('Monatsdaten konnten nicht geladen werden.')
      }
      const data: MonatsDetail = await response.json()
      setDetail(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [jahr, monat])

  useEffect(() => {
    if (!isNaN(jahr) && !isNaN(monat)) {
      fetchDetail()
    }
  }, [fetchDetail, jahr, monat])

  const istAbgeschlossen = detail?.abschluss.status === 'abgeschlossen'
  const monatsname = getMonatsname(monat)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Back navigation + header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2 text-muted-foreground"
          onClick={() => router.push('/monatsabschluss')}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Zurueck zur Uebersicht
        </Button>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
              {String(monat).padStart(2, '0')}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                {monatsname} {jahr}
                {istAbgeschlossen && (
                  <Lock className="h-5 w-5 text-emerald-600" aria-label="Monat gesperrt" />
                )}
              </h1>
              {!loading && detail && (
                <StatusBadge status={detail.abschluss.status} />
              )}
            </div>
          </div>

          {/* Actions */}
          {!loading && detail && (
            <div className="flex items-center gap-2">
              {istAbgeschlossen ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setExportOpen(true)}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    DATEV-Export
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setWiedereroeffnenOpen(true)}
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                  >
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Wiederoeffnen
                  </Button>
                </>
              ) : (
                <Button onClick={() => setAbschlussOpen(true)}>
                  <Lock className="mr-1.5 h-4 w-4" />
                  Monat abschliessen
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={fetchDetail}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Vollstaendigkeitspruefung */}
        <VollstaendigkeitsPruefung
          pruefung={detail?.pruefung ?? {
            ampel: 'rot',
            quellen: [],
            anzahl_offen: 0,
            anzahl_transaktionen: 0,
            alle_quellen_haben_import: false,
            kassa_saldo: null,
            kassa_saldo_positiv: null,
          }}
          loading={loading}
        />

        {/* Abschluss-Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Abschluss-Informationen</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : detail ? (
              <div className="space-y-3 text-sm">
                <InfoRow
                  label="Status"
                  value={
                    <StatusBadge status={detail.abschluss.status} />
                  }
                />
                <InfoRow
                  label="Transaktionen"
                  value={`${detail.pruefung.anzahl_transaktionen} gesamt`}
                />
                <InfoRow
                  label="Offene Positionen"
                  value={
                    detail.pruefung.anzahl_offen > 0 ? (
                      <span className="font-medium text-red-600 dark:text-red-400">
                        {detail.pruefung.anzahl_offen} offen
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        Keine
                      </span>
                    )
                  }
                />
                {detail.abschluss.abgeschlossen_am && (
                  <InfoRow
                    label="Abgeschlossen am"
                    value={new Date(detail.abschluss.abgeschlossen_am).toLocaleString('de-AT')}
                  />
                )}
                {detail.abschluss.wiedergeoeffnet_am && (
                  <InfoRow
                    label="Wiedergeoeffnet am"
                    value={new Date(detail.abschluss.wiedergeoeffnet_am).toLocaleString('de-AT')}
                  />
                )}
                {detail.abschluss.datev_export_vorhanden && (
                  <InfoRow
                    label="DATEV-Export"
                    value={
                      <Badge variant="outline" className="text-xs border-emerald-200 bg-emerald-50 text-emerald-700">
                        Export vorhanden
                      </Badge>
                    }
                  />
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Offene Transaktionen quick link */}
      {!loading && detail && detail.pruefung.anzahl_offen > 0 && !istAbgeschlossen && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">
                {detail.pruefung.anzahl_offen} offene Transaktionen
              </p>
              <p className="text-sm text-muted-foreground">
                Transaktionen ohne Belegzuordnung ansehen und bearbeiten
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/transaktionen?match_status=offen&datum_von=${jahr}-${String(monat).padStart(2, '0')}-01&datum_bis=${jahr}-${String(monat).padStart(2, '0')}-${new Date(jahr, monat, 0).getDate()}`}>
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Transaktionen anzeigen
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Locked month notice */}
      {istAbgeschlossen && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span className="font-medium">Monat ist abgeschlossen</span>
          </div>
          <p className="mt-1 ml-6">
            Transaktionen und Zuordnungen fuer diesen Monat sind gesperrt.
            Um Aenderungen vorzunehmen, muss der Monat zuerst wiedergeoeffnet werden.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && detail && detail.pruefung.anzahl_transaktionen === 0 && !istAbgeschlossen && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <LockOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">Keine Transaktionen</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              Fuer {monatsname} {jahr} wurden noch keine Transaktionen importiert.
              Importiere zuerst einen Kontoauszug oder erstelle Kassabuch-Eintraege.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" asChild>
                <Link href="/transaktionen/import">Kontoauszug importieren</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/kassabuch">Kassabuch oeffnen</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <AbschlussDialog
        open={abschlussOpen}
        onOpenChange={setAbschlussOpen}
        jahr={jahr}
        monat={monat}
        anzahlOffen={detail?.pruefung.anzahl_offen ?? 0}
        onAbgeschlossen={fetchDetail}
      />

      <WiedereroeffnenDialog
        open={wiedereroeffnenOpen}
        onOpenChange={setWiedereroeffnenOpen}
        jahr={jahr}
        monat={monat}
        datevExportVorhanden={detail?.abschluss.datev_export_vorhanden}
        onWiedergeoeffnet={fetchDetail}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        jahr={jahr}
        monat={monat}
        onExportiert={fetchDetail}
      />
    </div>
  )
}

// Helper components

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    offen: {
      label: 'Offen',
      className: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
    },
    in_bearbeitung: {
      label: 'In Bearbeitung',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
    abgeschlossen: {
      label: 'Abgeschlossen',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    },
  }

  const c = config[status] ?? config.offen

  return (
    <Badge variant="outline" className={`text-xs ${c.className}`}>
      {c.label}
    </Badge>
  )
}

function InfoRow({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  )
}
