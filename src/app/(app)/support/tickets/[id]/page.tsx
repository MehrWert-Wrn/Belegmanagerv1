import { TicketVerlauf } from '@/components/support/ticket-verlauf'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <TicketVerlauf ticketId={id} />
    </div>
  )
}
