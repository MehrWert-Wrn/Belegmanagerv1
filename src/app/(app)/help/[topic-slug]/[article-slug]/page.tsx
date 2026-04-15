import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Clock } from 'lucide-react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { VideoEmbed } from '@/components/help/video-embed'
import { ArticleFeedback } from '@/components/help/article-feedback'
import { RelatedArticles } from '@/components/help/related-articles'
import {
  getArticleBySlugs,
  getRelatedArticlesServer,
} from '@/lib/help/queries'
import { sanitizeForRender } from '@/lib/help/sanitize'

export const revalidate = 60

interface PageProps {
  params: Promise<{ 'topic-slug': string; 'article-slug': string }>
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { 'topic-slug': topicSlug, 'article-slug': articleSlug } = await params
  const result = await getArticleBySlugs(topicSlug, articleSlug)

  if (!result) {
    notFound()
  }

  const { topic, article } = result
  const related = await getRelatedArticlesServer(article)

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/help">Hilfe</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/help/${topic.slug}`}>{topic.title}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1">{article.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <article className="max-w-3xl">
        <header className="border-b border-teal-100 pb-4">
          <h1 className="text-2xl font-bold tracking-tight text-[#08525E] md:text-3xl">
            {article.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {article.summary}
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-teal-700">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{article.read_time_minutes} Min. Lesezeit</span>
          </div>
        </header>

        <VideoEmbed
          url={article.video_url}
          storagePath={article.video_storage_path}
          title={article.title}
        />

        <div
          className="help-article-content mt-6 text-sm leading-relaxed text-foreground md:text-base [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[#08525E] [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-[#08525E] [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mt-1 [&_a]:text-teal-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-teal-50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-teal-800 [&_pre]:mt-4 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-4 [&_pre]:text-xs [&_pre]:text-slate-100"
          // Bug-002 fix: defense-in-depth – auch beim Rendern sanitizen,
          // falls content_html direkt via DB-Zugang ohne API gesetzt wurde.
          dangerouslySetInnerHTML={{ __html: sanitizeForRender(article.content_html ?? '') }}
        />

        <ArticleFeedback articleId={article.id} />
        <RelatedArticles topicSlug={topic.slug} articles={related} />
      </article>
    </div>
  )
}
