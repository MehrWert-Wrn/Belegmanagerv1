import { MandantenTabelle } from '@/components/admin/mandanten-tabelle'

export default function AdminMandantenPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mandanten</h1>
        <p className="text-sm text-muted-foreground">
          Alle registrierten Mandanten und deren Abo-Status.
        </p>
      </div>

      <MandantenTabelle />
    </div>
  )
}
