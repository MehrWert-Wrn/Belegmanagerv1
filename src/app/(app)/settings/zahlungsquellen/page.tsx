'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QuelleKarte } from '@/components/zahlungsquellen/quelle-karte'
import { QuelleDialog } from '@/components/zahlungsquellen/quelle-dialog'
import type { Zahlungsquelle } from '@/lib/supabase/types'

export type ZahlungsquelleWithMeta = Zahlungsquelle & { has_transactions: boolean }

export default function ZahlungsquellenPage() {
  const [quellen, setQuellen] = useState<ZahlungsquelleWithMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editQuelle, setEditQuelle] = useState<ZahlungsquelleWithMeta | null>(null)

  const fetchQuellen = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/zahlungsquellen?alle=true')
      if (!res.ok) throw new Error('Fehler beim Laden der Zahlungsquellen')
      const data = await res.json()
      setQuellen(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchQuellen()
  }, [fetchQuellen])

  const aktiveQuellen = quellen.filter((q) => q.aktiv).length
  const MAX_AKTIVE = 10

  function handleEdit(quelle: ZahlungsquelleWithMeta) {
    setEditQuelle(quelle)
    setDialogOpen(true)
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setEditQuelle(null)
  }

  function handleSaved() {
    handleDialogClose()
    fetchQuellen()
  }

  function handleDeleted() {
    fetchQuellen()
  }

  function handleToggled() {
    fetchQuellen()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-5 w-36" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            setLoading(true)
            fetchQuellen()
          }}
        >
          Erneut versuchen
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Zahlungsquellen</h2>
          <p className="text-sm text-muted-foreground">
            Verwalte die Zahlungsquellen deines Unternehmens
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={aktiveQuellen >= MAX_AKTIVE}
        >
          <Plus className="mr-2 h-4 w-4" />
          Neue Quelle
        </Button>
      </div>

      <div className="text-sm text-muted-foreground">
        <span
          className={
            aktiveQuellen >= MAX_AKTIVE ? 'font-medium text-destructive' : ''
          }
        >
          {aktiveQuellen} / {MAX_AKTIVE} aktive Quellen
        </span>
      </div>

      {quellen.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Noch keine Zahlungsquellen vorhanden.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Erste Quelle anlegen
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quellen.map((quelle) => (
            <QuelleKarte
              key={quelle.id}
              quelle={quelle}
              onEdit={() => handleEdit(quelle)}
              onDeleted={handleDeleted}
              onToggled={handleToggled}
              canActivate={aktiveQuellen < MAX_AKTIVE}
            />
          ))}
        </div>
      )}

      <QuelleDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) handleDialogClose()
        }}
        quelle={editQuelle}
        onSaved={handleSaved}
      />
    </div>
  )
}
