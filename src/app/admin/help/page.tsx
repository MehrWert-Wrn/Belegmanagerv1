import { TopicsPanel } from '@/components/help/admin/topics-panel'
import { ArticlesPanel } from '@/components/help/admin/articles-panel'
import { adminGetAllArticles, adminGetAllTopics } from '@/lib/help/queries'

export const dynamic = 'force-dynamic'

export default async function AdminHelpPage() {
  const [topics, articles] = await Promise.all([
    adminGetAllTopics(),
    adminGetAllArticles(),
  ])

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[#08525E] md:text-3xl">
          Hilfe-Center verwalten
        </h1>
        <p className="text-sm text-muted-foreground">
          Themen und Artikel für das Hilfe-Center pflegen.
        </p>
      </header>

      <TopicsPanel topics={topics} />
      <ArticlesPanel topics={topics} articles={articles} />
    </div>
  )
}
