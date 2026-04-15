import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { HelpSearchBar } from '@/components/help/help-search-bar'
import { ArticleList } from '@/components/help/article-list'
import { LucideIcon } from '@/components/help/lucide-icon'
import { getTopicBySlugWithArticles } from '@/lib/help/queries'

export const revalidate = 60

interface PageProps {
  params: Promise<{ 'topic-slug': string }>
}

export default async function HelpTopicPage({ params }: PageProps) {
  const { 'topic-slug': topicSlug } = await params
  const topic = await getTopicBySlugWithArticles(topicSlug)

  if (!topic) {
    notFound()
  }

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
            <BreadcrumbPage>{topic.title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <LucideIcon name={topic.icon} className="h-6 w-6" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-[#08525E] md:text-3xl">
            {topic.title}
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">{topic.description}</p>
        </div>
      </header>

      <div className="max-w-2xl">
        <HelpSearchBar />
      </div>

      <ArticleList topicSlug={topic.slug} articles={topic.articles} />
    </div>
  )
}
