import { notFound } from 'next/navigation'
import { ArticleForm } from '@/components/help/admin/article-form'
import { adminGetAllTopics, adminGetArticleById } from '@/lib/help/queries'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ArtikelBearbeitenPage({ params }: PageProps) {
  const { id } = await params
  const [article, topics] = await Promise.all([
    adminGetArticleById(id),
    adminGetAllTopics(),
  ])
  if (!article) notFound()
  return <ArticleForm mode="edit" topics={topics} initial={article} />
}
