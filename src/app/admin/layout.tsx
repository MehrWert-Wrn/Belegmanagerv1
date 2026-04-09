import { requireAdmin } from '@/components/admin/admin-guard'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await requireAdmin()

  return (
    <AdminSidebar userEmail={user.email ?? ''}>
      {children}
    </AdminSidebar>
  )
}
