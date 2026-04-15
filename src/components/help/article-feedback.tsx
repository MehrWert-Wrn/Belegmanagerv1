'use client'

import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ArticleFeedbackProps {
  articleId: string
}

/**
 * Feedback-Buttons "War dieser Artikel hilfreich?".
 * TODO(PROJ-22): POST /api/help/articles/[id]/feedback once backend is live.
 */
export function ArticleFeedback({ articleId }: ArticleFeedbackProps) {
  const [rating, setRating] = useState<'helpful' | 'not_helpful' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [error, setError] = useState<string | null>(null)

  async function submit(value: 'helpful' | 'not_helpful') {
    if (rating || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/help/articles/${articleId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Feedback konnte nicht gespeichert werden.')
      }
      setRating(value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  if (rating) {
    return (
      <div className="mt-10 rounded-xl border border-teal-100 bg-teal-50/50 p-5 text-center">
        <p className="text-sm text-[#08525E]">
          Danke für dein Feedback! Das hilft uns, die Hilfe-Inhalte zu verbessern.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-xl border border-teal-100 bg-teal-50/50 p-5">
      <p className="mb-3 text-center text-sm font-medium text-[#08525E]">
        War dieser Artikel hilfreich?
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => submit('helpful')}
          aria-label="Hilfreich"
          className="border-teal-200 hover:bg-teal-100 hover:text-teal-800"
          data-article-id={articleId}
        >
          <ThumbsUp className="mr-2 h-4 w-4" />
          Ja
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={submitting}
          onClick={() => submit('not_helpful')}
          aria-label="Nicht hilfreich"
          className="border-teal-200 hover:bg-teal-100 hover:text-teal-800"
        >
          <ThumbsDown className="mr-2 h-4 w-4" />
          Nein
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-center text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
