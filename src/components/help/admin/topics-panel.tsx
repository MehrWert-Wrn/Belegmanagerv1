'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, Pencil, Trash2, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LucideIcon } from '@/components/help/lucide-icon'
import type { HelpTopicWithCount } from '@/lib/help/types'
import slugify from 'slugify'

interface TopicsPanelProps {
  topics: HelpTopicWithCount[]
}

export function TopicsPanel({ topics }: TopicsPanelProps) {
  const router = useRouter()

  // Neues Thema anlegen
  const [createOpen, setCreateOpen] = useState(false)
  const [createTitle, setCreateTitle] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createIcon, setCreateIcon] = useState('HelpCircle')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Thema bearbeiten – Bug-002 fix
  const [editTopic, setEditTopic] = useState<HelpTopicWithCount | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Sort-Pending (Bug-006 fix)
  const [sortingId, setSortingId] = useState<string | null>(null)

  async function handleCreate() {
    setCreateError(null)
    if (!createTitle.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/admin/help/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: createTitle.trim(),
          slug: slugify(createTitle, { lower: true, strict: true }),
          description: createDescription,
          icon: createIcon,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Thema konnte nicht angelegt werden.')
      }
      setCreateOpen(false)
      setCreateTitle('')
      setCreateDescription('')
      setCreateIcon('HelpCircle')
      router.refresh()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setCreating(false)
    }
  }

  function openEditDialog(topic: HelpTopicWithCount) {
    setEditTopic(topic)
    setEditTitle(topic.title)
    setEditDescription(topic.description ?? '')
    setEditIcon(topic.icon ?? 'HelpCircle')
    setEditError(null)
  }

  async function handleEdit() {
    if (!editTopic) return
    setEditError(null)
    if (!editTitle.trim()) return
    setEditing(true)
    try {
      const res = await fetch(`/api/admin/help/topics/${editTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription,
          icon: editIcon,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Thema konnte nicht gespeichert werden.')
      }
      setEditTopic(null)
      router.refresh()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setEditing(false)
    }
  }

  async function handleDelete(id: string, count: number) {
    const msg =
      count > 0
        ? `Dieses Thema enthält ${count} Artikel. Trotzdem löschen?`
        : 'Thema wirklich löschen?'
    if (!window.confirm(msg)) return
    try {
      const res = await fetch(`/api/admin/help/topics/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Thema konnte nicht gelöscht werden.')
      }
      router.refresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }

  // Bug-006 fix: Reihenfolge per ↑↓-Buttons steuern
  async function handleMoveSort(topic: HelpTopicWithCount, direction: 'up' | 'down') {
    const sorted = [...topics].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex((t) => t.id === topic.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const swapTarget = sorted[swapIdx]
    setSortingId(topic.id)
    try {
      await Promise.all([
        fetch(`/api/admin/help/topics/${topic.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: swapTarget.sort_order }),
        }),
        fetch(`/api/admin/help/topics/${swapTarget.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sort_order: topic.sort_order }),
        }),
      ])
      router.refresh()
    } catch {
      window.alert('Reihenfolge konnte nicht geändert werden.')
    } finally {
      setSortingId(null)
    }
  }

  const sorted = [...topics].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <>
      <Card className="border-teal-100">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-[#08525E]">Themen</CardTitle>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700">
                <Plus className="mr-2 h-4 w-4" />
                Neues Thema
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Neues Thema anlegen</DialogTitle>
                <DialogDescription>
                  Themen gruppieren verwandte Hilfe-Artikel.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="topic-title">Titel</Label>
                  <Input
                    id="topic-title"
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="z.B. Erste Schritte"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="topic-desc">Beschreibung</Label>
                  <Textarea
                    id="topic-desc"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                    placeholder="Kurze Beschreibung des Themas"
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="topic-icon">Lucide-Icon-Name</Label>
                  <Input
                    id="topic-icon"
                    value={createIcon}
                    onChange={(e) => setCreateIcon(e.target.value)}
                    placeholder="z.B. Rocket, FileText, Settings"
                  />
                  <p className="text-xs text-muted-foreground">
                    Gültige Namen: siehe lucide.dev/icons
                  </p>
                </div>
              </div>
              {createError && (
                <p role="alert" className="text-xs text-red-600">
                  {createError}
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!createTitle.trim() || creating}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Anlegen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/40 p-6 text-center text-sm text-muted-foreground">
              Noch keine Themen angelegt.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {sorted.map((topic, idx) => (
                <li
                  key={topic.id}
                  className="flex items-center gap-3 rounded-lg border border-teal-100 bg-white p-3 hover:border-teal-300"
                >
                  {/* Bug-006 fix: ↑↓ Sortier-Buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-label="Nach oben"
                      disabled={idx === 0 || sortingId === topic.id}
                      onClick={() => handleMoveSort(topic, 'up')}
                      className="rounded p-0.5 text-teal-400 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-25"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Nach unten"
                      disabled={idx === sorted.length - 1 || sortingId === topic.id}
                      onClick={() => handleMoveSort(topic, 'down')}
                      className="rounded p-0.5 text-teal-400 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-25"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
                    <LucideIcon name={topic.icon} className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[#08525E]">{topic.title}</p>
                      <Badge variant="outline" className="border-teal-200 text-teal-700">
                        {topic.article_count} Artikel
                      </Badge>
                    </div>
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {topic.description}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-teal-700 hover:bg-teal-50"
                    aria-label={`${topic.title} bearbeiten`}
                    onClick={() => openEditDialog(topic)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:bg-red-50"
                    aria-label={`${topic.title} löschen`}
                    onClick={() => handleDelete(topic.id, topic.article_count)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit-Dialog – Bug-002 fix */}
      <Dialog open={Boolean(editTopic)} onOpenChange={(open) => { if (!open) setEditTopic(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thema bearbeiten</DialogTitle>
            <DialogDescription>
              Änderungen werden sofort gespeichert und sind für alle Benutzer sichtbar.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-topic-title">Titel</Label>
              <Input
                id="edit-topic-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="z.B. Erste Schritte"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-topic-desc">Beschreibung</Label>
              <Textarea
                id="edit-topic-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Kurze Beschreibung des Themas"
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-topic-icon">Lucide-Icon-Name</Label>
              <Input
                id="edit-topic-icon"
                value={editIcon}
                onChange={(e) => setEditIcon(e.target.value)}
                placeholder="z.B. Rocket, FileText, Settings"
              />
              <p className="text-xs text-muted-foreground">
                Gültige Namen: siehe lucide.dev/icons
              </p>
            </div>
          </div>
          {editError && (
            <p role="alert" className="text-xs text-red-600">
              {editError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTopic(null)} disabled={editing}>
              Abbrechen
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!editTitle.trim() || editing}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {editing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
