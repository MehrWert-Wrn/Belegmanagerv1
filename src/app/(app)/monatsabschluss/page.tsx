'use client'

import { useState, useEffect, useCallback } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MonatsKarte, MonatsKarteSkeleton } from '@/components/monatsabschluss/monats-karte'
import { AbschlussDialog } from '@/components/monatsabschluss/abschluss-dialog'
import { WiedereroeffnenDialog } from '@/components/monatsabschluss/wiedereroeffnen-dialog'
import { ExportDialog } from '@/components/monatsabschluss/export-dialog'
import type { MonatsDetail, MonatsStatus, PruefungAmpel } from '@/lib/monatsabschluss-types'

interface MonatsUebersichtItem {
  jahr: number
  monat: number
  status: MonatsStatus
  ampel: PruefungAmpel
  anzahlTransaktionen: number
  anzahlOffen: number
  datevExportVorhanden: boolean
}

export default function MonatsabschlussPage() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [monate, setMonate] = useState<MonatsUebersichtItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Abschluss dialog
  const [abschlussOpen, setAbschlussOpen] = useState(false)
  const [abschlussJahr, setAbschlussJahr] = useState(0)
  const [abschlussMonat, setAbschlussMonat] = useState(0)
  const [abschlussAnzahlOffen, setAbschlussAnzahlOffen] = useState(0)

  // Wiedereroeffnen dialog
  const [wiedereroeffnenOpen, setWiedereroeffnenOpen] = useState(false)
  const [wiedereroeffnenJahr, setWiedereroeffnenJahr] = useState(0)
  const [wiedereroeffnenMonat, setWiedereroeffnenMonat] = useState(0)
  const [wiedereroeffnenDatevExport, setWiedereroeffnenDatevExport] = useState(false)

  // Export dialog
  const [exportOpen, setExportOpen] = useState(false)
  const [exportJahr, setExportJahr] = useState(0)
  const [exportMonat, setExportMonat] = useState(0)

  const fetchMonatsUebersicht = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Fetch all 12 months for the selected year in parallel
      const promises = Array.from({ length: 12 }, (_, i) => {
        const monat = i + 1
        return fetch(`/api/monatsabschluss/${selectedYear}/${monat}`)
          .then(async (res) => {
            if (!res.ok) throw new Error('Fehler beim Laden')
            const data: MonatsDetail = await res.json()
            return {
              jahr: selectedYear,
              monat,
              status: data.abschluss.status,
              ampel: data.pruefung.ampel,
              anzahlTransaktionen: data.pruefung.anzahl_transaktionen,
              anzahlOffen: data.pruefung.anzahl_offen,
              datevExportVorhanden: data.abschluss.datev_export_vorhanden ?? false,
            } satisfies MonatsUebersichtItem
          })
      })

      const results = await Promise.all(promises)
      setMonate(results)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error('Monatsuebersicht konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => {
    fetchMonatsUebersicht()
  }, [fetchMonatsUebersicht])

  function handleAbschliessen(jahr: number, monat: number) {
    const item = monate.find((m) => m.jahr === jahr && m.monat === monat)
    setAbschlussJahr(jahr)
    setAbschlussMonat(monat)
    setAbschlussAnzahlOffen(item?.anzahlOffen ?? 0)
    setAbschlussOpen(true)
  }

  function handleExport(jahr: number, monat: number) {
    setExportJahr(jahr)
    setExportMonat(monat)
    setExportOpen(true)
  }

  function handleWiedereroeffnen(jahr: number, monat: number) {
    const item = monate.find((m) => m.jahr === jahr && m.monat === monat)
    setWiedereroeffnenJahr(jahr)
    setWiedereroeffnenMonat(monat)
    setWiedereroeffnenDatevExport(item?.datevExportVorhanden ?? false)
    setWiedereroeffnenOpen(true)
  }

  // Year options: current year +/- 2
  const yearOptions = Array.from(
    { length: 5 },
    (_, i) => currentYear - 2 + i
  )

  // Summary stats
  const abgeschlossen = monate.filter((m) => m.status === 'abgeschlossen').length
  const mitOffenen = monate.filter((m) => m.anzahlOffen > 0).length

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" />
            Monatsabschluss
          </h1>
          <p className="text-sm text-muted-foreground">
            Monatliche Vollstaendigkeitspruefung, Abschluss und DATEV-Export.
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedYear((y) => y - 1)}
            aria-label="Vorheriges Jahr"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-28" aria-label="Jahr auswaehlen">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedYear((y) => y + 1)}
            aria-label="Naechstes Jahr"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      {!loading && !error && (
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">
              {abgeschlossen} von 12 Monaten abgeschlossen
            </span>
          </div>
          {mitOffenen > 0 && (
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="text-muted-foreground">
                {mitOffenen} Monate mit offenen Positionen
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={fetchMonatsUebersicht}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Month cards */}
      <div className="space-y-3">
        {loading
          ? Array.from({ length: 12 }).map((_, i) => (
              <MonatsKarteSkeleton key={i} />
            ))
          : monate.map((m) => (
              <MonatsKarte
                key={`${m.jahr}-${m.monat}`}
                jahr={m.jahr}
                monat={m.monat}
                status={m.status}
                ampel={m.ampel}
                anzahlTransaktionen={m.anzahlTransaktionen}
                anzahlOffen={m.anzahlOffen}
                datevExportVorhanden={m.datevExportVorhanden}
                onAbschliessen={handleAbschliessen}
                onWiedereroeffnen={handleWiedereroeffnen}
                onExport={handleExport}
              />
            ))}
      </div>

      {/* Dialogs */}
      <AbschlussDialog
        open={abschlussOpen}
        onOpenChange={setAbschlussOpen}
        jahr={abschlussJahr}
        monat={abschlussMonat}
        anzahlOffen={abschlussAnzahlOffen}
        onAbgeschlossen={fetchMonatsUebersicht}
      />

      <WiedereroeffnenDialog
        open={wiedereroeffnenOpen}
        onOpenChange={setWiedereroeffnenOpen}
        jahr={wiedereroeffnenJahr}
        monat={wiedereroeffnenMonat}
        datevExportVorhanden={wiedereroeffnenDatevExport}
        onWiedergeoeffnet={fetchMonatsUebersicht}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        jahr={exportJahr}
        monat={exportMonat}
        onExportiert={fetchMonatsUebersicht}
      />
    </div>
  )
}
