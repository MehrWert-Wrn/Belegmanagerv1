'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const settingsNav = [
  { label: 'Firma', href: '/settings/firma' },
  { label: 'Zahlungsquellen', href: '/settings/zahlungsquellen' },
  { label: 'Bankverbindungen', href: '/settings/bankverbindungen' },
  { label: 'Benutzer', href: '/settings/benutzer' },
  { label: 'Abonnement', href: '/settings/abonnement' },
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        <p className="text-sm text-muted-foreground">
          Verwalte die Einstellungen deines Unternehmens
        </p>
      </div>

      <nav className="flex border-b" aria-label="Einstellungen-Navigation">
        {settingsNav.map((item) => {
          const isActive = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div>{children}</div>
    </div>
  )
}
