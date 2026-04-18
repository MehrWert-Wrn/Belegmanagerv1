'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

type UeberfaelligerBeleg = {
  id: string
  lieferant: string | null
  rechnungsnummer: string | null
  bruttobetrag: number | null
  faelligkeitsdatum: string
  rechnungstyp: string
}

function tageUeberfaellig(datum: string): number {
  const diff = new Date().getTime() - new Date(datum).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function fmt(n: number): string {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(n)
}

function UeberfaelligBadge({ tage }: { tage: number }) {
  if (tage > 30) {
    return <Badge variant="destructive" className="text-xs shrink-0">{tage}d überfällig</Badge>
  }
  return (
    <Badge className="text-xs shrink-0 bg-orange-100 text-orange-700 border border-orange-200 hover:bg-orange-100">
      {tage}d überfällig
    </Badge>
  )
}

function typLabel(typ: string): string {
  if (typ === 'eingangsrechnung') return 'Eingangsrechnung'
  if (typ === 'eigenbeleg') return 'Eigenbeleg'
  if (typ === 'ausgangsrechnung') return 'Ausgangsrechnung'
  return typ
}

export function UeberfaelligeBelegeWidget() {
  const [belege, setBelege] = useState<UeberfaelligerBeleg[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/ueberfaellige-belege')
      .then((r) => r.json())
      .then((d) => setBelege(d.belege ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card className="col-span-full lg:col-span-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <CardTitle className="text-base font-semibold">Überfällige Belege</CardTitle>
          </div>
          {!loading && belege.length > 0 && (
            <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
              {belege.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : belege.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="h-8 w-8 rounded-full bg-teal-50 flex items-center justify-center mb-2">
              <AlertTriangle className="h-4 w-4 text-teal-400" />
            </div>
            <p className="text-sm text-muted-foreground">Keine überfälligen Belege</p>
          </div>
        ) : (
          <div className="space-y-2">
            {belege.map((b) => {
              const tage = tageUeberfaellig(b.faelligkeitsdatum)
              return (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-2 rounded-md border px-3 py-2 hover:bg-muted/30 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {b.lieferant ?? '(kein Lieferant)'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {typLabel(b.rechnungstyp)}
                      {b.rechnungsnummer ? ` · ${b.rechnungsnummer}` : ''}
                      {' · '}
                      {new Date(b.faelligkeitsdatum).toLocaleDateString('de-AT')}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-sm font-semibold text-rose-600">
                      {b.bruttobetrag != null ? fmt(b.bruttobetrag) : '–'}
                    </span>
                    <UeberfaelligBadge tage={tage} />
                  </div>
                </div>
              )
            })}
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs text-muted-foreground" asChild>
              <Link href="/belege">
                Alle Belege anzeigen <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
