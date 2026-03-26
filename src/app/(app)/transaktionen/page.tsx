'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Search, X, History, Trash2 } from 'lucide-react'
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
import { TransaktionenTabelle } from '@/components/transaktionen/transaktionen-tabelle'
import { ImportHistorie } from '@/components/transaktionen/import-historie'
import { MatchingStatusBar } from '@/components/transaktionen/matching-status-bar'
import { ZuordnungsDialog } from '@/components/transaktionen/zuordnungs-dialog'
import { BulkAktionsLeiste } from '@/components/transaktionen/bulk-aktions-leiste'
import { TransaktionDetailSheet } from '@/components/transaktionen/transaktion-detail-sheet'
import type { TransaktionWithRelations, WorkflowStatus } from '@/lib/supabase/types'

export default function TransaktionenPage() {
  const router = useRouter()

  const [transaktionen, setTransaktionen] = useState<TransaktionWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [quelleFilter, setQuelleFilter] = useState('alle')
  const [datumVon, setDatumVon] = useState('')
  const [datumBis, setDatumBis] = useState('')

  // Zahlungsquellen für Filter-Dropdown
  const [zahlungsquellen, setZahlungsquellen] = useState<{ id: string; name: string; typ: string }[]>([])
  useEffect(() => {
    fetch('/api/zahlungsquellen')
      .then(r => r.ok ? r.json() : [])
      .then(data => setZahlungsquellen(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Manual assignment dialog
  const [zuordnungsDialogOpen, setZuordnungsDialogOpen] = useState(false)
  const [zuordnungsTransaktion, setZuordnungsTransaktion] =
    useState<TransaktionWithRelations | null>(null)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Detail sheet
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedTransaktion, setSelectedTransaktion] =
    useState<TransaktionWithRelations | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState('transaktionen')

  // BUG-PROJ5-R4-002: Stats fetched from dedicated endpoint (full dataset, not paginated slice)
  const [matchingStats, setMatchingStats] = useState({ total: 0, bestaetigt: 0, vorgeschlagen: 0, offen: 0 })

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/transaktionen/stats')
      if (res.ok) setMatchingStats(await res.json())
    } catch {
      // non-fatal
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const fetchTransaktionen = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (searchFilter) params.set('search', searchFilter)
      if (quelleFilter !== 'alle') params.set('quelle_id', quelleFilter)
      if (datumVon) params.set('datum_von', datumVon)
      if (datumBis) params.set('datum_bis', datumBis)

      // Server-side status filtering based on active tab
      if (activeTab === 'offen') {
        params.set('nur_offen', 'true')
      } else if (activeTab === 'rueckfragen') {
        params.set('workflow_status', 'rueckfrage')
      } else if (statusFilter === 'offen') {
        // "Offen" covers both offen + vorgeschlagen
        params.set('nur_offen', 'true')
      } else if (statusFilter !== 'alle') {
        params.set('match_status', statusFilter)
      }

      const response = await fetch(`/api/transaktionen?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Transaktionen konnten nicht geladen werden.')
      }

      const data = await response.json()
      setTransaktionen(data.data ?? [])
      fetchStats()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [searchFilter, statusFilter, quelleFilter, datumVon, datumBis, activeTab, fetchStats])

  useEffect(() => {
    fetchTransaktionen()
  }, [fetchTransaktionen])

  // BUG-PROJ6-006: Nur IDs entfernen, die nicht mehr in der Liste sind (nicht alles leeren)
  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => transaktionen.some(t => t.id === id)))
  }, [transaktionen])

  // Count offene/rueckfragen for tab badges (computed from fetched data)
  const offeneCount = useMemo(
    () => transaktionen.filter(
      (t) => t.match_status === 'offen' || t.match_status === 'vorgeschlagen'
    ).length,
    [transaktionen]
  )

  const rueckfragenCount = useMemo(
    () => transaktionen.filter((t) => t.workflow_status === 'rueckfrage').length,
    [transaktionen]
  )

  function clearFilters() {
    setSearchFilter('')
    setStatusFilter('alle')
    setQuelleFilter('alle')
    setDatumVon('')
    setDatumBis('')
  }

  const hasFilters =
    searchFilter !== '' ||
    statusFilter !== 'alle' ||
    quelleFilter !== 'alle' ||
    datumVon !== '' ||
    datumBis !== ''

  function handleManualAssign(transaktionId: string) {
    const t = transaktionen.find((t) => t.id === transaktionId) ?? null
    if (!t) return
    setZuordnungsTransaktion(t)
    setZuordnungsDialogOpen(true)
  }

  function handleRowClick(transaktion: TransaktionWithRelations) {
    setSelectedTransaktion(transaktion)
    setDetailSheetOpen(true)
  }

  function handleWorkflowStatusChange(transaktionId: string, newStatus: WorkflowStatus) {
    // Update local state so the table reflects the change immediately
    setTransaktionen((prev) =>
      prev.map((t) =>
        t.id === transaktionId ? { ...t, workflow_status: newStatus } : t
      )
    )
    // Also update the selected transaktion if it's the same one
    setSelectedTransaktion((prev) =>
      prev && prev.id === transaktionId
        ? { ...prev, workflow_status: newStatus }
        : prev
    )
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return
    try {
      const res = await fetch('/api/transaktionen', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Loeschen fehlgeschlagen')
      }
      toast.success(`${selectedIds.length} Transaktion${selectedIds.length > 1 ? 'en' : ''} geloescht`)
      setSelectedIds([])
      fetchTransaktionen()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fehler beim Loeschen'
      toast.error(message)
    }
  }

  function handleBulkZuordnen() {
    if (selectedIds.length === 0) return
    const first = transaktionen.find((t) => selectedIds.includes(t.id)) ?? null
    if (!first) return
    setZuordnungsTransaktion(first)
    setZuordnungsDialogOpen(true)
  }

  // BUG-PROJ6-006: Nach einer Bulk-Zuweisung die gerade erledigte ID entfernen
  // und den Dialog für die nächste selektierte Transaktion öffnen
  function handleBulkAssigned() {
    const assignedId = zuordnungsTransaktion?.id
    const remaining = assignedId
      ? selectedIds.filter(id => id !== assignedId)
      : selectedIds
    setSelectedIds(remaining)
    fetchTransaktionen()
    if (remaining.length > 0) {
      const next = transaktionen.find(t => remaining.includes(t.id) && t.id !== assignedId) ?? null
      if (next) {
        setZuordnungsTransaktion(next)
        setZuordnungsDialogOpen(true)
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transaktionen</h1>
          <p className="text-sm text-muted-foreground">
            Importierte Zahlungstransaktionen und deren Matching-Status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="mr-2 h-4 w-4" />
                  {selectedIds.length} loeschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Transaktionen loeschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selectedIds.length === 1
                      ? 'Diese Transaktion wird geloescht und ist nicht mehr sichtbar.'
                      : `Diese ${selectedIds.length} Transaktionen werden geloescht und sind nicht mehr sichtbar.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleBulkDelete}
                  >
                    Loeschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={() => router.push('/transaktionen/import')}>
            <Upload className="mr-2 h-4 w-4" />
            CSV importieren
          </Button>
        </div>
      </div>

      {/* Matching Status Bar */}
      <MatchingStatusBar
        stats={matchingStats}
        loading={loading}
        onMatchingComplete={fetchTransaktionen}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="transaktionen">Alle Transaktionen</TabsTrigger>
          <TabsTrigger value="offen" className="gap-1.5">
            Offene Positionen
            {activeTab !== 'offen' && offeneCount > 0 && (
              <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-900 dark:text-red-300">
                {offeneCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rueckfragen" className="gap-1.5">
            Rueckfragen
            {activeTab !== 'rueckfragen' && rueckfragenCount > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                {rueckfragenCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="historie">
            <History className="mr-1.5 h-3.5 w-3.5" />
            Import-Verlauf
          </TabsTrigger>
        </TabsList>

        {/* Shared filter + table for "Alle" and "Offen" tabs */}
        {(activeTab === 'transaktionen' || activeTab === 'offen' || activeTab === 'rueckfragen') && (
          <div className="space-y-4 mt-4">
            {/* Filter bar */}
            <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <label
                  htmlFor="filter-search"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Suche
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="filter-search"
                    placeholder="Beschreibung, IBAN..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="filter-datum-von"
                  className="text-xs font-medium text-muted-foreground"
                >
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
                <label
                  htmlFor="filter-datum-bis"
                  className="text-xs font-medium text-muted-foreground"
                >
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

              {activeTab === 'transaktionen' && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Match-Status
                  </label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger
                      className="w-full sm:w-40"
                      aria-label="Match-Status filtern"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle</SelectItem>
                      <SelectItem value="offen">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                          Offen
                        </span>
                      </SelectItem>
                      <SelectItem value="bestaetigt">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                          Zugeordnet
                        </span>
                      </SelectItem>
                      <SelectItem value="kein_beleg">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                          Kein Beleg erforderlich
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {zahlungsquellen.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Quelle
                  </label>
                  <Select value={quelleFilter} onValueChange={setQuelleFilter}>
                    <SelectTrigger className="w-full sm:w-40" aria-label="Zahlungsquelle filtern">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alle">Alle Quellen</SelectItem>
                      {zahlungsquellen.map(q => (
                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

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

            {/* Error state */}
            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                {error}
                <Button
                  variant="link"
                  className="ml-2 h-auto p-0 text-destructive underline"
                  onClick={fetchTransaktionen}
                >
                  Erneut versuchen
                </Button>
              </div>
            )}

            {/* Table */}
            <TransaktionenTabelle
              transaktionen={transaktionen}
              loading={loading}
              onActionComplete={fetchTransaktionen}
              onManualAssign={handleManualAssign}
              onRowClick={handleRowClick}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
            />

            {/* Bulk action bar */}
            <BulkAktionsLeiste
              selectedIds={selectedIds}
              onClearSelection={() => setSelectedIds([])}
              onBulkKeinBeleg={() => {
                /* handled inside component */
              }}
              onBulkZuordnen={handleBulkZuordnen}
              onActionComplete={fetchTransaktionen}
            />
          </div>
        )}

        <TabsContent value="historie" className="mt-4">
          <ImportHistorie />
        </TabsContent>
      </Tabs>

      {/* Zuordnungs-Dialog */}
      <ZuordnungsDialog
        open={zuordnungsDialogOpen}
        onOpenChange={setZuordnungsDialogOpen}
        transaktion={zuordnungsTransaktion}
        onAssigned={selectedIds.length > 1 ? handleBulkAssigned : fetchTransaktionen}
      />

      {/* Transaktions-Detail Sheet */}
      <TransaktionDetailSheet
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        transaktion={selectedTransaktion}
        onWorkflowStatusChange={handleWorkflowStatusChange}
      />
    </div>
  )
}
