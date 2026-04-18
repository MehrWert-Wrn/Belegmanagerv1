'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

type MonatsSaldo = {
  monat: string
  einnahmen: number
  ausgaben: number
  saldo: number
}

const MONAT_NAMEN: Record<string, string> = {
  '01': 'Jän', '02': 'Feb', '03': 'Mär', '04': 'Apr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Okt', '11': 'Nov', '12': 'Dez',
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function monatLabel(monat: string): string {
  const [year, month] = monat.split('-')
  return `${MONAT_NAMEN[month] ?? month} ${year.slice(2)}`
}

export function MonatssaldoWidget() {
  const [monate, setMonate] = useState<MonatsSaldo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/monatssaldo')
      .then((r) => r.json())
      .then((d) => setMonate(d.monate ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const ytdSaldo = monate.reduce((sum, m) => sum + m.saldo, 0)
  const ytdEinnahmen = monate.reduce((sum, m) => sum + m.einnahmen, 0)
  const ytdAusgaben = monate.reduce((sum, m) => sum + m.ausgaben, 0)

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Monatliche Übersicht</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Einnahmen – Ausgaben (letzte 6 Monate)</p>
          </div>
          {!loading && monate.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Saldo gesamt</p>
              <p className={`text-lg font-bold ${ytdSaldo >= 0 ? 'text-teal-700' : 'text-rose-600'}`}>
                {fmt(ytdSaldo)}
              </p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : monate.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Noch keine Belege mit Rechnungsdatum vorhanden.
          </p>
        ) : (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg bg-teal-50 border border-teal-100 p-3">
                <p className="text-xs text-teal-600 font-medium">Einnahmen</p>
                <p className="text-base font-bold text-teal-700 mt-0.5">{fmt(ytdEinnahmen)}</p>
                <p className="text-xs text-muted-foreground">Ausgangsrechnungen</p>
              </div>
              <div className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                <p className="text-xs text-rose-600 font-medium">Ausgaben</p>
                <p className="text-base font-bold text-rose-700 mt-0.5">{fmt(ytdAusgaben)}</p>
                <p className="text-xs text-muted-foreground">Eingangsrechnungen + Eigenbelege</p>
              </div>
              <div className={`rounded-lg border p-3 ${ytdSaldo >= 0 ? 'bg-teal-50 border-teal-100' : 'bg-rose-50 border-rose-100'}`}>
                <p className={`text-xs font-medium ${ytdSaldo >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>Saldo</p>
                <p className={`text-base font-bold mt-0.5 ${ytdSaldo >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>{fmt(ytdSaldo)}</p>
                <p className="text-xs text-muted-foreground">Einnahmen – Ausgaben</p>
              </div>
            </div>

            {/* Monthly breakdown */}
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-4 gap-0 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <span>Monat</span>
                <span className="text-right">Einnahmen</span>
                <span className="text-right">Ausgaben</span>
                <span className="text-right">Saldo</span>
              </div>
              {monate.map((m, i) => {
                const isLast = i === monate.length - 1
                const Icon = m.saldo > 0 ? TrendingUp : m.saldo < 0 ? TrendingDown : Minus
                const saldoColor = m.saldo > 0 ? 'text-teal-700' : m.saldo < 0 ? 'text-rose-600' : 'text-muted-foreground'
                return (
                  <div
                    key={m.monat}
                    className={`grid grid-cols-4 gap-0 px-3 py-2 text-sm ${isLast ? '' : 'border-b'} ${isLast ? 'bg-muted/20' : ''}`}
                  >
                    <span className="font-medium text-foreground">{monatLabel(m.monat)}</span>
                    <span className="text-right text-teal-700">{m.einnahmen > 0 ? fmt(m.einnahmen) : '–'}</span>
                    <span className="text-right text-rose-600">{m.ausgaben > 0 ? fmt(m.ausgaben) : '–'}</span>
                    <span className={`text-right font-semibold flex items-center justify-end gap-1 ${saldoColor}`}>
                      <Icon className="h-3 w-3 shrink-0" />
                      {fmt(m.saldo)}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
