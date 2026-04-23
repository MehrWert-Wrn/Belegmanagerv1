'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { FolderOpen, Folder, ChevronRight, Download, X, Loader2, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

type TypBreakdown = {
  rechnungstyp: string
  anzahl: number
  brutto: number
}

type MonatsOrdner = {
  monat: string
  anzahl: number
  offene: number
  brutto_ausgaben: number
  brutto_einnahmen: number
  typen: TypBreakdown[]
}

const MONAT_NAMEN: Record<string, string> = {
  '01': 'Jänner', '02': 'Februar', '03': 'März', '04': 'April',
  '05': 'Mai', '06': 'Juni', '07': 'Juli', '08': 'August',
  '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Dezember',
}

const TYP_LABEL: Record<string, string> = {
  eingangsrechnung: 'Eingangsrechnungen',
  ausgangsrechnung: 'Ausgangsrechnungen',
  eigenbeleg: 'Eigenbelege',
  gutschrift: 'Gutschriften',
  eigenverbrauch: 'Eigenverbrauch',
}

const TYP_COLOR: Record<string, { folder: string; badge: string; text: string }> = {
  eingangsrechnung: { folder: 'text-rose-500', badge: 'bg-rose-50 border-rose-200 text-rose-700', text: 'text-rose-600' },
  ausgangsrechnung: { folder: 'text-teal-600', badge: 'bg-teal-50 border-teal-200 text-teal-700', text: 'text-teal-600' },
  eigenbeleg: { folder: 'text-violet-500', badge: 'bg-violet-50 border-violet-200 text-violet-700', text: 'text-violet-600' },
  gutschrift: { folder: 'text-amber-500', badge: 'bg-amber-50 border-amber-200 text-amber-700', text: 'text-amber-600' },
  eigenverbrauch: { folder: 'text-orange-500', badge: 'bg-orange-50 border-orange-200 text-orange-700', text: 'text-orange-600' },
}

