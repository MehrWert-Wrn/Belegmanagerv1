import { AdminTicketDetail } from '@/components/admin/ticket-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminTicketDetailPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <AdminTicketDetail ticketId={id} />
    </div>
  )
}
