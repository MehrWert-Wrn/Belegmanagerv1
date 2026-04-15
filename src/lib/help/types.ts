// PROJ-22: Hilfe-Center – Types

export type HelpArticleStatus = 'draft' | 'published'

export interface HelpTopic {
  id: string
  title: string
  slug: string
  description: string
  icon: string // Lucide icon name, e.g. 'Rocket'
  sort_order: number
  created_at: string
}

export interface HelpArticle {
  id: string
  topic_id: string
  title: string
  slug: string
  summary: string
  content_html: string
  status: HelpArticleStatus
  video_url: string | null
  video_storage_path: string | null
  sort_order: number
  read_time_minutes: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface HelpArticleFeedback {
  id: string
  article_id: string
  user_id: string | null
  rating: 'helpful' | 'not_helpful'
  created_at: string
}

export interface HelpTopicWithArticles extends HelpTopic {
  articles: HelpArticle[]
}

export interface HelpTopicWithCount extends HelpTopic {
  article_count: number
}
