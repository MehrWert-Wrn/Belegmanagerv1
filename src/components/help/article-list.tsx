import Link from 'next/link'
import { Clock, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import type { HelpArticle } from '@/lib/help/types'

interface ArticleListProps {
  topicSlug: string
  articles: HelpArticle[]
}

export function ArticleList({ topicSlug, articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          In diesem Thema gibt es noch keine veroeffentlichten Artikel.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {articles.map((article) => (
        <li key={article.id}>
          <Link
            href={`/help/${topicSlug}/${article.slug}`}
            className="group block focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-xl"
          >
            <Card className="border-teal-100 transition-all group-hover:border-teal-400 group-hover:shadow-sm">
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-[#08525E]">
                    {article.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{article.summary}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-teal-700">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    <span>{article.read_time_minutes} Min. Lesezeit</span>
                  </div>
                </div>
                <ChevronRight
                  className="mt-1 h-5 w-5 shrink-0 text-teal-500 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </CardContent>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
