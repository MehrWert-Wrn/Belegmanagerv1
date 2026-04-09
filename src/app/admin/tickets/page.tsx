import { TicketsTabelle } from '@/components/admin/tickets-tabelle'

export default function AdminTicketsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Support-Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Alle Tickets aller Mandanten verwalten und beantworten.
        </p>
      </div>

      <TicketsTabelle />
    </div>
  )
}
