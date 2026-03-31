'use client'

import { CheckCircle2, XCircle, AlertTriangle, Copy, Zap, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

export interface ImportResult {
  importiert: number
  duplikate: number
  fehler: number
  gesperrte_monate: number
  matching_quote?: number
}

interface ImportErgebnisProps {
  result: ImportResult
  fileName: string
  onClose: () => void
}

export function ImportErgebnis({
  result,
  fileName,
  onClose,
}: ImportErgebnisProps) {
  const total = result.importiert + result.duplikate + result.fehler + result.gesperrte_monate
  const hasErrors = result.fehler > 0
  const hasDuplicates = result.duplikate > 0
  const hasGesperrte = result.gesperrte_monate > 0
  const hasMatching = result.matching_quote !== undefined && result.importiert > 0

  return (
    <div className="space-y-6">
      {/* Success / Warning header */}
      <div className="flex flex-col items-center gap-3 text-center">
        {hasErrors ? (
          <AlertTriangle className="h-12 w-12 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-12 w-12 text-teal-500" />
        )}
        <div>
          <h3 className="text-lg font-semibold">
            {hasErrors ? 'Import mit Warnungen abgeschlossen' : 'Import erfolgreich'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Datei: {fileName}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid gap-4 ${hasGesperrte ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
          <CheckCircle2 className="h-5 w-5 text-teal-500" />
          <span className="text-2xl font-bold">{result.importiert}</span>
          <span className="text-xs text-muted-foreground">Importiert</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
          <Copy className="h-5 w-5 text-amber-500" />
          <span className="text-2xl font-bold">{result.duplikate}</span>
          <span className="text-xs text-muted-foreground">Duplikate</span>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
          <XCircle className="h-5 w-5 text-destructive" />
          <span className="text-2xl font-bold">{result.fehler}</span>
          <span className="text-xs text-muted-foreground">Fehler</span>
        </div>
        {hasGesperrte && (
          <div className="flex flex-col items-center gap-1 rounded-lg border p-4">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <span className="text-2xl font-bold">{result.gesperrte_monate}</span>
            <span className="text-xs text-muted-foreground">Gesperrt</span>
          </div>
        )}
      </div>

      {/* Matching result */}
      {hasMatching && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-teal-500" />
            <span className="text-sm font-medium">Automatisches Matching</span>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={result.matching_quote} className="h-2 flex-1" />
            <span className="text-sm font-mono font-medium">
              {result.matching_quote}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {result.matching_quote}% der importierten Transaktionen wurden automatisch einem Beleg zugeordnet.
          </p>
        </div>
      )}

      {/* Details */}
      <div className="rounded-lg border bg-muted/50 p-4 text-sm space-y-2">
        <p>
          <span className="font-medium">Gesamt:</span> {total} Zeilen
          verarbeitet
        </p>
        {hasDuplicates && (
          <p className="text-amber-600 dark:text-amber-400">
            {result.duplikate} Duplikat(e) wurden erkannt und ubersprungen.
          </p>
        )}
        {hasErrors && (
          <p className="text-destructive">
            {result.fehler} Zeile(n) konnten nicht importiert werden (fehlende
            Pflichtfelder).
          </p>
        )}
        {hasGesperrte && (
          <p className="text-muted-foreground">
            {result.gesperrte_monate} Transaktion(en) wurden uebersprungen, da der jeweilige Monat bereits abgeschlossen ist.
          </p>
        )}
      </div>

      <Button onClick={onClose} className="w-full">
        Zur Transaktionsubersicht
      </Button>
    </div>
  )
}
