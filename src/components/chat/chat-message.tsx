'use client'

// PROJ-23: KI-Chatbot – Chat message bubble
//
// Renders a single message (user / assistant / system).
// Assistant messages support inline markdown links of the form [Title](/help/...).

import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatMessageData {
  id: string
  role: ChatRole
  content: string
  /** True while the assistant is still streaming this message */
  streaming?: boolean
}

interface ChatMessageProps {
  message: ChatMessageData
}

/**
 * Replace a small subset of markdown in assistant text:
 *  - **bold**
 *  - [Link](/href)
 * Everything else is rendered as plain text. We deliberately avoid a full
 * markdown engine to stay dependency-free.
 */
function renderAssistantContent(content: string): React.ReactNode {
  // Split on links first so we keep them as separate React nodes
  const linkRegex = /\[([^\]]+)\]\((\/[^)\s]+)\)/g
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(renderInline(content.slice(lastIndex, match.index), key++))
    }
    parts.push(
      <a
        key={`link-${key++}`}
        href={match[2]}
        className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800"
      >
        {match[1]}
      </a>,
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    parts.push(renderInline(content.slice(lastIndex), key++))
  }
  return parts
}

function renderInline(text: string, key: number): React.ReactNode {
  // Render **bold** and preserve newlines
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={`seg-${key}`} className="whitespace-pre-wrap">
      {segments.map((seg, i) => {
        if (seg.startsWith('**') && seg.endsWith('**')) {
          return (
            <strong key={i} className="font-semibold">
              {seg.slice(2, -2)}
            </strong>
          )
        }
        return <span key={i}>{seg}</span>
      })}
    </span>
  )
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { role, content, streaming } = message

  if (role === 'system') {
    return (
      <div
        role="status"
        className="my-2 rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-900"
      >
        {content}
      </div>
    )
  }

  const isUser = role === 'user'

  return (
    <div
      className={cn(
        'flex w-full gap-2',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser && (
        <div
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white"
        >
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'rounded-br-sm bg-teal-600 text-white'
            : 'rounded-bl-sm border border-slate-200 bg-white text-slate-900',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div className="break-words">
            {content.length > 0 ? (
              renderAssistantContent(content)
            ) : streaming ? (
              <TypingDots />
            ) : null}
            {streaming && content.length > 0 && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-pulse bg-teal-600"
              />
            )}
          </div>
        )}
      </div>
      {isUser && (
        <div
          aria-hidden
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700"
        >
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

function TypingDots() {
  return (
    <span
      aria-label="Der Assistent tippt"
      role="status"
      className="inline-flex items-center gap-1 py-1"
    >
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
    </span>
  )
}
