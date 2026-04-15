import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LucideIcon } from './lucide-icon'
import type { HelpTopicWithCount } from '@/lib/help/types'

interface TopicCardProps {
  topic: HelpTopicWithCount
}

export function TopicCard({ topic }: TopicCardProps) {
  return (
    <Link
      href={`/help/${topic.slug}`}
      className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-xl"
      aria-label={`Thema ${topic.title} oeffnen`}
    >
      <Card className="h-full border-teal-100 transition-all group-hover:border-teal-400 group-hover:shadow-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
            <LucideIcon name={topic.icon} className="h-5 w-5" />
          </div>
          <CardTitle className="text-lg text-[#08525E]">{topic.title}</CardTitle>
          <CardDescription>{topic.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs font-medium text-teal-700">
            {topic.article_count} {topic.article_count === 1 ? 'Artikel' : 'Artikel'}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
