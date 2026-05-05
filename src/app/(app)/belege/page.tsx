'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, X, Trash2, Wallet, ScanText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BelegTabelle } from '@/components/belege/beleg-tabelle'
import { BelegUploadDialog } from '@/components/belege/beleg-upload-dialog'
import { BelegDetailSheet } from '@/components/belege/beleg-detail-sheet'
import { BelegLoeschenDialog } from '@/components/belege/beleg-loeschen-dialog'
import { BelegReviewModus } from '@/components/belege/beleg-review-modus'
import { DirektBezahltDialog } from '@/components/belege/direkt-bezahlt-dialog'
import { BulkDirektBezahltDialog } from '@/components/belege/bulk-direkt-bezahlt-dialog'
import type { Beleg } from '@/lib/supabase/types'

export default function BelegePage() {
  const searchParams = useSearchParams()
  const [belege, setBelege] = useState<Beleg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mandantFirmenname, setMandantFirmenname] = useState<string | undefined>(undefined)

  useEffect(() => {
    fetch('/api/mandant')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.firmenname) setMandantFirmenname(d.firmenname) })
      .catch(() => {})
  }, [])

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Filters – pre-populate from URL params (e.g. coming from dashboard Belegordner)
  const [rechnungsnameFilter, setRechnungsnameFilter] = useState('')
  const [lieferantFilter, setLieferantFilter] = useState('')
  const [rechnungstypFilter, setRechnungstypFilter] = useState(() => searchParams.get('rechnungstyp') ?? 'alle')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [datumVon, setDatumVon] = useState(() => searchParams.get('datum_von') ?? '')
  const [datumBis, setDatumBis] = useState(() => searchParams.get('datum_bis') ?? '')
  const [betragNettoVon, setBetragNettoVon] = useState('')
  const [betragNettoBis, setBetragNettoBis] = useState('')
  const [betragBruttoVon, setBetragBruttoVon] = useState('')
  const [betragBruttoBis, setBetragBruttoBis] = useState('')
  const [erstelltVon, setErstelltVon] = useState('')
  const [erstelltBis, setErstelltBis] = useState('')
  const [ueberfaelligFilter, setUeberfaelligFilter] = useState(false)

  // Dialog states
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedBeleg, setSelectedBeleg] = useState<Beleg | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteBeleg, setDeleteBeleg] = useState<Beleg | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // Direkt bezahlt dialog state
  const [direktBezahltBeleg, setDirektBezahltBeleg] = useState<Beleg | null>(null)
  const [direktBezahltOpen, setDirektBezahltOpen] = useState(false)

  // Bulk action states
  const [bulkDirektBezahltOpen, setBulkDirektBezahltOpen] = useState(false)
  const [bulkOcrRunning, setBulkOcrRunning] = useState(false)

  // Review mode state (mass import)
  const [reviewBelegIds, setReviewBelegIds] = useState<string[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)

  const fetchBelege = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (rechnungsnameFilter) params.set('rechnungsname', rechnungsnameFilter)
      if (lieferantFilter) params.set('lieferant', lieferantFilter)
      if (rechnungstypFilter !== 'alle') params.set('rechnungstyp', rechnungstypFilter)
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (datumVon) params.set('datum_von', datumVon)
      if (datumBis) params.set('datum_bis', datumBis)
      if (betragNettoVon) params.set('betrag_netto_von', betragNettoVon)
      if (betragNettoBis) params.set('betrag_netto_bis', betragNettoBis)
      if (betragBruttoVon) params.set('betrag_von', betragBruttoVon)
      if (betragBruttoBis) params.set('betrag_bis', betragBruttoBis)
      if (erstelltVon) params.set('erstellt_von', erstelltVon)
      if (erstelltBis) params.set('erstellt_bis', erstelltBis)
      if (ueberfaelligFilter) params.set('ueberfaellig', 'true')

      const response = await fetch(`/api/belege?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Belege konnten nicht geladen werden.')
      }

      const data = await response.json()
      setBelege(data)
      // Clear selections that are no longer in the result set
      setSelectedIds((prev) => {
        const dataIds = new Set(data.map((b: Beleg) => b.id))
        const next = new Set<string>()
        prev.forEach((id) => {
          if (dataIds.has(id)) next.add(id)
        })
        return next
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [rechnungsnameFilter, lieferantFilter, rechnungstypFilter, statusFilter, datumVon, datumBis, betragNettoVon, betragNettoBis, betragBruttoVon, betragBruttoBis, erstelltVon, erstelltBis, ueberfaelligFilter])

  useEffect(() => {
    fetchBelege()
  }, [fetchBelege])

  // Selection handlers
  function handleSelectChange(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(belege.map((b) => b.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  function handleSelect(beleg: Beleg) {
    setSelectedBeleg(beleg)
    setDetailOpen(true)
  }

  function handleEdit(beleg: Beleg) {
    setSelectedBeleg(beleg)
    setDetailOpen(true)
  }

  function handleDeleteRequest(beleg: Beleg) {
    setDeleteBeleg(beleg)
    setDeleteOpen(true)
  }

  function handleDirektBezahlt(beleg: Beleg) {
    setDirektBezahltBeleg(beleg)
    setDirektBezahltOpen(true)
  }

  function handleBulkDeleteRequest() {
    if (selectedIds.size === 0) return
    setBulkDeleteOpen(true)
  }

  function handleBulkDeleted() {
    setSelectedIds(new Set())
    fetchBelege(true)
  }

  async function handleBulkOcr() {
    if (selectedIds.size === 0) return
    setBulkOcrRunning(true)
    try {
      const res = await fetch('/api/belege/bulk/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Fehler beim OCR-Auslesen')

      const { succeeded, skipped, rateLimited, errors } = data as {
        succeeded: number
        skipped: number
        rateLimited: number
        errors: { id: string; error: string }[]
      }

      const parts: string[] = []
      if (succeeded > 0) parts.push(`${succeeded} Beleg${succeeded !== 1 ? 'e' : ''} ausgelesen`)
      if (skipped > 0) parts.push(`${skipped} ohne Dokument übersprungen`)
      if (rateLimited > 0) parts.push(`${rateLimited} wegen Rate-Limit nicht verarbeitet`)
      if (errors.length > 0) parts.push(`${errors.length} Fehler`)

      if (succeeded > 0) {
        toast.success(parts.join(', '))
      } else if (rateLimited > 0) {
        toast.warning('Rate-Limit erreicht. Bitte einen Moment warten und erneut versuchen.')
      } else {
        toast.info(parts.join(', ') || 'Keine Belege verarbeitet')
      }

      fetchBelege(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim OCR-Auslesen')
    } finally {
      setBulkOcrRunning(false)
    }
  }

  const hasMatchedBelegeInSelection = belege.some(
    (b) => selectedIds.has(b.id) && b.zuordnungsstatus === 'zugeordnet'
  )

  function clearFilters() {
    setRechnungsnameFilter('')
    setLieferantFilter('')
    setRechnungstypFilter('alle')
    setStatusFilter('alle')
    setDatumVon('')
    setDatumBis('')
    setBetragNettoVon('')
    setBetragNettoBis('')
    setBetragBruttoVon('')
    setBetragBruttoBis('')
    setErstelltVon('')
    setErstelltBis('')
    setUeberfaelligFilter(false)
  }

  const hasFilters =
    rechnungsnameFilter !== '' ||
    lieferantFilter !== '' ||
    rechnungstypFilter !== 'alle' ||
    statusFilter !== 'alle' ||
    datumVon !== '' ||
    datumBis !== '' ||
    betragNettoVon !== '' ||
    betragNettoBis !== '' ||
    betragBruttoVon !== '' ||
    betragBruttoBis !== '' ||
    erstelltVon !== '' ||
    erstelltBis !== '' ||
    ueberfaelligFilter

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Belege</h1>
          <p className="text-sm text-muted-foreground">
            Verwalten Sie Ihre Eingangsrechnungen und Belege.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                onClick={handleBulkOcr}
                disabled={bulkOcrRunning}
              >
                {bulkOcrRunning
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <ScanText className="mr-2 h-4 w-4" />
                }
                OCR auslesen
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkDirektBezahltOpen(true)}
              >
                <Wallet className="mr-2 h-4 w-4" />
                Direkt bezahlt
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDeleteRequest}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {selectedIds.size} löschen
              </Button>
            </>
          )}
          <Button onClick={() => setUploadOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Beleg hochladen
          </Button>
        </div>
      </div>

      {/* Filter bar - 2 rows */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        {/* Row 1: Text filters + Dropdowns */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label htmlFor="filter-rechnungsname" className="text-xs font-medium text-muted-foreground">
              Rechnungsname
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="filter-rechnungsname"
                placeholder="Suchen..."
                value={rechnungsnameFilter}
                onChange={(e) => setRechnungsnameFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex-1 space-y-1">
            <label htmlFor="filter-lieferant" className="text-xs font-medium text-muted-foreground">
              Lieferant
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="filter-lieferant"
                placeholder="Suchen..."
                value={lieferantFilter}
                onChange={(e) => setLieferantFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Rechnungstyp
            </label>
            <Select value={rechnungstypFilter} onValueChange={setRechnungstypFilter}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Rechnungstyp filtern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle</SelectItem>
                <SelectItem value="eingangsrechnung">Eingangsrechnung</SelectItem>
                <SelectItem value="ausgangsrechnung">Ausgangsrechnung</SelectItem>
                <SelectItem value="gutschrift">Gutschrift</SelectItem>
                <SelectItem value="sonstiges">Sonstiges</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Status
            </label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-36" aria-label="Status filtern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle</SelectItem>
                <SelectItem value="offen">Offen</SelectItem>
                <SelectItem value="zugeordnet">Zugeordnet</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Date + Amount range filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <label htmlFor="filter-datum-von" className="text-xs font-medium text-muted-foreground">
              Datum von
            </label>
            <Input
              id="filter-datum-von"
              type="date"
              value={datumVon}
              onChange={(e) => setDatumVon(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="filter-datum-bis" className="text-xs font-medium text-muted-foreground">
              Datum bis
            </label>
            <Input
              id="filter-datum-bis"
              type="date"
              value={datumBis}
              onChange={(e) => setDatumBis(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="filter-netto-von" className="text-xs font-medium text-muted-foreground">
              Netto von
            </label>
            <Input
              id="filter-netto-von"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={betragNettoVon}
              onChange={(e) => setBetragNettoVon(e.target.value)}
              className="w-full sm:w-28"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="filter-netto-bis" className="text-xs font-medium text-muted-foreground">
              Netto bis
            </label>
            <Input
              id="filter-netto-bis"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={betragNettoBis}
              onChange={(e) => setBetragNettoBis(e.target.value)}
              className="w-full sm:w-28"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="filter-brutto-von" className="text-xs font-medium text-muted-foreground">
              Brutto von
            </label>
            <Input
              id="filter-brutto-von"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={betragBruttoVon}
              onChange={(e) => setBetragBruttoVon(e.target.value)}
              className="w-full sm:w-28"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="filter-brutto-bis" className="text-xs font-medium text-muted-foreground">
              Brutto bis
            </label>
            <Input
              id="filter-brutto-bis"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={betragBruttoBis}
              onChange={(e) => setBetragBruttoBis(e.target.value)}
              className="w-full sm:w-28"
            />
          </div>

          {hasFilters && (
            <Button
              variant="ghost"
              size="icon"
              onClick={clearFilters}
              className="shrink-0"
              aria-label="Filter zuruecksetzen"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Row 3: Erstellungsdatum + Überfällig filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="space-y-1">
            <label htmlFor="filter-erstellt-von" className="text-xs font-medium text-muted-foreground">
              Hochgeladen von
            </label>
            <Input
              id="filter-erstellt-von"
              type="date"
              value={erstelltVon}
              onChange={(e) => setErstelltVon(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="filter-erstellt-bis" className="text-xs font-medium text-muted-foreground">
              Hochgeladen bis
            </label>
            <Input
              id="filter-erstellt-bis"
              type="date"
              value={erstelltBis}
              onChange={(e) => setErstelltBis(e.target.value)}
              className="w-full sm:w-40"
            />
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Checkbox
              id="filter-ueberfaellig"
              checked={ueberfaelligFilter}
              onCheckedChange={(checked) => setUeberfaelligFilter(checked === true)}
            />
            <label
              htmlFor="filter-ueberfaellig"
              className="text-sm font-medium cursor-pointer select-none text-red-600 dark:text-red-400"
            >
              Nur Überfällige
            </label>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={() => fetchBelege()}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Table */}
      <BelegTabelle
        belege={belege}
        loading={loading}
        selectedIds={selectedIds}
        onSelectChange={handleSelectChange}
        onSelectAll={handleSelectAll}
        onSelect={handleSelect}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onDirektBezahlt={handleDirektBezahlt}
        onActionComplete={() => fetchBelege(true)}
      />

      {/* Dialogs */}
      <BelegUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={() => fetchBelege(true)}
        onMassImportComplete={(result) => {
          setReviewBelegIds(result.belegIds)
          setReviewOpen(true)
          fetchBelege(true)
        }}
      />

      <BelegDetailSheet
        beleg={selectedBeleg}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => fetchBelege(true)}
      />

      {/* Single delete dialog */}
      <BelegLoeschenDialog
        beleg={deleteBeleg}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => fetchBelege(true)}
      />

      {/* Bulk delete dialog */}
      <BelegLoeschenDialog
        mode="bulk"
        belegIds={Array.from(selectedIds)}
        belegCount={selectedIds.size}
        hasMatchedBelege={hasMatchedBelegeInSelection}
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        onDeleted={handleBulkDeleted}
      />

      {/* Direkt bezahlt dialog */}
      <DirektBezahltDialog
        beleg={direktBezahltBeleg}
        open={direktBezahltOpen}
        onOpenChange={setDirektBezahltOpen}
        onSuccess={() => fetchBelege(true)}
      />

      {/* Bulk direkt bezahlt dialog */}
      <BulkDirektBezahltDialog
        belegIds={Array.from(selectedIds)}
        open={bulkDirektBezahltOpen}
        onOpenChange={setBulkDirektBezahltOpen}
        onSuccess={() => {
          setSelectedIds(new Set())
          fetchBelege(true)
        }}
      />

      {/* Review mode for mass import */}
      <BelegReviewModus
        belegIds={reviewBelegIds}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onComplete={() => fetchBelege(true)}
        mandantFirmenname={mandantFirmenname}
      />
    </div>
  )
}
