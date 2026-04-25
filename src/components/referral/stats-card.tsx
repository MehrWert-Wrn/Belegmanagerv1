import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Gift, Calendar, Euro } from 'lucide-react'

export interface ReferralStats {
  total_referrals: number
  active_rewards: number
  saved_months: number
  saved_euros: number
}

interface StatsCardProps {
  stats: ReferralStats | null
  loading?: boolean
}

function fmtEuro(n: number): string {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

export function StatsCard({ stats, loading = false }: StatsCardProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-teal-100">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-7 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const items = [
    {
      label: 'Gesamt-Empfehlungen',
      value: stats?.total_referrals ?? 0,
      icon: Users,
      color: 'text-teal-600',
      bg: 'bg-teal-50',
      border: 'border-teal-100',
    },
    {
      label: 'Aktive Belohnungen',
      value: stats?.active_rewards ?? 0,
      icon: Gift,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-100',
    },
    {
      label: 'Gesparte Monate',
      value: stats?.saved_months ?? 0,
      icon: Calendar,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-100',
    },
    {
      label: 'Gespartes Geld',
      value: fmtEuro(stats?.saved_euros ?? 0),
      icon: Euro,
      color: 'text-teal-700',
      bg: 'bg-teal-50',
      border: 'border-teal-100',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Card key={item.label} className={`${item.border}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                <div className={`rounded-md ${item.bg} p-1.5`}>
                  <Icon className={`h-3.5 w-3.5 ${item.color}`} aria-hidden="true" />
                </div>
              </div>
              <p className={`mt-2 text-2xl font-bold ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
