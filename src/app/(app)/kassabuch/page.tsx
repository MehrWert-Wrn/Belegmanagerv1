'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus,
  Settings2,
  Search,
  X,
  ChevronDown,
  Download,
  Scale,
  History,
  BookmarkPlus,
  Tag,
  Archive,
} from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SaldoAnzeige } from '@/components/kassabuch/saldo-anzeige'
import {
  KassabuchTabelle,
  type KassaEintrag,
} from '@/components/kassabuch/kassabuch-tabelle'
import { KassaEintragDialog } from '@/components/kassabuch/kassa-eintrag-dialog'
import { AnfangssaldoDialog } from '@/components/kassabuch/anfangssaldo-dialog'
import { KassaLoeschenDialog } from '@/components/kassabuch/kassa-loeschen-dialog'
import { ZuordnungsDialog } from '@/components/transaktionen/zuordnungs-dialog'
import { KassabuchExportDialog } from '@/components/kassabuch/kassabuch-export-dialog'
import { KassenpruefungDialog } from '@/components/kassabuch/kassenpruefung-dialog'
import { KassenpruefungHistorie } from '@/components/kassabuch/kassenpruefung-historie'
import { KassaVorlagenListe } from '@/components/kassabuch/kassa-vorlagen-liste'
import { KassaKategorienVerwaltung } from '@/components/kassabuch/kassa-kategorien-verwaltung'
import { KassabuchArchivListe } from '@/components/kassabuch/kassabuch-archiv-liste'
import type { TransaktionWithRelations } from '@/lib/supabase/types'
import type { KassaVorlage } from '@/components/kassabuch/kassa-vorlagen-dialog'

