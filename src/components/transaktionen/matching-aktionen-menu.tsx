'use client'

import { useState } from 'react'
import { MoreHorizontal, Check, X, Link2, Ban, Unlink } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { MatchStatus } from '@/lib/supabase/types'

interface MatchingAktionenMenuProps {
  transaktionId: string
  belegId: string | null
  matchStatus: MatchStatus
  onActionComplete: () => void
  onManualAssign?: (transaktionId: string) => void
}

export function MatchingAktionenMenu({
  transaktionId,
  belegId,
  matchStatus,
  onActionComplete,
  onManualAssign,
}: MatchingAktionenMenuProps) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!belegId) return
    setLoading(true)
    try {
      const response = await fetch('/api/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaktion_id: transaktionId, beleg_id: belegId }),
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
    if (!belegId) return
    setLoading(true)
    try {
      const response = await fetch('/api/matching/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaktion_id: transaktionId, beleg_id: belegId }),
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

  async function handleRemoveMatch() {
    setLoading(true)
    try {
      const response = await fetch(`/api/transaktionen/${transaktionId}/match`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      })
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

  async function handleKeinBeleg() {
    setLoading(true)
    try {
      const response = await fetch(`/api/transaktionen/${transaktionId}/match`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kein_beleg: true }),
      })
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

  const canConfirm = matchStatus === 'vorgeschlagen' && belegId
  const canReject = matchStatus === 'vorgeschlagen' && belegId
  const canRemoveMatch = matchStatus === 'bestaetigt' && belegId
  const canManualAssign = matchStatus === 'offen' || matchStatus === 'vorgeschlagen'
  const canKeinBeleg = matchStatus === 'offen' || matchStatus === 'vorgeschlagen'
  const canRevertKeinBeleg = matchStatus === 'kein_beleg'

  const hasAnyAction = canConfirm || canReject || canRemoveMatch || canManualAssign || canKeinBeleg || canRevertKeinBeleg

  if (!hasAnyAction) return null

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

        {(canConfirm || canReject || canRemoveMatch) && (canManualAssign || canKeinBeleg || canRevertKeinBeleg) && (
          <DropdownMenuSeparator />
        )}

        {canManualAssign && onManualAssign && (
          <DropdownMenuItem onClick={() => onManualAssign(transaktionId)}>
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
