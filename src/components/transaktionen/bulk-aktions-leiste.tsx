'use client'

import { useState } from 'react'
import { Link2, Ban, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface BulkAktionsLeisteProps {
  selectedIds: string[]
  onClearSelection: () => void
  onBulkKeinBeleg: () => void
  onBulkZuordnen: () => void
  onActionComplete: () => void
}

export function BulkAktionsLeiste({
  selectedIds,
  onClearSelection,
  onBulkKeinBeleg,
  onBulkZuordnen,
  onActionComplete,
}: BulkAktionsLeisteProps) {
  const [loading, setLoading] = useState(false)

  if (selectedIds.length === 0) return null

  async function handleKeinBeleg() {
    setLoading(true)
    try {
      const results = await Promise.allSettled(
        selectedIds.map((id) =>
          fetch(`/api/transaktionen/${id}/match`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kein_beleg: true }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = await res.json()
              throw new Error(data.error ?? 'Fehler')
            }
          })
        )
      )

      const succeeded = results.filter((r) => r.status === 'fulfilled').length
      const failed = results.filter((r) => r.status === 'rejected').length

      if (failed > 0) {
        toast.warning(`${succeeded} markiert, ${failed} fehlgeschlagen`)
      } else {
        toast.success(`${succeeded} Transaktionen als "Kein Beleg" markiert`)
      }

      onClearSelection()
      onActionComplete()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler bei Bulk-Aktion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sticky bottom-4 z-10 mx-auto w-fit">
      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <Badge variant="secondary" className="font-mono">
          {selectedIds.length}
        </Badge>
        <span className="text-sm font-medium">
          {selectedIds.length === 1 ? 'Transaktion' : 'Transaktionen'} ausgewaehlt
        </span>

        <div className="flex items-center gap-2 ml-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkZuordnen}
            disabled={loading}
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            Zuordnen
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleKeinBeleg}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="mr-1.5 h-3.5 w-3.5" />
            )}
            Kein Beleg
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClearSelection}
            disabled={loading}
            aria-label="Auswahl aufheben"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
