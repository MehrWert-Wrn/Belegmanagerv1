'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import slugify from 'slugify'
import { ArrowLeft, Eye, Save, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TiptapEditor } from '@/components/help/tiptap-editor'
import { VideoEmbed } from '@/components/help/video-embed'
import { sanitizeForRender } from '@/lib/help/sanitize'
import type { HelpArticle, HelpTopic } from '@/lib/help/types'

// Bug-015 fix: Preview sanitized rendern
function PreviewContent({ html }: { html: string }) {
  return (
    <div
      className="help-article-content text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#08525E] [&_h3]:mt-4 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[#08525E] [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_a]:text-teal-700 [&_a]:underline"
      dangerouslySetInnerHTML={{ __html: sanitizeForRender(html) || '<p><em>Noch kein Inhalt.</em></p>' }}
    />
  )
}

interface ArticleFormProps {
  mode: 'create' | 'edit'
  topics: HelpTopic[]
  initial?: HelpArticle | null
}

export function ArticleForm({ mode, topics, initial }: ArticleFormProps) {
  const router = useRouter()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug))
  const [topicId, setTopicId] = useState(initial?.topic_id ?? topics[0]?.id ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [status, setStatus] = useState<'draft' | 'published'>(
    initial?.status ?? 'draft',
  )
  const [content, setContent] = useState(initial?.content_html ?? '')
  const [videoUrl, setVideoUrl] = useState(initial?.video_url ?? '')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoFileName, setVideoFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const youtubeValid = useMemo(() => {
    if (!videoUrl) return true
    try {
      const u = new URL(videoUrl)
      return u.hostname.includes('youtube.com') || u.hostname === 'youtu.be'
    } catch {
      return false
    }
  }, [videoUrl])

  function handleTitleChange(value: string) {
    setTitle(value)
    if (!slugTouched) {
      setSlug(slugify(value, { lower: true, strict: true }))
    }
  }

  function handleVideoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const MAX = 500 * 1024 * 1024
    if (file.size > MAX) {
      setError('Video zu groß (max. 500 MB).')
      event.target.value = ''
      return
    }
    if (file.type !== 'video/mp4') {
      setError('Nur MP4-Videos werden unterstützt.')
      event.target.value = ''
      return
    }
    setError(null)
    setVideoFile(file)
    setVideoFileName(file.name)
    // Bug-010 fix: Admin darauf hinweisen, dass YouTube-URL durch MP4 ersetzt wird
    if (videoUrl) {
      setError('Hinweis: Durch den MP4-Upload wird die eingetragene YouTube-URL entfernt.')
    }
  }

  async function uploadVideoForArticle(articleId: string): Promise<boolean> {
    if (!videoFile) return true
    setUploadingVideo(true)
    try {
      const fd = new FormData()
      fd.append('file', videoFile)
      const res = await fetch(`/api/admin/help/articles/${articleId}/video`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Video-Upload fehlgeschlagen.')
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Video-Upload fehlgeschlagen.')
      return false
    } finally {
      setUploadingVideo(false)
    }
  }

  async function handleSave() {
    setError(null)
    if (!title.trim()) {
      setError('Titel darf nicht leer sein.')
      return
    }
    if (!topicId) {
      setError('Bitte ein Thema waehlen.')
      return
    }
    if (!youtubeValid) {
      setError('Ungueltige YouTube-URL.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        topic_id: topicId,
        title: title.trim(),
        slug,
        summary,
        content_html: content,
        status,
        video_url: videoUrl ? videoUrl : null,
      }

      const endpoint =
        mode === 'create'
          ? '/api/admin/help/articles'
          : `/api/admin/help/articles/${initial?.id}`
      const method = mode === 'create' ? 'POST' : 'PUT'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Artikel konnte nicht gespeichert werden.')
      }
      const saved = (await res.json()) as { id: string }

      // Video-Upload (optional)
      if (videoFile) {
        const ok = await uploadVideoForArticle(saved.id)
        if (!ok) {
          // Artikel wurde gespeichert, aber Video-Upload schlug fehl.
          // Wir bleiben auf der Seite, damit der Admin erneut versuchen kann.
          setSaving(false)
          return
        }
      }

      router.push('/admin/help')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/help">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurueck
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight text-[#08525E] md:text-2xl">
            {mode === 'create' ? 'Neuer Artikel' : 'Artikel bearbeiten'}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            className="border-teal-200 text-teal-700 hover:bg-teal-50"
          >
            <Eye className="mr-2 h-4 w-4" />
            Vorschau
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || uploadingVideo}
            className="bg-teal-600 hover:bg-teal-700"
          >
            <Save className="mr-2 h-4 w-4" />
            {uploadingVideo
              ? 'Video wird hochgeladen...'
              : saving
              ? 'Speichere...'
              : 'Speichern'}
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-teal-100 lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-[#08525E]">Meta-Daten</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="z.B. Belege manuell hochladen"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => {
                  setSlug(slugify(e.target.value, { lower: true, strict: true }))
                  setSlugTouched(true)
                }}
              />
              <p className="text-xs text-muted-foreground">
                URL: /help/[thema]/{slug || 'artikel-slug'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="topic">Thema</Label>
              <Select value={topicId} onValueChange={setTopicId}>
                <SelectTrigger id="topic">
                  <SelectValue placeholder="Thema waehlen" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="summary">Zusammenfassung</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Kurze Beschreibung des Artikels"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as 'draft' | 'published')}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Entwurf</SelectItem>
                  <SelectItem value="published">Veroeffentlicht</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="border-teal-100">
            <CardHeader>
              <CardTitle className="text-[#08525E]">Inhalt</CardTitle>
            </CardHeader>
            <CardContent>
              <TiptapEditor value={content} onChange={setContent} />
            </CardContent>
          </Card>

          <Card className="border-teal-100">
            <CardHeader>
              <CardTitle className="text-[#08525E]">Video (optional)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="video-url">YouTube-URL</Label>
                <Input
                  id="video-url"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  aria-invalid={!youtubeValid}
                />
                {!youtubeValid && (
                  <p className="text-xs text-red-600">Ungueltige YouTube-URL.</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-teal-100" />
                <span className="text-xs uppercase tracking-wide text-teal-700">
                  oder
                </span>
                <div className="h-px flex-1 bg-teal-100" />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="video-file">MP4 hochladen (max. 500 MB)</Label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="border-teal-200 text-teal-700"
                    onClick={() => document.getElementById('video-file')?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Datei waehlen
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {videoFileName ?? 'Keine Datei ausgewaehlt'}
                  </span>
                </div>
                <input
                  id="video-file"
                  type="file"
                  accept="video/mp4"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
              </div>

              {(videoUrl || videoFileName) && (
                <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3 text-xs text-muted-foreground">
                  Hinweis: Video-Upload wird beim Speichern an Supabase Storage
                  uebertragen. (TODO PROJ-22)
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-[#08525E]">{title || 'Vorschau'}</DialogTitle>
            <DialogDescription>{summary}</DialogDescription>
          </DialogHeader>
          {youtubeValid && videoUrl && (
            <VideoEmbed url={videoUrl} title={title} />
          )}
          {/* Bug-015 fix: sanitizeForRender() auch im Preview-Dialog */}
          <PreviewContent html={content} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
