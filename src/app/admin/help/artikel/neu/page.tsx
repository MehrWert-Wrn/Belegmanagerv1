import { ArticleForm } from '@/components/help/admin/article-form'
import { adminGetAllTopics } from '@/lib/help/queries'

export const dynamic = 'force-dynamic'

export default async function NeuerArtikelPage() {
  const topics = await adminGetAllTopics()
  return <ArticleForm mode="create" topics={topics} />
}
