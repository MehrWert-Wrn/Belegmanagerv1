'use client'

import { useState, useEffect } from 'react'
import { FolderOpen, Pencil, ExternalLink, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

function getDisplayLabel(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    if (host.includes('onedrive') || host.includes('sharepoint') || host.includes('live.com')) return 'Belegespeicher öffnen'
    if (host.includes('drive.google') || host.includes('docs.google')) return 'Belegespeicher öffnen'
    if (host.includes('dropbox')) return 'Belegespeicher öffnen'
    if (host.includes('box.com')) return 'Belegespeicher öffnen'
    if (host.includes('icloud')) return 'Belegespeicher öffnen'
    return 'Belegespeicher öffnen'
  } catch {
    return 'Belegespeicher öffnen'
  }
}

export function CloudStorageWidget() {
  const [url, setUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/mandant/cloud-storage')
      .then((r) => r.json())
      .then((d) => setUrl(d.cloud_storage_url ?? null))
      .catch(() => {})
  }, [])

  const openEdit = () => {
    setDraft(url ?? '')
    setEditing(true)
  }

  const cancel = () => setEditing(false)

  const save = async () => {
    const value = draft.trim() || null
    setSaving(true)
    try {
      const res = await fetch('/api/mandant/cloud-storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloud_storage_url: value }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error || 'Fehler')
      }
      setUrl(value)
      setEditing(false)
      toast.success('Link gespeichert')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-teal-100">
      <CardContent className="py-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Link zur Belegespeicher - Cloud</p>
        <div className="flex items-center gap-3">
        <FolderOpen className="h-4 w-4 shrink-0 text-teal-600" />

        {editing ? (
          <>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="h-8 flex-1 text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') cancel()
              }}
            />
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={save} disabled={saving}>
              <Check className="h-4 w-4 text-teal-600" />
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={cancel}>
              <X className="h-4 w-4 text-muted-foreground" />
            </Button>
          </>
        ) : url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-sm font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900"
            >
              {getDisplayLabel(url)}
            </a>
            <Button size="sm" variant="ghost" className="h-8 px-2" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={openEdit}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-muted-foreground">
              Kein Speicherort hinterlegt
            </span>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={openEdit}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              Link hinzufügen
            </Button>
          </>
        )}
        </div>
      </CardContent>
    </Card>
  )
}
