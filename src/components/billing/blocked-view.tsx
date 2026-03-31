'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LockKeyhole } from 'lucide-react'

export function BlockedView() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Image src="/logo-icon.svg" alt="Belegmanager" width={64} height={64} />

      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <LockKeyhole className="h-6 w-6 text-muted-foreground" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-[#08525E]">Testzeitraum abgelaufen</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Dein kostenloser Testzeitraum ist abgelaufen. Schließe ein Abonnement ab um Belegmanager weiter zu nutzen.
        </p>
      </div>

      <Button asChild className="bg-[#E50046] hover:bg-[#BA1540] text-white">
        <Link href="/settings/abonnement">Jetzt abonnieren</Link>
      </Button>
    </div>
  )
}
