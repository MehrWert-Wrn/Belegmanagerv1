'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { HelpArticle } from '@/lib/help/types'

type SearchResult = HelpArticle & { topic_slug: string }

/**
 * Debounced full-text search over help articles via /api/help/search.
 */
export function HelpSearchBar() {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const q = debounced.trim()
    if (q.length < 2) {
      setResults([])
      return
    }
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/help/search?q=${encodeURIComponent(q)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: SearchResult[]) => {
        setResults(Array.isArray(data) ? data.slice(0, 8) : [])
      })
      .catch((err) => {
        if (err?.name !== 'AbortError') {
          setResults([])
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [debounced])

  const showDropdown = debounced.trim().length >= 2

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder="Hilfe durchsuchen..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Hilfe durchsuchen"
          className="pl-9 h-11 border-teal-200 focus-visible:ring-teal-500"
        />
        {loading && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-teal-600"
            aria-hidden="true"
          />
        )}
      </div>

      {showDropdown && !loading && (
        <div
          role="listbox"
          aria-label="Suchergebnisse"
          className="absolute z-20 mt-2 w-full rounded-lg border border-teal-100 bg-white shadow-lg"
        >
          {results.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              Keine Ergebnisse für <span className="font-medium">{debounced}</span>.
              <div className="mt-2">
                <Link
                  href="/support/tickets"
                  className="text-teal-700 underline-offset-2 hover:underline"
                >
                  Support kontaktieren
                </Link>
              </div>
            </div>
          ) : (
            <ul className="max-h-96 overflow-auto py-1">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/help/${r.topic_slug}/${r.slug}`}
                    className="block px-4 py-2 hover:bg-teal-50"
                    onClick={() => setQuery('')}
                  >
                    <div className="text-sm font-medium text-[#08525E]">{r.title}</div>
                    <div className="line-clamp-1 text-xs text-muted-foreground">
                      {r.summary}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
