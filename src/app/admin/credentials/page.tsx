import { CredentialsTabelle } from '@/components/admin/credentials-tabelle'

export default function AdminCredentialsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Zugangsdaten</h1>
        <p className="text-sm text-muted-foreground">
          E-Mail-Zugangsdaten der Mandanten verwalten, einrichten und nach Einrichtung loeschen.
        </p>
      </div>

      <CredentialsTabelle />
    </div>
  )
}
