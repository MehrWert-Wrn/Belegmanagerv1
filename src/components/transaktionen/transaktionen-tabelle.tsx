'use client'

import { useState, useMemo } from 'react'
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, FileText, MessageCircleQuestion, CheckCircle2, EyeOff, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { AmpelBadge } from '@/components/transaktionen/ampel-badge'
import { MatchGrund } from '@/components/transaktionen/match-grund'
import { MatchingAktionenMenu } from '@/components/transaktionen/matching-aktionen-menu'
import type { TransaktionWithRelations } from '@/lib/supabase/types'

type SortField = 'datum' | 'betrag'
type SortDir = 'asc' | 'desc'

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50 inline" />
  if (sortDir === 'asc') return <ChevronUp className="ml-1 h-3.5 w-3.5 inline" />
  return <ChevronDown className="ml-1 h-3.5 w-3.5 inline" />
}

interface TransaktionenTabelleProps {
  transaktionen: TransaktionWithRelations[]
  loading: boolean
  onActionComplete: () => void
  onManualAssign?: (transaktionId: string) => void
  onCreateRegel?: (prefill: string) => void
  onCreateEigenbeleg?: (transaktionId: string) => void
  onRowClick?: (transaktion: TransaktionWithRelations) => void
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function TransaktionenTabelle({
  transaktionen,
  loading,
  onActionComplete,
  onManualAssign,
  onCreateRegel,
  onCreateEigenbeleg,
  onRowClick,
  selectedIds = [],
  onSelectionChange,
}: TransaktionenTabelleProps) {
  const selectable = !!onSelectionChange
  const [sortField, setSortField] = useState<SortField>('datum')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => {
    return [...transaktionen].sort((a, b) => {
      let cmp = 0
      if (sortField === 'datum') {
        // ISO dates (YYYY-MM-DD): direct string comparison = chronological order
        cmp = a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0
      } else {
        cmp = a.betrag - b.betrag
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [transaktionen, sortField, sortDir])

  function handleSelectAll(checked: boolean) {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange(sorted.map((t) => t.id))
    } else {
      onSelectionChange([])
    }
  }

  function handleSelectOne(id: string, checked: boolean) {
    if (!onSelectionChange) return
    if (checked) {
      onSelectionChange([...selectedIds, id])
    } else {
      onSelectionChange(selectedIds.filter((i) => i !== id))
    }
  }

  const allSelected =
    sorted.length > 0 && selectedIds.length === sorted.length
  const someSelected =
    selectedIds.length > 0 && selectedIds.length < sorted.length

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (transaktionen.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <ArrowLeftRight className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Keine Transaktionen vorhanden
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Importieren Sie einen Kontoauszug, um zu beginnen.
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
            {selectable && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  aria-label="Alle Transaktionen auswaehlen"
                />
              </TableHead>
            )}
            <TableHead className="w-10"></TableHead>
            <TableHead
              className="cursor-pointer select-none whitespace-nowrap"
              onClick={() => toggleSort('datum')}
            >
              Datum
              <SortIcon field="datum" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead
              className="w-28 text-right cursor-pointer select-none whitespace-nowrap"
              onClick={() => toggleSort('betrag')}
            >
              Betrag
              <SortIcon field="betrag" sortField={sortField} sortDir={sortDir} />
            </TableHead>
            <TableHead className="hidden md:table-cell min-w-[300px]">
              Beschreibung
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Beleg</TableHead>
            <TableHead className="hidden lg:table-cell">Match-Grund</TableHead>
            <TableHead className="w-8"></TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((t) => {
            const isExpense = t.betrag < 0
            const isSelected = selectedIds.includes(t.id)

            return (
              <TableRow
                key={t.id}
                className={`${isSelected ? 'bg-primary/5' : ''} ${onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
                onClick={() => onRowClick?.(t)}
              >
                {selectable && (
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        handleSelectOne(t.id, checked === true)
                      }
                      aria-label={`Transaktion vom ${formatDate(t.datum)} auswaehlen`}
                    />
                  </TableCell>
                )}
                <TableCell>
                  {isExpense ? (
                    <ArrowUpRight className="h-4 w-4 text-red-500" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-teal-500" />
                  )}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {formatDate(t.datum)}
                </TableCell>
                <TableCell
                  className={`text-sm text-right font-mono whitespace-nowrap ${
                    isExpense
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-teal-600 dark:text-teal-400'
                  }`}
                >
                  {formatCurrency(t.betrag)}
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm max-w-[450px] truncate">
                  {t.beschreibung || '-'}
                </TableCell>
                <TableCell>
                  <AmpelBadge
                    status={t.match_status}
                    score={t.match_score}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <BelegReferenz beleg={t.belege} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <MatchGrund
                    matchType={t.match_type as Parameters<typeof MatchGrund>[0]['matchType']}
                    score={t.match_score}
                  />
                </TableCell>
                <TableCell className="px-1">
                  {t.workflow_status === 'rueckfrage' && (
                    <MessageCircleQuestion
                      className="h-4 w-4 text-amber-500"
                      aria-label="Rueckfrage offen"
                    />
                  )}
                  {t.workflow_status === 'erledigt' && (
                    <CheckCircle2
                      className="h-4 w-4 text-teal-500"
                      aria-label="Erledigt"
                    />
                  )}
                  {t.workflow_status === 'privat' && (
                    <EyeOff
                      className="h-4 w-4 text-purple-500"
                      aria-label="Privat"
                    />
                  )}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <MatchingAktionenMenu
                    transaktionId={t.id}
                    belegId={t.beleg_id}
                    matchStatus={t.match_status}
                    isExpense={isExpense}
                    beschreibung={t.beschreibung}
                    onActionComplete={onActionComplete}
                    onManualAssign={onManualAssign}
                    onCreateRegel={onCreateRegel}
                    onCreateEigenbeleg={onCreateEigenbeleg}
                  />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

// --- BelegReferenz (inline sub-component) ---

interface BelegReferenzProps {
  beleg: {
    lieferant: string | null
    rechnungsnummer: string | null
    bruttobetrag: number | null
  } | null
}

function BelegReferenz({ beleg }: BelegReferenzProps) {
  if (!beleg) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="truncate max-w-[180px]">
        <span className="font-medium">
          {beleg.lieferant ?? 'Unbekannt'}
        </span>
        {beleg.rechnungsnummer && (
          <span className="text-muted-foreground ml-1 text-xs">
            ({beleg.rechnungsnummer})
          </span>
        )}
      </div>
    </div>
  )
}
