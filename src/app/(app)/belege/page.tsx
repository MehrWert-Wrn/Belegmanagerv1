'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import type { Beleg } from '@/lib/supabase/types'

export default function BelegePage() {
  const [belege, setBelege] = useState<Beleg[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [lieferantFilter, setLieferantFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [datumVon, setDatumVon] = useState('')
  const [datumBis, setDatumBis] = useState('')

  // Dialog states
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selectedBeleg, setSelectedBeleg] = useState<Beleg | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteBeleg, setDeleteBeleg] = useState<Beleg | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const fetchBelege = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (lieferantFilter) params.set('lieferant', lieferantFilter)
      if (statusFilter !== 'alle') params.set('status', statusFilter)
      if (datumVon) params.set('datum_von', datumVon)
      if (datumBis) params.set('datum_bis', datumBis)

      const response = await fetch(`/api/belege?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Belege konnten nicht geladen werden.')
      }

      const data = await response.json()
      setBelege(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [lieferantFilter, statusFilter, datumVon, datumBis])

  useEffect(() => {
    fetchBelege()
  }, [fetchBelege])

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

  function clearFilters() {
    setLieferantFilter('')
    setStatusFilter('alle')
    setDatumVon('')
    setDatumBis('')
  }

  const hasFilters =
    lieferantFilter !== '' ||
    statusFilter !== 'alle' ||
    datumVon !== '' ||
    datumBis !== ''

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
        <Button onClick={() => setUploadOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Beleg hochladen
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
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

        {hasFilters && (
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFilters}
            className="shrink-0"
            aria-label="Filter zurucksetzen"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button
            variant="link"
            className="ml-2 h-auto p-0 text-destructive underline"
            onClick={fetchBelege}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Table */}
      <BelegTabelle
        belege={belege}
        loading={loading}
        onSelect={handleSelect}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
      />

      {/* Dialogs */}
      <BelegUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={fetchBelege}
      />

      <BelegDetailSheet
        beleg={selectedBeleg}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={fetchBelege}
      />

      <BelegLoeschenDialog
        beleg={deleteBeleg}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={fetchBelege}
      />
    </div>
  )
}
