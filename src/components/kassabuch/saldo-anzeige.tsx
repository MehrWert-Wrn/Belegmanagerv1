'use client'

import { AlertTriangle, Wallet } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface SaldoAnzeigeProps {
  anfangssaldo: number
  summeEintraege: number
  aktuellerSaldo: number
  loading: boolean
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function SaldoAnzeige({
  anfangssaldo,
  summeEintraege,
  aktuellerSaldo,
  loading,
}: SaldoAnzeigeProps) {
  const isNegativ = aktuellerSaldo < 0

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-6 p-4">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="flex flex-1 flex-wrap gap-6">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-100 dark:bg-teal-950">
          <Wallet className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>

        <div className="flex flex-1 flex-wrap gap-x-8 gap-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Anfangssaldo
            </p>
            <p className="text-sm font-mono font-medium">
              {formatCurrency(anfangssaldo)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Bewegungen
            </p>
            <p
              className={`text-sm font-mono font-medium ${
                summeEintraege >= 0
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {summeEintraege >= 0 ? '+' : ''}
              {formatCurrency(summeEintraege)}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Aktueller Kassastand
            </p>
            <p
              className={`text-lg font-mono font-bold ${
                isNegativ
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-foreground'
              }`}
            >
              {formatCurrency(aktuellerSaldo)}
            </p>
          </div>
        </div>

        {isNegativ && (
          <Badge
            variant="outline"
            className="gap-1.5 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Negativer Saldo
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
