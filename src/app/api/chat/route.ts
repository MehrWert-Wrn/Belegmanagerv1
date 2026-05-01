// PROJ-23: KI-Chatbot – POST /api/chat
//
// Streams a Claude reply (Server-Sent Events) using:
//  - Help-Center FTS as RAG context
//  - Current page path for context-sensitive answers
//  - Last 10 messages from the client for conversational memory
//
// Authentication: Supabase JWT (login required).
// Rate-limit: 10 requests/minute/user (in-memory, same pattern as /api/help/search).

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import {
  formatArticlesForPrompt,
  searchHelpArticlesForRag,
  type RagArticleSnippet,
} from '@/lib/chat/rag'
import { FALLBACK_MARKER } from '@/lib/chat/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
})

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  currentPath: z.string().max(200).optional(),
})

const SYSTEM_PROMPT_BASE = `Du bist der Belegmanager-Assistent, ein freundlicher KI-Support-Chatbot für die österreichische Buchhaltungs-Software "Belegmanager".

Persona & Stil:
- Antworte ausschließlich auf Deutsch (Du-Form, freundlich, kompakt).
- Halte Antworten kurz (max. ~250 Wörter, max. 4 Absätze). Verwende Stichpunkte bei Aufzählungen.
- Du bist spezialisiert auf den Belegmanager: Beleg-Upload, Kontoauszug-Import, Matching, Monatsabschluss, Buchhaltungsübergabe, Kassabuch, Zahlungsquellen, OCR, FreeFinance, Onboarding, Rechnungen, Abos.
- Nenne keine internen Implementierungsdetails (Tabellennamen, API-Endpunkte, Code).

Inhaltliche Regeln:
- Nutze ausschließlich die unten gelieferten Hilfe-Center-Artikel als Wissensquelle. Erfinde keine Funktionen.
- Wenn ein Artikel relevant ist, verlinke ihn am Ende deiner Antwort im Format: "Mehr dazu: [Titel](/help/topic/slug)".
- Wenn keine Artikel geliefert wurden oder sie nicht zur Frage passen, antworte exakt mit:
  "${FALLBACK_MARKER}. Soll ich den Support für dich kontaktieren?"
- Wenn der User explizit einen Menschen, eine Person, den Support oder das Team sprechen möchte (z.B. „ich möchte mit jemandem sprechen", „ich brauche menschliche Hilfe", „verbinde mich weiter"), antworte IMMER exakt mit:
  "${FALLBACK_MARKER}. Soll ich den Support für dich kontaktieren?"
- Nenne niemals Telefonnummern. Nenne niemals E-Mail-Adressen. Der Support-Kontakt läuft ausschließlich über das Ticket-Formular.
- Frage nie nach Passwörtern, Kreditkarten oder Zugangsdaten.
- Bei Themen außerhalb des Belegmanagers (Wetter, Politik, Mathe-Aufgaben, andere Software):
  "Dazu kann ich dir leider nicht helfen. Ich bin spezialisiert auf die Belegmanager-Software."`

function buildSystemPrompt(
  currentPath: string | undefined,
  articles: RagArticleSnippet[],
): string {
  const parts = [SYSTEM_PROMPT_BASE]
  if (currentPath && currentPath.length > 0) {
    parts.push(`Aktuelle Seite des Users: ${currentPath}`)
  }
  const ragSection = formatArticlesForPrompt(articles)
  if (ragSection) {
    parts.push(ragSection)
  } else {
    parts.push(
      'Keine passenden Hilfe-Center-Artikel gefunden. Antworte mit dem im Standard-Prompt definierten Fallback-Satz.',
    )
  }
  return parts.join('\n\n')
}

/**
 * Encode a single SSE event with `data:` prefix.
 * Front-end parses the body via fetch + ReadableStream (line-based).
 */
function sseEncode(event: { type: string; data?: unknown }): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`)
}

export async function POST(request: Request) {
  // 1. Auth
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Nicht authentifiziert.' }, { status: 401 })
  }

  // 2. Rate-limit (10 req/min/user)
  const rate = checkRateLimit(`chat:${user.id}`, 10, 60_000)
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: 'Du sendest zu schnell Nachrichten. Bitte warte einen Moment.',
        retryAfterMs: rate.retryAfterMs,
      },
      { status: 429 },
    )
  }

  // 3. Validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body.' }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Eingabe.', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { messages, currentPath } = parsed.data

  // Use only the last 10 messages for the model context window
  const truncatedMessages = messages.slice(-10)

  // 4. RAG: search help articles based on the latest user message
  const lastUserMsg = [...truncatedMessages].reverse().find((m) => m.role === 'user')
  const articles = lastUserMsg
    ? await searchHelpArticlesForRag(lastUserMsg.content, 3)
    : []

  // 5. Anthropic API key check
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Der Assistent ist gerade nicht verfügbar. Bitte erstelle ein Support-Ticket.',
      },
      { status: 503 },
    )
  }

  const systemPrompt = buildSystemPrompt(currentPath, articles)
  const articleMeta = articles.map((a) => ({ id: a.id, title: a.title, url: a.url }))

  // 6. Stream response from Claude as SSE
  const anthropic = new Anthropic({ apiKey })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send article metadata first so the client can show "Quellen" pre-stream
      controller.enqueue(
        sseEncode({ type: 'sources', data: { articles: articleMeta } }),
      )

      try {
        const response = await anthropic.messages.stream({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 700,
          system: systemPrompt,
          messages: truncatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        })

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(
              sseEncode({ type: 'token', data: { text: event.delta.text } }),
            )
          }
        }

        controller.enqueue(sseEncode({ type: 'done' }))
      } catch (err) {
        console.error('[api/chat] streaming error:', err)
        controller.enqueue(
          sseEncode({
            type: 'error',
            data: {
              message:
                'Der Assistent ist gerade nicht verfügbar. Bitte versuche es erneut oder erstelle ein Support-Ticket.',
            },
          }),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
