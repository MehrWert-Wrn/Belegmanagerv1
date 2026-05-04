'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Download,
  FileText,
  FolderArchive,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { getMonatsname } from '@/lib/monatsabschluss-types'

interface ExportVorschau {
  anzahl_transaktionen: number
  anzahl_mit_beleg: number
  anzahl_ohne_beleg: number
  anzahl_csv_zeilen: number
  anzahl_belege?: number
  letzte_exporte: {
    exportiert_am: string
    export_typ: string
  }[]
}

type ExportModus = 'buchungsuebergabe' | 'belegliste'
type ExportFormat = 'csv' | 'zip'

type ExportPhase = 'vorschau' | 'exportiert' | 'fehler'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jahr: number
  monat: number
  onExportiert?: () => void
}

export function ExportDialog({
  open,
  onOpenChange,
  jahr,
  monat,
  onExportiert,
}: ExportDialogProps) {
  const [vorschau, setVorschau] = useState<ExportVorschau | null>(null)
  const [vorschauLoading, setVorschauLoading] = useState(false)
  const [vorschauError, setVorschauError] = useState<string | null>(null)

  const [exportModus, setExportModus] = useState<ExportModus>('buchungsuebergabe')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv')
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [phase, setPhase] = useState<ExportPhase>('vorschau')

  const monatsname = getMonatsname(monat)

  const fetchVorschau = useCallback(async () => {
    setVorschauLoading(true)
    setVorschauError(null)

    try {
      const response = await fetch(`/api/export/${jahr}/${monat}/preview`)
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Vorschau konnte nicht geladen werden')
      }
      const data: ExportVorschau = await response.json()
      setVorschau(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setVorschauError(message)
    } finally {
      setVorschauLoading(false)
    }
  }, [jahr, monat])

  // Load preview when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('vorschau')
      setExportProgress(0)
      setExportModus('buchungsuebergabe')
      setExportFormat('csv')
      fetchVorschau()
    }
  }, [open, fetchVorschau])

  async function handleExport() {
    setExporting(true)
    setExportProgress(10)

    try {
      const endpoint =
        exportModus === 'belegliste'
          ? `/api/export/${jahr}/${monat}/belegliste/${exportFormat}`
          : `/api/export/${jahr}/${monat}/${exportFormat}`

      setExportProgress(30)

      const response = await fetch(endpoint, {
        method: 'POST',
      })

      setExportProgress(70)

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const msg = errorData?.error ?? `Export fehlgeschlagen (${response.status})`
        if (response.status === 413) {
          throw new Error(`${msg} (${errorData?.anzahl_belege ?? '?'} Belege vorhanden)`)
        }
        throw new Error(msg)
      }

      setExportProgress(90)

      // Trigger file download
      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const fallbackPrefix =
        exportModus === 'belegliste' ? 'belegliste' : 'buchungsuebergabe'
      const filename =
        filenameMatch?.[1] ??
        `${fallbackPrefix}_${jahr}_${String(monat).padStart(2, '0')}.${exportFormat}`

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setExportProgress(100)
      setPhase('exportiert')

      const erfolgsMeldung =
        exportModus === 'belegliste'
          ? `Belegliste fuer ${monatsname} ${jahr} heruntergeladen.`
          : `Buchhaltungsübergabe fuer ${monatsname} ${jahr} heruntergeladen.`
      toast.success(erfolgsMeldung)
      onExportiert?.()

      // Refresh preview to show updated export history
      fetchVorschau()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export fehlgeschlagen'
      setPhase('fehler')
      toast.error(message)
    } finally {
      setExporting(false)
    }
  }

  function handleOpenChange(newOpen: boolean) {
    if (!exporting) {
      onOpenChange(newOpen)
    }
  }

  const istBelegliste = exportModus === 'belegliste'
  const anzahlBelege = vorschau?.anzahl_belege ?? 0
  const anzahlTransaktionen = vorschau?.anzahl_transaktionen ?? 0
  const hatTransaktionen = anzahlTransaktionen > 0
  const hatBelege = anzahlBelege > 0
  const hatOhneBelege = (vorschau?.anzahl_ohne_beleg ?? 0) > 0

  // Hauptzaehler in der Vorschau – abhaengig vom Modus
  const hauptzaehler = istBelegliste
    ? anzahlBelege
    : (vorschau?.anzahl_csv_zeilen ?? 0)
  const hauptzaehlerLabel = istBelegliste ? 'Belege' : 'CSV-Zeilen'

  const formatLabel = istBelegliste
    ? {
        csv: 'CSV-Datei der Belegliste (UTF-8 mit BOM)',
        zip: 'Belegliste-CSV + alle Belege (PDFs) + LIESMICH',
      }
    : {
        csv: 'Buchhaltungs-CSV (UTF-8, Semikolon, kompatibel mit BMD, RZL, Sage)',
        zip: 'CSV + Belege (PDFs) + LIESMICH.txt für den Steuerberater',
      }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Export für {monatsname} {jahr}
          </DialogTitle>
          <DialogDescription>
            Wähle Export-Typ und Format. Beide Typen können beliebig oft erzeugt werden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Loading state */}
          {vorschauLoading && (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {/* Error state */}
          {vorschauError && (
            <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-destructive">{vorschauError}</p>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-destructive underline mt-1"
                  onClick={fetchVorschau}
                >
                  Erneut versuchen
                </Button>
              </div>
            </div>
          )}

          {/* Preview loaded */}
          {vorschau && !vorschauLoading && (
            <>
              {/* Export-Typ Auswahl (Buchhaltungsübergabe vs Belegliste) */}
              <div>
                <h4 className="text-sm font-medium mb-3">Export-Typ</h4>
                <RadioGroup
                  value={exportModus}
                  onValueChange={(v) => setExportModus(v as ExportModus)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  disabled={exporting}
                >
                  <Label
                    htmlFor="modus-buchungsuebergabe"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportModus === 'buchungsuebergabe'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem
                      value="buchungsuebergabe"
                      id="modus-buchungsuebergabe"
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">Buchhaltungsübergabe</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Transaktionsbasiert, ideal nach Matching-Workflow
                      </p>
                    </div>
                  </Label>

                  <Label
                    htmlFor="modus-belegliste"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportModus === 'belegliste'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem
                      value="belegliste"
                      id="modus-belegliste"
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">Belegliste</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Belegbasiert – alle Belege des Monats als CSV
                      </p>
                    </div>
                  </Label>
                </RadioGroup>
              </div>

              {/* Export-Vorschau (modus-abhaengig) */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="text-sm font-medium mb-3">
                  {istBelegliste ? 'Belegliste – Vorschau' : 'Buchhaltungsübergabe – Vorschau'}
                </h4>

                {istBelegliste ? (
                  <div className="grid grid-cols-1 gap-4 text-center">
                    <div>
                      <p className="text-3xl font-bold">{hauptzaehler}</p>
                      <p className="text-xs text-muted-foreground">
                        {hauptzaehlerLabel} im Monat
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold">{hauptzaehler}</p>
                      <p className="text-xs text-muted-foreground">CSV-Zeilen</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                        {vorschau.anzahl_mit_beleg}
                      </p>
                      <p className="text-xs text-muted-foreground">mit Beleg</p>
                    </div>
                    <div>
                      <p
                        className={`text-2xl font-bold ${
                          hatOhneBelege
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {vorschau.anzahl_ohne_beleg}
                      </p>
                      <p className="text-xs text-muted-foreground">ohne Beleg</p>
                    </div>
                  </div>
                )}

                {!istBelegliste &&
                  vorschau.anzahl_csv_zeilen > vorschau.anzahl_transaktionen && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Enthält {vorschau.anzahl_csv_zeilen - vorschau.anzahl_transaktionen}{' '}
                      zusätzliche Zeilen durch Belege mit mehreren MwSt-Sätzen.
                    </p>
                  )}
              </div>

              {/* Warning: no transactions (Buchungsuebergabe) */}
              {!istBelegliste && !hatTransaktionen && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium">Keine Transaktionen vorhanden</p>
                    <p className="mt-0.5">
                      Die CSV-Datei enthaelt nur die Kopfzeile ohne Buchungszeilen.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning: no Belege (Belegliste) */}
              {istBelegliste && !hatBelege && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium">Keine Belege im Monat vorhanden</p>
                    <p className="mt-0.5">
                      Die CSV enthaelt nur die Kopfzeile. Das Paket kann trotzdem an
                      die Steuerberatung uebergeben werden.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning: transactions without beleg (Buchungsuebergabe) */}
              {!istBelegliste && hatOhneBelege && hatTransaktionen && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    {vorschau.anzahl_ohne_beleg} Transaktionen ohne Belegzuordnung werden
                    mit leerem Belegfeld exportiert.
                  </div>
                </div>
              )}

              {/* Format selection (CSV / ZIP) */}
              <div>
                <h4 className="text-sm font-medium mb-3">Format</h4>
                <RadioGroup
                  value={exportFormat}
                  onValueChange={(v) => setExportFormat(v as ExportFormat)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  disabled={exporting}
                >
                  <Label
                    htmlFor="format-csv"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportFormat === 'csv'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value="csv" id="format-csv" className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">Nur CSV</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatLabel.csv}
                      </p>
                    </div>
                  </Label>

                  <Label
                    htmlFor="format-zip"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportFormat === 'zip'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value="zip" id="format-zip" className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderArchive className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">ZIP-Paket</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatLabel.zip}
                      </p>
                    </div>
                  </Label>
                </RadioGroup>
              </div>

              {/* Export progress */}
              {exporting && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {exportFormat === 'zip' ? 'ZIP wird erstellt...' : 'CSV wird generiert...'}
                    </span>
                    <span className="font-medium">{exportProgress}%</span>
                  </div>
                  <Progress
                    value={exportProgress}
                    className="h-2"
                    aria-label="Export-Fortschritt"
                  />
                </div>
              )}

              {/* Success state */}
              {phase === 'exportiert' && !exporting && (
                <div className="flex gap-3 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-800 dark:bg-teal-950">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400 mt-0.5" />
                  <div className="text-sm text-teal-700 dark:text-teal-300">
                    <p className="font-medium">Export erfolgreich</p>
                    <p className="mt-0.5">
                      Die Datei wurde heruntergeladen. Du kannst den Dialog schliessen oder
                      einen weiteren Export durchfuehren.
                    </p>
                  </div>
                </div>
              )}

              {/* Error state after export attempt */}
              {phase === 'fehler' && !exporting && (
                <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
                  <div className="text-sm text-destructive">
                    <p className="font-medium">Export fehlgeschlagen</p>
                    <p className="mt-0.5">
                      Bitte versuche es erneut. Falls das Problem weiterhin besteht,
                      kontaktiere den Support.
                    </p>
                  </div>
                </div>
              )}

              {/* Export history */}
              {vorschau.letzte_exporte.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Letzte Exporte
                    </h4>
                    <div className="space-y-2">
                      {vorschau.letzte_exporte.map((e, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-muted-foreground">
                            {new Date(e.exportiert_am).toLocaleString('de-AT', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {e.export_typ.toUpperCase()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={exporting}
          >
            {phase === 'exportiert' ? 'Schliessen' : 'Abbrechen'}
          </Button>
          {vorschau && !vorschauLoading && (
            <Button
              onClick={handleExport}
              disabled={exporting || vorschauLoading}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {phase === 'exportiert' ? 'Erneut exportieren' : 'Exportieren'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
