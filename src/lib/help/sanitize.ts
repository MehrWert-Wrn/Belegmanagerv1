// PROJ-22: Hilfe-Center – HTML-Sanitization & Helpers
import sanitizeHtml from 'sanitize-html'

// Regex: erlaubt nur echte YouTube-Embed-URLs (kein Phishing via youtube.com/irgendwas)
const YOUTUBE_EMBED_REGEX = /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{6,15}(\?.*)?$/

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i', 'u', 's',
    'blockquote', 'code', 'pre',
    'a', 'span', 'div',
    'img',
    'iframe',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
    iframe: [
      'src', 'width', 'height', 'frameborder',
      'allow', 'allowfullscreen', 'title',
    ],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    div: ['class'],
    th: ['colspan', 'rowspan'],
    td: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  // Bug-001 fix: iframe src muss exakt /embed/-Pfad sein
  exclusiveFilter(frame) {
    if (frame.tag === 'iframe') {
      const src = frame.attribs?.src ?? ''
      return !YOUTUBE_EMBED_REGEX.test(src)
    }
    return false
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
  },
  disallowedTagsMode: 'discard',
}

/**
 * Sanitize HTML content that comes from the Tiptap editor before persisting.
 * Restricts iframes strikt auf YouTube /embed/-URLs (Bug-001).
 */
export function sanitizeArticleHtml(input: string): string {
  if (!input) return ''
  return sanitizeHtml(input, SANITIZE_OPTIONS)
}

/**
 * Defense-in-depth: Sanitization auch beim Rendern (Bug-002).
 * Verhindert XSS falls content_html direkt in die DB geschrieben wurde
 * (z.B. über Supabase Dashboard / psql).
 */
export function sanitizeForRender(input: string): string {
  if (!input) return ''
  return sanitizeHtml(input, SANITIZE_OPTIONS)
}

/**
 * Rough reading-time estimate based on average adult reading speed of
 * ~200 words per minute. Strips HTML tags + decoded entities, counts words.
 * Always returns at least 1 minute.
 */
export function estimateReadTimeMinutes(html: string): number {
  if (!html) return 1
  // Bug-011 fix: HTML-Entities decodieren bevor Wörter gezählt werden
  const stripped = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/g, ' ')  // restliche Entities als Leerzeichen
    .replace(/\s+/g, ' ')
    .trim()
  if (!stripped) return 1
  const wordCount = stripped.split(' ').filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / 200))
}
