import { getTopicsWithCounts } from '@/lib/help/queries'
import { HelpSearchBar } from '@/components/help/help-search-bar'
import { TopicsGrid } from '@/components/help/topics-grid'

export const revalidate = 60

export default async function HelpIndexPage() {
  const topics = await getTopicsWithCounts()

  return (
    <div className="flex flex-col gap-8 p-4 md:p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-[#08525E] md:text-3xl">
          Hilfe-Center
        </h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Alles, was du zum Belegmanager wissen musst – Schritt für Schritt erklärt.
        </p>
      </header>

      <div className="max-w-2xl">
        <HelpSearchBar />
      </div>

      <section aria-labelledby="topics-heading">
        <h2 id="topics-heading" className="sr-only">
          Themen
        </h2>
        <TopicsGrid topics={topics} />
      </section>
    </div>
  )
}
