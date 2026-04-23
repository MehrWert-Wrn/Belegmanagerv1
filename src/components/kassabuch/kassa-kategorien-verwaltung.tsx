'use client'

import { useCallback, useEffect, useState } from 'react'
import { Tag, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'

export interface KassaKategorie {
  id: string
  name: string
  farbe: string
  kontonummer: string | null
  ist_standard: boolean
  erstellt_am: string
}

interface KassaKategorienVerwaltungProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Palette vorgeschlagener Farben (Tailwind-kompatible Hex-Werte)
const FARB_PALETTE = [
  '#6B7280', // gray-500
  '#EF4444', // red-500
  '#F59E0B', // amber-500
  '#10B981', // emerald-500
  '#14B8A6', // teal-500
  '#3B82F6', // blue-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
]

export function KassaKategorienVerwaltung({
  open,
  onOpenChange,
}: KassaKategorienVerwaltungProps) {
  const [kategorien, setKategorien] = useState<KassaKategorie[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState(FARB_PALETTE[0])
  const [kontonummer, setKontonummer] = useState('')
  const [saving, setSaving] = useState(false)

  const [deleteKategorie, setDeleteKategorie] =
    useState<KassaKategorie | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchKategorien = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // TODO (Backend): Implement GET /api/kassabuch/kategorien
      // Returns { kategorien: KassaKategorie[] }
      // Standard-Kategorien werden beim Onboarding idempotent geseedet (ensure_kassa_quelle RPC)
      const response = await fetch('/api/kassabuch/kategorien')
      if (!response.ok) {
        throw new Error('Kategorien konnten nicht geladen werden')
      }
      const data = await response.json()
      setKategorien(data.kategorien ?? [])
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
      fetchKategorien()
      resetEditor()
    }
  }, [open, fetchKategorien])

  function resetEditor() {
    setEditingId(null)
    setIsCreating(false)
    setName('')
    setFarbe(FARB_PALETTE[0])
    setKontonummer('')
  }

  function handleStartCreate() {
    setIsCreating(true)
    setEditingId(null)
    setName('')
    setFarbe(FARB_PALETTE[0])
    setKontonummer('')
  }

  function handleStartEdit(k: KassaKategorie) {
    setEditingId(k.id)
    setIsCreating(false)
    setName(k.name)
    setFarbe(k.farbe)
    setKontonummer(k.kontonummer ?? '')
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Bitte geben Sie einen Namen ein.')
      return
    }

    setSaving(true)
    try {
      // TODO (Backend): Implement API routes
      //   POST /api/kassabuch/kategorien (max 100 per mandant)
      //   PATCH /api/kassabuch/kategorien/[id]
      const body = {
        name: name.trim(),
        farbe,
        kontonummer: kontonummer.trim() || null,
      }

      const url = editingId
        ? `/api/kassabuch/kategorien/${editingId}`
        : '/api/kassabuch/kategorien'
      const method = editingId ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Kategorie konnte nicht gespeichert werden')
      }

      toast.success(editingId ? 'Kategorie aktualisiert' : 'Kategorie erstellt')
      resetEditor()
      fetchKategorien()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteKategorie) return
    setDeleting(true)
    try {
      // TODO (Backend): Implement DELETE /api/kassabuch/kategorien/[id]
      // Returns 409 Conflict wenn aktive Buchungen referenzieren → Reassign-Flow
      const response = await fetch(
        `/api/kassabuch/kategorien/${deleteKategorie.id}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? 'Kategorie konnte nicht gelöscht werden')
      }
      toast.success('Kategorie gelöscht')
      setDeleteKategorie(null)
      fetchKategorien()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setDeleting(false)
    }
  }

  const isEditing = editingId !== null || isCreating

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-teal-600" />
                  Kostenkategorien
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Kategorien für die Kontierung durch den Steuerberater (max. 100).
                </DialogDescription>
              </div>
              {!isEditing && (
                <Button size="sm" onClick={handleStartCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Neue Kategorie
                </Button>
              )}
            </div>
          </DialogHeader>

          {/* Inline editor */}
          {isEditing && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="kat-name">
                    Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="kat-name"
                    placeholder="z.B. Büromaterial"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={50}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kat-kontonummer">Kontonummer (optional)</Label>
                  <Input
                    id="kat-kontonummer"
                    placeholder="z.B. 7200"
                    value={kontonummer}
                    onChange={(e) => setKontonummer(e.target.value)}
                    maxLength={20}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Farbe</Label>
                <div className="flex flex-wrap gap-2">
                  {FARB_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFarbe(c)}
                      className={`h-8 w-8 rounded-full border-2 transition ${
                        farbe === c
                          ? 'border-foreground ring-2 ring-offset-2 ring-offset-background'
                          : 'border-transparent hover:border-muted-foreground'
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Farbe ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={resetEditor} disabled={saving}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Speichern...
                    </>
                  ) : editingId ? (
                    'Aktualisieren'
                  ) : (
                    'Erstellen'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-2 pt-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : kategorien.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
              <Tag className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Noch keine Kategorien</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Standard-Kategorien werden automatisch beim Onboarding angelegt.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[50vh] pr-3">
              <ul className="space-y-2">
                {kategorien.map((k) => (
                  <li
                    key={k.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="inline-block h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: k.farbe }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{k.name}</span>
                          {k.ist_standard && (
                            <Badge variant="outline" className="text-xs">
                              Standard
                            </Badge>
                          )}
                        </div>
                        {k.kontonummer && (
                          <p className="text-xs text-muted-foreground">
                            Konto {k.kontonummer}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleStartEdit(k)}
                        aria-label="Kategorie bearbeiten"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteKategorie(k)}
                        aria-label="Kategorie löschen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteKategorie !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteKategorie(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kategorie löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Kategorie „{deleteKategorie?.name}" wird entfernt. Falls aktive Buchungen auf diese
              Kategorie verweisen, wird die Löschung blockiert – weisen Sie diesen Buchungen zuerst
              eine andere Kategorie zu.
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
