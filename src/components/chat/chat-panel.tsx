'use client'

// PROJ-23: KI-Chatbot – Chat panel
//
// Owns: message list, input field, streaming state, escalation flow.
// Streams the assistant's reply via SSE from POST /api/chat.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Loader2, Send, X, LifeBuoy, Check, RefreshCw, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ChatMessage, type ChatMessageData } from './chat-message'
import { createClient } from '@/lib/supabase/client'
import { FALLBACK_MARKER } from '@/lib/chat/constants'

/** Quick-question chips. The set switches based on the current path. */
const DEFAULT_CHIPS = [
  'Beleg hochladen',
  'Kontoauszug importieren',
  'Monatsabschluss durchführen',
]

const CHIPS_BY_PATH: Array<{ test: (path: string) => boolean; chips: string[] }> = [
  {
    test: (p) => p.startsWith('/belege'),
    chips: ['Beleg hochladen', 'OCR erklärt', 'Beleg einer Buchung zuordnen'],
  },
  {
    test: (p) => p.startsWith('/transaktionen') || p.startsWith('/kontoauszug'),
    chips: [
      'Kontoauszug importieren',
      'Wie funktioniert das Matching?',
      'Manuelle Zuordnung',
    ],
  },
  {
    test: (p) => p.startsWith('/kassabuch'),
    chips: ['Kassabuch-Eintrag anlegen', 'Kassabuch exportieren'],
  },
  {
    test: (p) => p.startsWith('/monatsabschluss'),
    chips: [
      'Monatsabschluss durchführen',
      'Was ist die Buchhaltungsübergabe?',
      'Buchungsnummern erklärt',
    ],
  },
  {
    test: (p) => p.startsWith('/dashboard') || p === '/',
    chips: ['Erste Schritte', 'Beleg hochladen', 'Kontoauszug importieren'],
  },
  {
    test: (p) => p.startsWith('/settings'),
    chips: ['Zahlungsquelle anlegen', 'Benutzer einladen', 'Mein Abo verwalten'],
  },
  {
    test: (p) => p.startsWith('/referral'),
    chips: ['Wie funktioniert das Weiterempfehlungs­system?'],
  },
]

function chipsForPath(path: string | null): string[] {
  if (!path) return DEFAULT_CHIPS
  for (const entry of CHIPS_BY_PATH) {
    if (entry.test(path)) return entry.chips
  }
  return DEFAULT_CHIPS
}

interface ChatPanelProps {
  /** Whether the panel is open (parent controls visibility) */
  open: boolean
  /** Close handler – wired to the FAB toggle */
  onClose: () => void
  /** Current pathname so the chatbot can give context-aware answers */
  currentPath: string | null
}

const WELCOME_TEXT =
  'Hallo! Ich bin der Belegmanager-Assistent. Wie kann ich dir helfen?'

// BUG-002: Meeting-Link via env var. Set NEXT_PUBLIC_SUPPORT_MEETING_URL to enable.
const SUPPORT_MEETING_URL = process.env.NEXT_PUBLIC_SUPPORT_MEETING_URL ?? null

interface AssistantSourceMeta {
  id: string
  title: string
  url: string
}

