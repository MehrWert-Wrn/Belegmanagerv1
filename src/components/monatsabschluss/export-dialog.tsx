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
  letzte_exporte: {
    exportiert_am: string
    export_typ: string
  }[]
}

type ExportTyp = 'csv' | 'zip'

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

  const [exportTyp, setExportTyp] = useState<ExportTyp>('csv')
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
      setExportTyp('csv')
      fetchVorschau()
    }
  }, [open, fetchVorschau])

  async function handleExport() {
    setExporting(true)
    setExportProgress(10)

    try {
      const endpoint = `/api/export/${jahr}/${monat}/${exportTyp}`
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
      const filename = filenameMatch?.[1] ?? `DATEV_Export_${jahr}_${String(monat).padStart(2, '0')}.${exportTyp}`

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

      toast.success(`DATEV-Export fuer ${monatsname} ${jahr} heruntergeladen.`)
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

  const hatTransaktionen = (vorschau?.anzahl_transaktionen ?? 0) > 0
  const hatOhneBelege = (vorschau?.anzahl_ohne_beleg ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            DATEV-Export
          </DialogTitle>
          <DialogDescription>
            {monatsname} {jahr} im DATEV-kompatiblen Format exportieren.
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
              {/* Export summary */}
              <div className="rounded-lg border bg-muted/50 p-4">
                <h4 className="text-sm font-medium mb-3">Export-Vorschau</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{vorschau.anzahl_transaktionen}</p>
                    <p className="text-xs text-muted-foreground">Transaktionen</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                      {vorschau.anzahl_mit_beleg}
                    </p>
                    <p className="text-xs text-muted-foreground">mit Beleg</p>
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${hatOhneBelege ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                      {vorschau.anzahl_ohne_beleg}
                    </p>
                    <p className="text-xs text-muted-foreground">ohne Beleg</p>
                  </div>
                </div>
              </div>

              {/* Warning: no transactions */}
              {!hatTransaktionen && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium">Keine Transaktionen vorhanden</p>
                    <p className="mt-0.5">
                      Die CSV-Datei enthaelt nur den DATEV-Header ohne Buchungszeilen.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning: transactions without beleg */}
              {hatOhneBelege && hatTransaktionen && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="text-sm text-amber-700 dark:text-amber-300">
                    {vorschau.anzahl_ohne_beleg} Transaktionen ohne Belegzuordnung werden
                    mit leerem Belegfeld exportiert.
                  </div>
                </div>
              )}

              {/* Export type selection */}
              <div>
                <h4 className="text-sm font-medium mb-3">Export-Format</h4>
                <RadioGroup
                  value={exportTyp}
                  onValueChange={(v) => setExportTyp(v as ExportTyp)}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                  disabled={exporting}
                >
                  <Label
                    htmlFor="export-csv"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportTyp === 'csv'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value="csv" id="export-csv" className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">Nur CSV</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        DATEV Buchungsstapel als CSV-Datei (UTF-8)
                      </p>
                    </div>
                  </Label>

                  <Label
                    htmlFor="export-zip"
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      exportTyp === 'zip'
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem value="zip" id="export-zip" className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FolderArchive className="h-4 w-4 shrink-0" />
                        <span className="font-medium text-sm">ZIP-Paket</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        CSV + alle zugeordneten Belege (PDFs)
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
                      {exportTyp === 'zip' ? 'ZIP wird erstellt...' : 'CSV wird generiert...'}
                    </span>
                    <span className="font-medium">{exportProgress}%</span>
                  </div>
                  <Progress value={exportProgress} className="h-2" aria-label="Export-Fortschritt" />
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
              disabled={exporting || vorschauLoading || !hatTransaktionen}
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
