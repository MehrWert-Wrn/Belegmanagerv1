'use client'

import {
  ArrowUpRight,
  ArrowDownLeft,
  BookOpen,
  FileText,
  MoreHorizontal,
  Pencil,
  Trash2,
  Link2,
  Ban,
  Unlink,
  Check,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { AmpelBadge } from '@/components/transaktionen/ampel-badge'
import type { MatchStatus } from '@/lib/supabase/types'

export interface KassaEintrag {
  id: string
  datum: string
  betrag: number
  beschreibung: string | null
  match_status: MatchStatus
  match_score: number | null
  match_type: string | null
  beleg_id: string | null
  erstellt_am: string
  mwst_satz: number | null
  belege: {
    lieferant: string | null
    rechnungsnummer: string | null
    bruttobetrag: number | null
  } | null
}

interface KassabuchTabelleProps {
  eintraege: KassaEintrag[]
  loading: boolean
  onEdit: (eintrag: KassaEintrag) => void
  onDelete: (eintrag: KassaEintrag) => void
  onManualAssign: (eintragId: string) => void
  onActionComplete: () => void
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

export function KassabuchTabelle({
  eintraege,
  loading,
  onEdit,
  onDelete,
  onManualAssign,
  onActionComplete,
}: KassabuchTabelleProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (eintraege.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Noch keine Kassaeintraege vorhanden
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Erstellen Sie Ihren ersten Eintrag, um das Kassabuch zu starten.
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
            <TableHead className="w-10"></TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead className="hidden md:table-cell">
              Beschreibung
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Beleg</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {eintraege.map((eintrag) => {
            const isExpense = eintrag.betrag < 0

            return (
              <TableRow key={eintrag.id}>
                <TableCell>
                  {isExpense ? (
                    <ArrowUpRight className="h-4 w-4 text-red-500" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-emerald-500" />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(eintrag.datum)}
                </TableCell>
                <TableCell
                  className={`whitespace-nowrap text-right font-mono text-sm ${
                    isExpense
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {formatCurrency(eintrag.betrag)}
                </TableCell>
                <TableCell className="hidden max-w-[250px] truncate text-sm md:table-cell">
                  {eintrag.beschreibung || '-'}
                </TableCell>
                <TableCell>
                  <AmpelBadge
                    status={eintrag.match_status}
                    score={eintrag.match_score}
                  />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <BelegReferenz beleg={eintrag.belege} />
                </TableCell>
                <TableCell>
                  <KassaAktionenMenu
                    eintrag={eintrag}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onManualAssign={onManualAssign}
                    onActionComplete={onActionComplete}
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

// --- BelegReferenz ---

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
      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="max-w-[180px] truncate">
        <span className="font-medium">
          {beleg.lieferant ?? 'Unbekannt'}
        </span>
        {beleg.rechnungsnummer && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({beleg.rechnungsnummer})
          </span>
        )}
      </div>
    </div>
  )
}

// --- KassaAktionenMenu ---

interface KassaAktionenMenuProps {
  eintrag: KassaEintrag
  onEdit: (eintrag: KassaEintrag) => void
  onDelete: (eintrag: KassaEintrag) => void
  onManualAssign: (eintragId: string) => void
  onActionComplete: () => void
}

function KassaAktionenMenu({
  eintrag,
  onEdit,
  onDelete,
  onManualAssign,
  onActionComplete,
}: KassaAktionenMenuProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!eintrag.beleg_id) return
    setLoading(true)
    try {
      const response = await fetch('/api/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaktion_id: eintrag.id,
          beleg_id: eintrag.beleg_id,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Bestaetigung fehlgeschlagen')
      }
      toast.success('Zuordnung bestaetigt')
      onActionComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    if (!eintrag.beleg_id) return
    setLoading(true)
    try {
      const response = await fetch('/api/matching/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaktion_id: eintrag.id,
          beleg_id: eintrag.beleg_id,
        }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Ablehnung fehlgeschlagen')
      }
      toast.success('Vorschlag abgelehnt')
      onActionComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  async function handleKeinBeleg() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/transaktionen/${eintrag.id}/match`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kein_beleg: true }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Markierung fehlgeschlagen')
      }
      toast.success('Als "Kein Beleg erforderlich" markiert')
      onActionComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveMatch() {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/transaktionen/${eintrag.id}/match`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Zuordnung konnte nicht entfernt werden')
      }
      toast.success('Zuordnung entfernt')
      onActionComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  const canConfirm =
    eintrag.match_status === 'vorgeschlagen' && eintrag.beleg_id
  const canReject =
    eintrag.match_status === 'vorgeschlagen' && eintrag.beleg_id
  const canRemoveMatch =
    eintrag.match_status === 'bestaetigt' && eintrag.beleg_id
  const canManualAssign =
    eintrag.match_status === 'offen' ||
    eintrag.match_status === 'vorgeschlagen'
  const canKeinBeleg =
    eintrag.match_status === 'offen' ||
    eintrag.match_status === 'vorgeschlagen'
  const canRevertKeinBeleg = eintrag.match_status === 'kein_beleg'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={loading}
          aria-label="Aktionen"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Kassa-spezifisch: Bearbeiten + Loeschen */}
        <DropdownMenuItem onClick={() => onEdit(eintrag)}>
          <Pencil className="mr-2 h-4 w-4" />
          Bearbeiten
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(eintrag)}
          className="text-red-600 dark:text-red-400"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Loeschen
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Matching actions - identisch zu Transaktionen */}
        {canConfirm && (
          <DropdownMenuItem onClick={handleConfirm} disabled={loading}>
            <Check className="mr-2 h-4 w-4 text-emerald-500" />
            Zuordnung bestaetigen
          </DropdownMenuItem>
        )}

        {canReject && (
          <DropdownMenuItem onClick={handleReject} disabled={loading}>
            <X className="mr-2 h-4 w-4 text-red-500" />
            Vorschlag ablehnen
          </DropdownMenuItem>
        )}

        {canRemoveMatch && (
          <DropdownMenuItem onClick={handleRemoveMatch} disabled={loading}>
            <Unlink className="mr-2 h-4 w-4 text-red-500" />
            Zuordnung entfernen
          </DropdownMenuItem>
        )}

        {canManualAssign && (
          <DropdownMenuItem onClick={() => onManualAssign(eintrag.id)}>
            <Link2 className="mr-2 h-4 w-4" />
            Manuell zuordnen
          </DropdownMenuItem>
        )}

        {canKeinBeleg && (
          <DropdownMenuItem onClick={handleKeinBeleg} disabled={loading}>
            <Ban className="mr-2 h-4 w-4 text-gray-500" />
            Kein Beleg erforderlich
          </DropdownMenuItem>
        )}

        {canRevertKeinBeleg && (
          <DropdownMenuItem onClick={handleRemoveMatch} disabled={loading}>
            <Unlink className="mr-2 h-4 w-4" />
            Markierung aufheben
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
