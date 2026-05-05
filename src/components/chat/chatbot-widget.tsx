'use client'

// PROJ-23: KI-Chatbot – Floating Action Button + Panel-State
//
// Replaces the previous SupportWidget at fixed bottom-right.
// Support-ticket creation is now an escalation flow inside the chat panel.

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { ChatPanel } from './chat-panel'

export function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Chat schließen' : 'Belegmanager-Assistent öffnen'}
        aria-expanded={open}
        aria-controls="belegmanager-chatbot-panel"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full bg-teal-600 py-3 pl-4 pr-5 text-white shadow-xl transition-all hover:scale-105 hover:bg-teal-700 hover:shadow-teal-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
      >
        {open
          ? <X className="h-5 w-5 shrink-0" />
          : <MessageCircle className="h-5 w-5 shrink-0" />}
        <span className="text-sm font-semibold leading-none tracking-wide">
          {open ? 'Schließen' : 'KI-Assistent'}
        </span>
      </button>

      <div id="belegmanager-chatbot-panel">
        <ChatPanel
          open={open}
          onClose={() => setOpen(false)}
          currentPath={pathname}
        />
      </div>
    </>
  )
}
