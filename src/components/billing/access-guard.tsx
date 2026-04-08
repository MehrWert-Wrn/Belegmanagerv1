'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface AccessGuardProps {
  hasAccess: boolean
  children: React.ReactNode
}

export function AccessGuard({ hasAccess, children }: AccessGuardProps) {
  const router = useRouter()

  if (hasAccess) return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Abonnement erforderlich</h1>
        <p className="text-muted-foreground max-w-md">
          Dein Zugang ist abgelaufen. Bitte abonniere Belegmanager Pro, um weiterzumachen.
        </p>
      </div>
      <Button onClick={() => router.push('/settings/abonnement')}>
        Abonnement verwalten
      </Button>
    </div>
  )
}