function monatLabel(monat: string, short = false): string {
  const [year, month] = monat.split('-')
  const name = MONAT_NAMEN[month] ?? month
  return short ? `${name.slice(0, 3)} ${year.slice(2)}` : `${name} ${year}`
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function toDateParam(monat: string, lastDay?: boolean): string {
  if (!lastDay) return `${monat}-01`
  const [year, month] = monat.split('-').map(Number)
  return `${monat}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
}

async function downloadZip(monat: string, rechnungstyp?: string): Promise<void> {
  const resp = await fetch('/api/dashboard/belege-ordner/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monat, rechnungstyp }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error ?? 'Download fehlgeschlagen')
  }

  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const typSuffix = rechnungstyp ? `_${TYP_LABEL[rechnungstyp] ?? rechnungstyp}` : ''
  a.href = url
  a.download = `Belege_${monat}${typSuffix}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

export function BelegeOrdnerWidget() {
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [selectedYear, setSelectedYear] = useState<number>(currentYear)
  const [availableYears, setAvailableYears] = useState<number[]>([currentYear])
  const [monate, setMonate] = useState<MonatsOrdner[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonat, setSelectedMonat] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const fetchData = useCallback((year: number) => {
    setLoading(true)
    setSelectedMonat(null)
    fetch(`/api/dashboard/belege-ordner?year=${year}`)
      .then((r) => r.json())
      .then((d) => {
        setMonate(d.monate ?? [])
        if (d.availableYears?.length > 0) setAvailableYears(d.availableYears)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchData(currentYear)
  }, [fetchData, currentYear])

  function handleYearChange(year: number) {
    setSelectedYear(year)
    fetchData(year)
  }

  const selected = monate.find((m) => m.monat === selectedMonat) ?? null
  const gesamtBelege = monate.reduce((s, m) => s + m.anzahl, 0)
  const gesamtOffen = monate.reduce((s, m) => s + m.offene, 0)

  function handleMonatClick(monat: string) {
    setSelectedMonat((prev) => (prev === monat ? null : monat))
  }

  function navigateToBelege(monat: string, rechnungstyp?: string) {
    const params = new URLSearchParams({
      datum_von: toDateParam(monat),
      datum_bis: toDateParam(monat, true),
    })
    if (rechnungstyp) params.set('rechnungstyp', rechnungstyp)
    router.push(`/belege?${params.toString()}`)
  }

  async function handleDownload(monat: string, rechnungstyp?: string) {
    const key = rechnungstyp ? `${monat}:${rechnungstyp}` : monat
    setDownloading(key)
    try {
      await downloadZip(monat, rechnungstyp)
      toast.success('ZIP-Download gestartet')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Download fehlgeschlagen')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Belegordner</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Belege nach Monat und Rechnungstyp</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Year selector */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
              <button
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                disabled={selectedYear <= Math.min(...availableYears)}
                onClick={() => handleYearChange(selectedYear - 1)}
                aria-label="Vorheriges Jahr"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>

              <div className="flex items-center gap-0.5">
                {availableYears.map((y) => (
                  <button
                    key={y}
                    onClick={() => handleYearChange(y)}
                    className={`rounded px-2.5 py-0.5 text-sm font-medium transition-all ${
                      y === selectedYear
                        ? 'bg-teal-600 text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-background hover:text-foreground'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>

              <button
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
                disabled={selectedYear >= Math.max(...availableYears)}
                onClick={() => handleYearChange(selectedYear + 1)}
                aria-label="Nächstes Jahr"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Summary */}
            {!loading && gesamtBelege > 0 && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Gesamt {selectedYear}</p>
                  <p className="text-sm font-bold text-foreground">{gesamtBelege} Belege</p>
                </div>
                {gesamtOffen > 0 && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                    {gesamtOffen} offen
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Monthly folder grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : monate.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Keine Belege für {selectedYear} vorhanden.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {monate.map((m) => {
              const isSelected = m.monat === selectedMonat
              return (
                <button
                  key={m.monat}
                  onClick={() => handleMonatClick(m.monat)}
                  className={`group relative flex flex-col gap-1.5 rounded-lg border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    isSelected
                      ? 'border-teal-400 bg-teal-50 shadow-sm'
                      : 'bg-card hover:border-teal-300 hover:bg-teal-50/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <FolderOpen className={`h-5 w-5 transition-colors ${isSelected ? 'text-teal-700' : 'text-teal-600 group-hover:text-teal-700'}`} />
                    {m.offene > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 leading-none">
                        {m.offene}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{monatLabel(m.monat, true)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.anzahl} {m.anzahl === 1 ? 'Beleg' : 'Belege'}</p>
                  </div>

                  {(m.brutto_ausgaben > 0 || m.brutto_einnahmen > 0) && (
                    <div className="mt-auto pt-1 border-t border-border/50">
                      {m.brutto_ausgaben > 0 && (
                        <p className="text-[10px] text-rose-600 font-medium truncate">{fmt(m.brutto_ausgaben)}</p>
                      )}
                      {m.brutto_einnahmen > 0 && (
                        <p className="text-[10px] text-teal-600 font-medium truncate">{fmt(m.brutto_einnahmen)}</p>
                      )}
                    </div>
                  )}

                  <ChevronRight
                    className={`absolute right-2 bottom-2 h-3.5 w-3.5 transition-all ${
                      isSelected ? 'rotate-90 text-teal-600' : 'text-muted-foreground/40 group-hover:text-teal-500 group-hover:translate-x-0.5'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        )}

        {/* Expanded month panel */}
        {selected && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-teal-700 shrink-0" />
                <span className="font-semibold text-foreground">{monatLabel(selected.monat)}</span>
                <span className="text-sm text-muted-foreground">· {selected.anzahl} Belege</span>
                {selected.offene > 0 && (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 text-xs">
                    {selected.offene} offen
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-teal-300 bg-white text-teal-700 hover:bg-teal-50"
                  onClick={() => navigateToBelege(selected.monat)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Alle anzeigen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 border-teal-300 bg-white text-teal-700 hover:bg-teal-50"
                  disabled={downloading === selected.monat}
                  onClick={() => handleDownload(selected.monat)}
                >
                  {downloading === selected.monat ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Alle herunterladen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedMonat(null)}
                  aria-label="Schließen"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {selected.typen.map((typ) => {
                const color = TYP_COLOR[typ.rechnungstyp] ?? TYP_COLOR.eingangsrechnung
                const dlKey = `${selected.monat}:${typ.rechnungstyp}`
                const isDownloading = downloading === dlKey

                return (
                  <div
                    key={typ.rechnungstyp}
                    className="group relative flex flex-col gap-2 rounded-lg border bg-white p-3 transition-all hover:border-teal-300 hover:shadow-sm"
                  >
                    <button
                      className="flex items-start gap-2 text-left focus-visible:outline-none"
                      onClick={() => navigateToBelege(selected.monat, typ.rechnungstyp)}
                    >
                      <Folder className={`h-4 w-4 mt-0.5 shrink-0 ${color.folder}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground leading-tight truncate">
                          {TYP_LABEL[typ.rechnungstyp] ?? typ.rechnungstyp}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {typ.anzahl} {typ.anzahl === 1 ? 'Beleg' : 'Belege'}
                        </p>
                        {typ.brutto > 0 && (
                          <p className={`text-[11px] font-medium mt-0.5 ${color.text}`}>{fmt(typ.brutto)}</p>
                        )}
                      </div>
                    </button>

                    <button
                      className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors border ${color.badge} hover:opacity-80 disabled:opacity-50`}
                      disabled={isDownloading}
                      onClick={() => handleDownload(selected.monat, typ.rechnungstyp)}
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      ) : (
                        <Download className="h-3 w-3 shrink-0" />
                      )}
                      Herunterladen
                    </button>

                    <button
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-teal-700 transition-colors"
                      onClick={() => navigateToBelege(selected.monat, typ.rechnungstyp)}
                    >
                      <ChevronRight className="h-3 w-3 shrink-0" />
                      Belege anzeigen
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
