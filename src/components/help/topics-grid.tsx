import { TopicCard } from './topic-card'
import type { HelpTopicWithCount } from '@/lib/help/types'

interface TopicsGridProps {
  topics: HelpTopicWithCount[]
}

export function TopicsGrid({ topics }: TopicsGridProps) {
  if (topics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/50 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aktuell sind keine Hilfe-Themen verfuegbar.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <TopicCard key={topic.id} topic={topic} />
      ))}
    </div>
  )
}
