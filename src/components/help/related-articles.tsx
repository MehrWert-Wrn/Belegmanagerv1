import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import type { HelpArticle } from '@/lib/help/types'

interface RelatedArticlesProps {
  topicSlug: string
  articles: HelpArticle[]
}

export function RelatedArticles({ topicSlug, articles }: RelatedArticlesProps) {
  if (articles.length === 0) return null

  return (
    <section className="mt-10" aria-labelledby="related-articles-heading">
      <h2
        id="related-articles-heading"
        className="mb-4 text-lg font-semibold text-[#08525E]"
      >
        Verwandte Artikel
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {articles.map((a) => (
          <Link
            key={a.id}
            href={`/help/${topicSlug}/${a.slug}`}
            className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-xl"
          >
            <Card className="h-full border-teal-100 transition-all group-hover:border-teal-400 group-hover:shadow-sm">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold text-[#08525E]">{a.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {a.summary}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