export default function KassabuchPage() {
  // Data
  const [eintraege, setEintraege] = useState<KassaEintrag[]>([])
  const [anfangssaldo, setAnfangssaldo] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Saldo
  const [saldoData, setSaldoData] = useState({
    anfangssaldo: 0,
    summe_eintraege: 0,
    aktueller_saldo: 0,
  })
  const [saldoLoading, setSaldoLoading] = useState(true)

  // Filters
  const [searchFilter, setSearchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('alle')
  const [kategorieFilter, setKategorieFilter] = useState('alle')
  const [datumVon, setDatumVon] = useState('')
  const [datumBis, setDatumBis] = useState('')

  // Kategorien für Filter-Dropdown
  const [filterKategorien, setFilterKategorien] = useState<{ id: string; name: string; farbe: string }[]>([])

  useEffect(() => {
    fetch('/api/kassabuch/kategorien')
      .then(r => r.json())
      .then(d => setFilterKategorien(d.kategorien ?? []))
      .catch(() => {})
  }, [])

  // Existing dialogs
  const [eintragDialogOpen, setEintragDialogOpen] = useState(false)
  const [editEintrag, setEditEintrag] = useState<KassaEintrag | null>(null)
  const [vorlageForNewEntry, setVorlageForNewEntry] = useState<KassaVorlage | null>(null)
  const [anfangssaldoDialogOpen, setAnfangssaldoDialogOpen] = useState(false)
  const [deleteEintrag, setDeleteEintrag] = useState<KassaEintrag | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Zuordnungs-Dialog (reuse from PROJ-6)
  const [zuordnungsDialogOpen, setZuordnungsDialogOpen] = useState(false)
  const [zuordnungsTransaktion, setZuordnungsTransaktion] =
    useState<TransaktionWithRelations | null>(null)

  // New dialogs (Kassabuch-Erweiterung 2026-04-23)
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [pruefungDialogOpen, setPruefungDialogOpen] = useState(false)
  const [pruefungHistorieOpen, setPruefungHistorieOpen] = useState(false)
  const [vorlagenListeOpen, setVorlagenListeOpen] = useState(false)
  const [kategorienOpen, setKategorienOpen] = useState(false)
  const [archivListeOpen, setArchivListeOpen] = useState(false)

  const fetchEintraege = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (datumVon) params.set('datum_von', datumVon)
      if (datumBis) params.set('datum_bis', datumBis)

      const response = await fetch(
        `/api/kassabuch/eintraege?${params.toString()}`
      )
      if (!response.ok) {
        throw new Error('Kassaeintraege konnten nicht geladen werden.')
      }

      const data = await response.json()
      setEintraege(data.eintraege ?? [])
      setAnfangssaldo(data.anfangssaldo ?? 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [datumVon, datumBis])

  const fetchSaldo = useCallback(async () => {
    setSaldoLoading(true)
    try {
      const response = await fetch('/api/kassabuch/saldo')
      if (!response.ok) throw new Error('Saldo konnte nicht geladen werden')
      const data = await response.json()
      setSaldoData({
        anfangssaldo: data.anfangssaldo ?? 0,
        summe_eintraege: data.summe_eintraege ?? 0,
        aktueller_saldo: data.aktueller_saldo ?? 0,
      })
    } catch {
      // Saldo error is non-critical, entries are more important
    } finally {
      setSaldoLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEintraege()
    fetchSaldo()
  }, [fetchEintraege, fetchSaldo])

  function refreshAll() {
    fetchEintraege()
    fetchSaldo()
  }

  // Client-side filtering for search and status
  const filteredEintraege = useMemo(() => {
    let result = eintraege

    if (searchFilter.trim()) {
      const search = searchFilter.toLowerCase()
      result = result.filter(
        (e) =>
          (e.beschreibung ?? '').toLowerCase().includes(search) ||
          (e.belege?.lieferant ?? '').toLowerCase().includes(search)
      )
    }

    if (statusFilter !== 'alle') {
      result = result.filter((e) => e.match_status === statusFilter)
    }

    // BUG-PROJ7-25: Kategorie-Filter
    if (kategorieFilter === '_none') {
      result = result.filter((e) => !e.kategorie_id)
    } else if (kategorieFilter !== 'alle') {
      result = result.filter((e) => e.kategorie_id === kategorieFilter)
    }

    return result
  }, [eintraege, searchFilter, statusFilter, kategorieFilter])

  function handleNewEintrag() {
    setEditEintrag(null)
    setVorlageForNewEntry(null)
    setEintragDialogOpen(true)
  }

  function handleEdit(eintrag: KassaEintrag) {
    setEditEintrag(eintrag)
    setVorlageForNewEntry(null)
    setEintragDialogOpen(true)
  }

  function handleDeleteRequest(eintrag: KassaEintrag) {
    setDeleteEintrag(eintrag)
    setDeleteDialogOpen(true)
  }

  function handleApplyVorlage(vorlage: KassaVorlage) {
    setEditEintrag(null)
    setVorlageForNewEntry(vorlage)
    setEintragDialogOpen(true)
  }

  function handleManualAssign(eintragId: string) {
    const eintrag = eintraege.find((e) => e.id === eintragId)
    if (!eintrag) return

    // Convert to TransaktionWithRelations shape for the ZuordnungsDialog
    const asTransaktion: TransaktionWithRelations = {
      id: eintrag.id,
      datum: eintrag.datum,
      betrag: eintrag.betrag,
      beschreibung: eintrag.beschreibung,
      match_status: eintrag.match_status,
      match_score: eintrag.match_score,
      match_type: eintrag.match_type,
      beleg_id: eintrag.beleg_id,
      erstellt_am: eintrag.erstellt_am,
      mandant_id: '',
      quelle_id: '',
      iban_gegenseite: null,
      bic_gegenseite: null,
      buchungsreferenz: null,
      mwst_satz: eintrag.mwst_satz ?? null,
      workflow_status: 'normal',
      belege: eintrag.belege,
      zahlungsquellen: { name: 'Kassa', typ: 'kassa' },
      buchungsnummer: null,
      geloescht_am: null,
      match_bestaetigt_am: null,
      match_bestaetigt_von: null,
    }

    setZuordnungsTransaktion(asTransaktion)
    setZuordnungsDialogOpen(true)
  }

  function clearFilters() {
    setSearchFilter('')
    setStatusFilter('alle')
    setKategorieFilter('alle')
    setDatumVon('')
    setDatumBis('')
  }

  const hasFilters =
    searchFilter !== '' ||
    statusFilter !== 'alle' ||
    kategorieFilter !== 'alle' ||
    datumVon !== '' ||
    datumBis !== ''

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kassabuch</h1>
          <p className="text-sm text-muted-foreground">
            Verwalten Sie Ihre Bargeldbewegungen und den Kassastand.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setAnfangssaldoDialogOpen(true)}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Anfangssaldo
          </Button>

          {/* Aktionen-Dropdown (Kassabuch-Erweiterung) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Aktionen
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Export</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                <Download className="mr-2 h-4 w-4" />
                Monat exportieren
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setArchivListeOpen(true)}>
                <Archive className="mr-2 h-4 w-4" />
                Archiv
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Kassenprüfung</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setPruefungDialogOpen(true)}>
                <Scale className="mr-2 h-4 w-4" />
                Kassenprüfung
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPruefungHistorieOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                Prüfungshistorie
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel>Verwaltung</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setVorlagenListeOpen(true)}>
                <BookmarkPlus className="mr-2 h-4 w-4" />
                Vorlagen verwalten
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setKategorienOpen(true)}>
                <Tag className="mr-2 h-4 w-4" />
                Kategorien verwalten
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={handleNewEintrag}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Eintrag
          </Button>
        </div>
      </div>

      {/* Saldo-Anzeige */}
      <SaldoAnzeige
        anfangssaldo={saldoData.anfangssaldo}
        summeEintraege={saldoData.summe_eintraege}
        aktuellerSaldo={saldoData.aktueller_saldo}
        loading={saldoLoading}
      />

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label
            htmlFor="kassa-filter-search"
            className="text-xs font-medium text-muted-foreground"
          >
            Suche
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="kassa-filter-search"
              placeholder="Beschreibung, Lieferant..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="kassa-filter-datum-von"
            className="text-xs font-medium text-muted-foreground"
          >
            Datum von
          </label>
          <Input
            id="kassa-filter-datum-von"
            type="date"
            value={datumVon}
            onChange={(e) => setDatumVon(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="kassa-filter-datum-bis"
            className="text-xs font-medium text-muted-foreground"
          >
            Datum bis
          </label>
          <Input
            id="kassa-filter-datum-bis"
            type="date"
            value={datumBis}
            onChange={(e) => setDatumBis(e.target.value)}
            className="w-full sm:w-40"
          />
        </div>

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
              <SelectItem value="vorgeschlagen">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Vorschlaege
                </span>
              </SelectItem>
              <SelectItem value="bestaetigt">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                  Zugeordnet
                </span>
              </SelectItem>
              <SelectItem value="kein_beleg">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-gray-400" />
                  Kein Beleg
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filterKategorien.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Kategorie
            </label>
            <Select value={kategorieFilter} onValueChange={setKategorieFilter}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Kategorie filtern">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Kategorien</SelectItem>
                <SelectItem value="_none">Ohne Kategorie</SelectItem>
                {filterKategorien.map(k => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: k.farbe }}
                      />
                      {k.name}
                    </span>
                  </SelectItem>
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
            onClick={refreshAll}
          >
            Erneut versuchen
          </Button>
        </div>
      )}

      {/* Table */}
      <KassabuchTabelle
        eintraege={filteredEintraege}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onManualAssign={handleManualAssign}
        onActionComplete={refreshAll}
      />

      {/* Existing dialogs */}
      <KassaEintragDialog
        open={eintragDialogOpen}
        onOpenChange={setEintragDialogOpen}
        eintrag={editEintrag}
        initialVorlage={vorlageForNewEntry}
        onSuccess={() => {
          setVorlageForNewEntry(null)
          refreshAll()
        }}
      />

      <AnfangssaldoDialog
        open={anfangssaldoDialogOpen}
        onOpenChange={setAnfangssaldoDialogOpen}
        currentSaldo={anfangssaldo}
        hatEintraege={eintraege.length > 0}
        onSuccess={refreshAll}
      />

      <KassaLoeschenDialog
        eintrag={deleteEintrag}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDeleted={refreshAll}
      />

      <ZuordnungsDialog
        open={zuordnungsDialogOpen}
        onOpenChange={setZuordnungsDialogOpen}
        transaktion={zuordnungsTransaktion}
        onAssigned={refreshAll}
      />

      {/* New dialogs (Kassabuch-Erweiterung 2026-04-23) */}
      <KassabuchExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />

      <KassenpruefungDialog
        open={pruefungDialogOpen}
        onOpenChange={setPruefungDialogOpen}
        onSuccess={refreshAll}
      />

      <KassenpruefungHistorie
        open={pruefungHistorieOpen}
        onOpenChange={setPruefungHistorieOpen}
      />

      <KassaVorlagenListe
        open={vorlagenListeOpen}
        onOpenChange={setVorlagenListeOpen}
        onApplyVorlage={handleApplyVorlage}
      />

      <KassaKategorienVerwaltung
        open={kategorienOpen}
        onOpenChange={setKategorienOpen}
      />

      <KassabuchArchivListe
        open={archivListeOpen}
        onOpenChange={setArchivListeOpen}
      />
    </div>
  )
}
