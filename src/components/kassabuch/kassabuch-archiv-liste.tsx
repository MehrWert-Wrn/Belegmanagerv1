'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, Download, FileText, Lock } from 'lucide-react'
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
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

interface KassabuchArchivEintrag {
  id: string
  monat: string // Format: 'YYYY-MM'
  storage_path: string
  erstellt_am: string
  erstellt_von_name: string | null
}

interface KassabuchArchivListeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const MONAT_NAMES = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
]

function formatMonat(monatKey: string): string {
  // monatKey = 'YYYY-MM'
  const [jahr, monat] = monatKey.split('-')
  const monatIdx = parseInt(monat, 10) - 1
  if (isNaN(monatIdx) || monatIdx < 0 || monatIdx > 11) return monatKey
  return `${MONAT_NAMES[monatIdx]} ${jahr}`
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${d.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function groupByYear(
  eintraege: KassabuchArchivEintrag[]
): Array<{ jahr: string; items: KassabuchArchivEintrag[] }> {
  const groups = new Map<string, KassabuchArchivEintrag[]>()
  for (const e of eintraege) {
    const jahr = e.monat.slice(0, 4)
    if (!groups.has(jahr)) groups.set(jahr, [])
    groups.get(jahr)!.push(e)
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([jahr, items]) => ({
      jahr,
      items: items.sort((a, b) => b.monat.localeCompare(a.monat)),
    }))
}

export function KassabuchArchivListe({
  open,
  onOpenChange,
}: KassabuchArchivListeProps) {
  const [archiv, setArchiv] = useState<KassabuchArchivEintrag[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const fetchArchiv = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // TODO (Backend): Implement GET /api/kassabuch/archiv
      // Returns { archiv: KassabuchArchivEintrag[] } sorted newest first
      // Joins erstellt_von_name from benutzer_profile
      const response = await fetch('/api/kassabuch/archiv')
      if (!response.ok) {
        throw new Error('Archiv konnte nicht geladen werden')
      }
      const data = await response.json()
      setArchiv(data.archiv ?? [])
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
      fetchArchiv()
    }
  }, [open, fetchArchiv])

  async function handleDownload(eintrag: KassabuchArchivEintrag) {
    setDownloadingId(eintrag.id)
    try {
      // TODO (Backend): Implement GET /api/kassabuch/archiv/[monat]
      // Returns signed URL or direct PDF stream from Supabase Storage
      // Path: kassabuch-archive/{mandant_id}/{YYYY-MM}.pdf
      const response = await fetch(`/api/kassabuch/archiv/${eintrag.monat}`)
      if (!response.ok) {
        throw new Error('Download fehlgeschlagen')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kassabuch-${eintrag.monat}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setDownloadingId(null)
    }
  }

  const groups = groupByYear(archiv)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-teal-600" />
            Kassabuch-Archiv
          </DialogTitle>
          <DialogDescription>
            Unveränderliche Monats-PDFs nach dem Monatsabschluss (§ 131 BAO).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : archiv.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Archive className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Archiv ist leer</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Sobald Sie einen Monat abschließen, wird automatisch ein unveränderliches PDF
              hier abgelegt.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.jahr} className="space-y-2">
                  <h3 className="sticky top-0 bg-background py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.jahr}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950">
                            <FileText className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {formatMonat(e.monat)}
                              </span>
                              <Lock className="h-3 w-3 text-muted-foreground" aria-label="Gesperrt" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Archiviert am {formatDateTime(e.erstellt_am)}
                              {e.erstellt_von_name && <> · von {e.erstellt_von_name}</>}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownload(e)}
                          disabled={downloadingId === e.id}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          {downloadingId === e.id ? 'Lade...' : 'Download'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