export function ChatPanel({ open, onClose, currentPath }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessageData[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [escalationOpen, setEscalationOpen] = useState(false)
  const [showTicketForm, setShowTicketForm] = useState(false)

  // Counts assistant replies that triggered the fallback (no article match)
  const fallbackCountRef = useRef(0)
  // BUG-008: prevents re-opening escalation card after user explicitly dismissed it
  const escalationDismissedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, escalationOpen, showTicketForm])

  // Focus the input when the panel opens
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => textareaRef.current?.focus(), 200)
      return () => clearTimeout(t)
    }
  }, [open])

  // Cancel any in-flight stream when unmounting
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  // BUG-005: reset chat state on sign-out to prevent data leakage on shared devices
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setMessages([])
        setInput('')
        setEscalationOpen(false)
        setShowTicketForm(false)
        fallbackCountRef.current = 0
        escalationDismissedRef.current = false
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const chips = useMemo(() => chipsForPath(currentPath), [currentPath])

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim()
      if (!text || streaming) return

      // BUG-008: new message = new escalation window
      escalationDismissedRef.current = false

      const userMessage: ChatMessageData = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: text,
      }

      // Build the next message list (user + empty assistant placeholder)
      const assistantId = `a-${Date.now()}`
      const placeholder: ChatMessageData = {
        id: assistantId,
        role: 'assistant',
        content: '',
        streaming: true,
      }

      const apiMessages = [
        ...messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content: text },
      ]

      setMessages((prev) => [...prev, userMessage, placeholder])
      setInput('')
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            currentPath: currentPath ?? '',
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          if (res.status === 429) {
            const data = await res.json().catch(() => ({}))
            throw new Error(
              data?.error ??
                'Du sendest zu schnell Nachrichten. Bitte warte einen Moment.',
            )
          }
          if (res.status === 401) {
            throw new Error(
              'Bitte melde dich erneut an, um den Assistenten zu nutzen.',
            )
          }
          throw new Error(
            'Der Assistent ist gerade nicht verfügbar. Bitte versuche es erneut.',
          )
        }

        if (!res.body) {
          throw new Error('Leere Antwort vom Server.')
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let assistantText = ''
        let sources: AssistantSourceMeta[] = []
        let errored = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // SSE: events are separated by blank lines, lines start with "data: "
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''

          for (const ev of events) {
            const line = ev.split('\n').find((l) => l.startsWith('data: '))
            if (!line) continue
            const payload = line.slice(6).trim()
            if (!payload) continue
            try {
              const parsed = JSON.parse(payload)
              if (parsed.type === 'token' && typeof parsed.data?.text === 'string') {
                assistantText += parsed.data.text
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantText }
                      : m,
                  ),
                )
              } else if (parsed.type === 'sources') {
                sources = parsed.data?.articles ?? []
              } else if (parsed.type === 'error') {
                errored = true
                const errMsg =
                  parsed.data?.message ??
                  'Der Assistent ist gerade nicht verfügbar.'
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: errMsg, streaming: false }
                      : m,
                  ),
                )
              } else if (parsed.type === 'done') {
                // handled after the loop
              }
            } catch {
              // ignore malformed event – we keep streaming
            }
          }
        }

        // Mark message as no-longer-streaming
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: assistantText || m.content, streaming: false }
              : m,
          ),
        )

        // BUG-001: Only count explicit Claude fallback phrase as unhelpful.
        // Checking sources.length === 0 caused false escalations on short
        // inputs like "hi" / "danke" where RAG returned nothing but Claude
        // still gave a valid generic response.
        if (!errored) {
          const wasFallback = assistantText.includes(FALLBACK_MARKER)
          if (wasFallback) {
            fallbackCountRef.current += 1
            // BUG-008: don't re-open if user already dismissed this session
            if (fallbackCountRef.current >= 1 && !escalationDismissedRef.current) {
              setEscalationOpen(true)
            }
          } else {
            fallbackCountRef.current = 0
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        const msg =
          err instanceof Error
            ? err.message
            : 'Der Assistent ist gerade nicht verfügbar.'
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: msg, streaming: false }
              : m,
          ),
        )
        toast.error(msg)
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming, currentPath],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim() || streaming) return
    sendMessage(input)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  function handleChipClick(chip: string) {
    if (streaming) return
    sendMessage(chip)
  }

  function handleEscalationCancel() {
    setEscalationOpen(false)
    fallbackCountRef.current = 0
    escalationDismissedRef.current = true // BUG-008: prevent race re-open
  }

  // BUG-007: reset entire conversation
  function resetChat() {
    abortRef.current?.abort()
    setMessages([])
    setInput('')
    setStreaming(false)
    setEscalationOpen(false)
    setShowTicketForm(false)
    fallbackCountRef.current = 0
    escalationDismissedRef.current = false
  }

  if (!open) return null

  const showWelcome = messages.length === 0

  return (
    <div
      role="dialog"
      aria-label="Belegmanager-Assistent"
      className="fixed inset-0 z-50 flex flex-col border-0 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[560px] sm:w-[380px] sm:rounded-2xl sm:border sm:border-slate-200"
    >
      {/* Header */}
      <header className="flex items-center justify-between rounded-t-2xl border-b border-slate-200 bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
            <LifeBuoy className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">
              Belegmanager-Assistent
            </span>
            <span className="text-[11px] leading-tight text-teal-100">
              Antworten aus dem Hilfe-Center
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={resetChat}
              aria-label="Konversation zurücksetzen"
              title="Neue Konversation starten"
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Chat schließen"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Messages list */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3 py-4">
        {showWelcome && (
          <>
            <ChatMessage
              message={{
                id: 'welcome',
                role: 'assistant',
                content: WELCOME_TEXT,
              }}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {chips.map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  className="rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-medium text-teal-700 transition-colors hover:border-teal-300 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-400"
                >
                  {chip}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}

        {escalationOpen && !showTicketForm && (
          <EscalationCard
            onAccept={() => setShowTicketForm(true)}
            onDecline={handleEscalationCancel}
          />
        )}

        {showTicketForm && (
          <InlineTicketForm
            initialMessage={
              messages
                .filter((m) => m.role === 'user')
                .slice(-1)[0]?.content ?? ''
            }
            onSent={() => {
              setShowTicketForm(false)
              setEscalationOpen(false)
              fallbackCountRef.current = 0
              setMessages((prev) => [
                ...prev,
                {
                  id: `s-${Date.now()}`,
                  role: 'system',
                  content:
                    'Dein Support-Ticket wurde erstellt. Wir melden uns bald bei dir.',
                },
              ])
            }}
            onCancel={() => setShowTicketForm(false)}
          />
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-slate-200 bg-white p-3"
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Frage stellen..."
          rows={1}
          maxLength={2000}
          disabled={streaming}
          aria-label="Nachricht an den Assistenten"
          className="max-h-32 min-h-[40px] flex-1 resize-none border-slate-200 text-sm focus-visible:ring-teal-500"
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || streaming}
          aria-label="Nachricht senden"
          className="h-10 w-10 shrink-0 bg-teal-600 hover:bg-teal-700"
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  )
}

function EscalationCard({
  onAccept,
  onDecline,
}: {
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-medium">Soll ich ein Support-Ticket für dich erstellen?</p>
      <p className="mt-1 text-xs text-amber-800">
        Ich konnte deine Frage nicht ausreichend beantworten. Unser Support-Team
        meldet sich gerne direkt bei dir.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={onAccept}
          className="bg-amber-600 hover:bg-amber-700"
        >
          Ja, Ticket erstellen
        </Button>
        <Button size="sm" variant="outline" onClick={onDecline}>
          Nein, ich versuche es anders
        </Button>
      </div>
      {/* BUG-002: Meeting-Link – set NEXT_PUBLIC_SUPPORT_MEETING_URL to enable */}
      {SUPPORT_MEETING_URL && (
        <a
          href={SUPPORT_MEETING_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-xs text-amber-700 underline underline-offset-2 hover:text-amber-900"
        >
          <ExternalLink className="h-3 w-3" />
          Oder buche direkt ein 15-Min-Meeting
        </a>
      )}
    </div>
  )
}

function InlineTicketForm({
  initialMessage,
  onSent,
  onCancel,
}: {
  initialMessage: string
  onSent: () => void
  onCancel: () => void
}) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const s = subject.trim()
    const m = message.trim()
    if (!s || !m || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: s, message: m }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : 'Ticket konnte nicht erstellt werden.',
        )
      }
      setSubmitted(true)
      toast.success('Support-Ticket erstellt')
      setTimeout(onSent, 1200)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Ticket konnte nicht erstellt werden.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 p-4 text-center text-sm text-teal-900">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100">
          <Check className="h-5 w-5 text-teal-700" />
        </div>
        <p className="font-medium">Ticket wurde erstellt</p>
        <p className="text-xs text-teal-800">Wir melden uns bald bei dir.</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"
    >
      <p className="text-xs font-medium text-muted-foreground">
        Support-Ticket erstellen
      </p>
      <div className="space-y-1">
        <label htmlFor="chat-ticket-subject" className="text-xs text-slate-600">
          Betreff
        </label>
        <Input
          id="chat-ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Worum geht es?"
          disabled={submitting}
          maxLength={200}
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="chat-ticket-message" className="text-xs text-slate-600">
          Nachricht
        </label>
        <Textarea
          id="chat-ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Beschreibe dein Anliegen..."
          className="min-h-[80px] resize-none"
          disabled={submitting}
          maxLength={2000}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          size="sm"
          className="flex-1 bg-teal-600 hover:bg-teal-700"
          disabled={!subject.trim() || !message.trim() || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Sende...
            </>
          ) : (
            'Ticket senden'
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  )
}
