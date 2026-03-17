'use client'

import { useState, useEffect } from 'react'
import { FileSpreadsheet, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface ImportHistoryEntry {
  id: string
  dateiname: string
  importiert_am: string
  anzahl_importiert: number
  anzahl_duplikate: number
  anzahl_fehler: number
  zahlungsquellen: { name: string; typ: string } | null
}

export function ImportHistorie() {
  const [imports, setImports] = useState<ImportHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const response = await fetch('/api/transaktionen/import/history')
        if (!response.ok) {
          throw new Error('Import-Verlauf konnte nicht geladen werden.')
        }
        const data = await response.json()
        setImports(data)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unbekannter Fehler'
        )
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <FileSpreadsheet className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Noch keine Importe
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Importierte CSV-Dateien werden hier angezeigt.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dateiname</TableHead>
            <TableHead className="hidden sm:table-cell">Quelle</TableHead>
            <TableHead>Importiert am</TableHead>
            <TableHead className="text-right">Importiert</TableHead>
            <TableHead className="text-right">Duplikate</TableHead>
            <TableHead className="text-right">Fehler</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {imports.map((imp) => (
            <TableRow key={imp.id}>
              <TableCell className="font-medium text-sm">
                {imp.dateiname}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                {imp.zahlungsquellen?.name ?? '-'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {new Date(imp.importiert_am).toLocaleDateString('de-AT', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant="outline"
                  className="border-emerald-500 text-emerald-600"
                >
                  {imp.anzahl_importiert}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                {imp.anzahl_duplikate > 0 ? (
                  <Badge variant="secondary">{imp.anzahl_duplikate}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {imp.anzahl_fehler > 0 ? (
                  <Badge variant="destructive">{imp.anzahl_fehler}</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">0</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
