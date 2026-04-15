interface VideoEmbedProps {
  url?: string | null
  storagePath?: string | null
  title?: string
}

function getYouTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v) return `https://www.youtube.com/embed/${v}`
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1)
      if (id) return `https://www.youtube.com/embed/${id}`
    }
  } catch {
    return null
  }
  return null
}

/**
 * Renders either a YouTube embed or a native <video> player.
 * TODO(PROJ-22): storagePath needs a signed Supabase Storage URL once backend lives.
 */
export function VideoEmbed({ url, storagePath, title }: VideoEmbedProps) {
  if (!url && !storagePath) return null

  if (url) {
    const embedUrl = getYouTubeEmbedUrl(url)
    if (embedUrl) {
      return (
        <div className="my-6 aspect-video w-full overflow-hidden rounded-xl border border-teal-100 bg-black">
          <iframe
            src={embedUrl}
            title={title ?? 'Hilfe-Video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      )
    }
  }

  if (storagePath) {
    // Bug-005 fix: encodeURI für Sonderzeichen im Pfad
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const publicUrl = supabaseUrl
      ? `${supabaseUrl}/storage/v1/object/public/help-videos/${encodeURI(storagePath)}`
      : encodeURI(storagePath)
    return (
      <div className="my-6 overflow-hidden rounded-xl border border-teal-100 bg-black">
        <video controls preload="metadata" className="w-full">
          <source src={publicUrl} type="video/mp4" />
          Dein Browser unterstützt das Video-Element nicht.
        </video>
      </div>
    )
  }

  return null
}
