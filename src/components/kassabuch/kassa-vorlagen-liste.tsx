'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookmarkPlus, Pencil, Plus, Trash2, Tag } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  KassaVorlagenDialog,
  type KassaVorlage,
  type KategorieOption,
} from '@/components/kassabuch/kassa-vorlagen-dialog'

interface KassaVorlagenListeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional: callback wenn Nutzer "Aus Vorlage erstellen" klickt – Dialog schließt, Parent öffnet KassaEintragDialog */
  onApplyVorlage?: (vorlage: KassaVorlage) => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

const BUCHUNGSTYP_LABEL: Record<KassaVorlage['kassa_buchungstyp'], string> = {
  EINNAHME: 'Einnahme',
  AUSGABE: 'Ausgabe',
  EINLAGE: 'Einlage',
  ENTNAHME: 'Entnahme',
}

const BUCHUNGSTYP_COLOR: Record<KassaVorlage['kassa_buchungstyp'], string> = {
  EINNAHME: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  AUSGABE: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  EINLAGE: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300',
  ENTNAHME: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
}

export function KassaVorlagenListe({
  open,
  onOpenChange,
  onApplyVorlage,
}: KassaVorlagenListeProps) {
  const [vorlagen, setVorlagen] = useState<KassaVorlage[]>([])
  const [kategorien, setKategorien] = useState<KategorieOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [vorlageDialogOpen, setVorlageDialogOpen] = useState(false)
  const [editVorlage, setEditVorlage] = useState<KassaVorlage | null>(null)
  const [deleteVorlage, setDeleteVorlage] = useState<KassaVorlage | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchVorlagen = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // TODO (Backend): Implement API routes
      //   GET /api/kassabuch/vorlagen   – returns { vorlagen: KassaVorlage[] }
      //   GET /api/kassabuch/kategorien – returns { kategorien: KategorieOption[] }
      const [vorlagenRes, kategorienRes] = await Promise.all([
        fetch('/api/kassabuch/vorlagen'),
        fetch('/api/kassabuch/kategorien'),
      ])

      if (!vorlagenRes.ok) throw new Error('Vorlagen konnten nicht geladen werden')
      const vorlagenData = await vorlagenRes.json()
      setVorlagen(vorlagenData.vorlagen ?? [])

      if (kategorienRes.ok) {
        const kategorienData = await kategorienRes.json()
        setKategorien(kategorienData.kategorien ?? [])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchVorlagen()
    }
  }, [open, fetchVorlagen])

  function handleCreate() {
    setEditVorlage(null)
    setVorlageDialogOpen(true)
  }

  function handleEdit(v: KassaVorlage) {
    setEditVorlage(v)
    setVorlageDialogOpen(true)
  }

  function handleDeleteRequest(v: KassaVorlage) {
    setDeleteVorlage(v)
  }

  async function handleDeleteConfirm() {
    if (!deleteVorlage) return
    setDeleting(true)
    try {
      // TODO (Backend): Implement DELETE /api/kassabuch/vorlagen/[id]
      // Soft-reference: transaktionen.kassa_vorlage_id will be set to NULL on cascade
      const response = await fetch(
        `/api/kassabuch/vorlagen/${deleteVorlage.id}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Vorlage konnte nicht gelöscht werden')
      }
      toast.success('Vorlage gelöscht')
      setDeleteVorlage(null)
      fetchVorlagen()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setDeleting(false)
    }
  }

  function handleApply(v: KassaVorlage) {
    if (onApplyVorlage) {
      onApplyVorlage(v)
      onOpenChange(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <BookmarkPlus className="h-5 w-5 text-teal-600" />
                  Buchungs-Vorlagen
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Wiederkehrende Buchungen als Vorlage speichern (max. 50).
                </DialogDescription>
              </div>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                Neue Vorlage
              </Button>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : vorlagen.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <BookmarkPlus className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Noch keine Vorlagen</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Legen Sie wiederkehrende Buchungen als Vorlage an, um sie mit einem Klick zu übernehmen.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh] pr-3">
              <ul className="space-y-2">
                {vorlagen.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{v.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${BUCHUNGSTYP_COLOR[v.kassa_buchungstyp]}`}
                        >
                          {BUCHUNGSTYP_LABEL[v.kassa_buchungstyp]}
                        </Badge>
                        {v.kategorie_name && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Tag className="h-3 w-3" />
                            {v.kategorie_name}
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {v.betrag !== null ? (
                          <span className="font-mono">{formatCurrency(v.betrag)}</span>
                        ) : (
                          <span className="italic">Betrag variabel</span>
                        )}
                        {v.beschreibung && (
                          <>
                            <span>·</span>
                            <span className="truncate">{v.beschreibung}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {onApplyVorlage && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleApply(v)}
                        >
                          Übernehmen
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(v)}
                        aria-label="Vorlage bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteRequest(v)}
                        aria-label="Vorlage löschen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <KassaVorlagenDialog
        open={vorlageDialogOpen}
        onOpenChange={setVorlageDialogOpen}
        vorlage={editVorlage}
        kategorien={kategorien}
        onSuccess={fetchVorlagen}
      />

      <AlertDialog
        open={deleteVorlage !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteVorlage(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Vorlage „{deleteVorlage?.name}" wird dauerhaft entfernt. Bereits erstellte Buchungen
              aus dieser Vorlage bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Wird gelöscht...' : 'Löschen'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
