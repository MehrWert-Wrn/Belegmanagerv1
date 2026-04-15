'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { HelpArticle, HelpTopicWithCount } from '@/lib/help/types'

interface ArticlesPanelProps {
  topics: HelpTopicWithCount[]
  articles: HelpArticle[]
}

export function ArticlesPanel({ topics, articles }: ArticlesPanelProps) {
  const router = useRouter()
  const [topicFilter, setTopicFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    return articles.filter((a) => {
      if (topicFilter !== 'all' && a.topic_id !== topicFilter) return false
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      return true
    })
  }, [articles, topicFilter, statusFilter])

  const topicById = useMemo(
    () => Object.fromEntries(topics.map((t) => [t.id, t])),
    [topics],
  )

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Artikel "${title}" löschen?`)) return
    try {
      const res = await fetch(`/api/admin/help/articles/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Artikel konnte nicht gelöscht werden.')
      }
      router.refresh()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }

  return (
    <Card className="border-teal-100">
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-[#08525E]">Artikel</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={topicFilter} onValueChange={setTopicFilter}>
            <SelectTrigger className="w-[180px]" aria-label="Nach Thema filtern">
              <SelectValue placeholder="Alle Themen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Themen</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" aria-label="Nach Status filtern">
              <SelectValue placeholder="Alle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="published">Veroeffentlicht</SelectItem>
              <SelectItem value="draft">Entwurf</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild size="sm" className="bg-teal-600 hover:bg-teal-700">
            <Link href="/admin/help/artikel/neu">
              <Plus className="mr-2 h-4 w-4" />
              Neuer Artikel
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/40 p-6 text-center text-sm text-muted-foreground">
            Keine Artikel fuer die aktuelle Filterauswahl.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Thema</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((article) => {
                  const topic = topicById[article.topic_id]
                  return (
                    <TableRow key={article.id}>
                      <TableCell className="max-w-[360px]">
                        <div className="font-medium text-[#08525E]">{article.title}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {article.summary}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-teal-200 text-teal-700">
                          {topic?.title ?? '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {article.status === 'published' ? (
                          <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                            Veroeffentlicht
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 text-amber-700">
                            Entwurf
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            asChild
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-teal-700 hover:bg-teal-50"
                            aria-label={`${article.title} bearbeiten`}
                          >
                            <Link href={`/admin/help/artikel/${article.id}/bearbeiten`}>
                              <Pencil className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:bg-red-50"
                            aria-label={`${article.title} loeschen`}
                            onClick={() => handleDelete(article.id, article.title)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
