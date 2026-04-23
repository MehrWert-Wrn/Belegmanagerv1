'use client'

import { useEffect, useState } from 'react'
import { History, Scale, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'

interface KassaPruefung {
  id: string
  geprueft_am: string
  geprueft_von_name: string | null
  buchbestand: number
  istbestand: number
  differenz: number
  begruendung: string | null
  differenz_transaktion_id: string | null
}

interface KassenpruefungHistorieProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${d.toLocaleTimeString('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

export function KassenpruefungHistorie({
  open,
  onOpenChange,
}: KassenpruefungHistorieProps) {
  const [pruefungen, setPruefungen] = useState<KassaPruefung[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    async function fetchHistorie() {
      setLoading(true)
      setError(null)
      try {
        // TODO (Backend): Implement API route
        //   GET /api/kassabuch/kassenpruefungen
        //   Returns list of kassa_pruefungen entries (newest first), with geprueft_von_name joined from benutzer_profile
        const response = await fetch('/api/kassabuch/kassenpruefungen')
        if (!response.ok) {
          throw new Error('Prüfungshistorie konnte nicht geladen werden')
        }
        const data = await response.json()
        setPruefungen(data.pruefungen ?? [])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
        setError(message)
        toast.error(message)
      } finally {
        setLoading(false)
      }
    }

    fetchHistorie()
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-teal-600" />
            Prüfungshistorie
          </DialogTitle>
          <DialogDescription>
            Alle protokollierten Kassenprüfungen (Bargeldzählungen) dieses Mandanten.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 pt-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : pruefungen.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
            <Scale className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Noch keine Prüfungen</p>
            <p className="text-xs text-muted-foreground">
              Starten Sie Ihre erste Kassenprüfung über das Aktionen-Menü.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum / Zeit</TableHead>
                  <TableHead>Prüfer</TableHead>
                  <TableHead className="text-right">Soll</TableHead>
                  <TableHead className="text-right">Ist</TableHead>
                  <TableHead className="text-right">Differenz</TableHead>
                  <TableHead className="hidden md:table-cell">Begründung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pruefungen.map((p) => {
                  const diffNull = Number(p.differenz) === 0
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDateTime(p.geprueft_am)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.geprueft_von_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(p.buchbestand)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatCurrency(p.istbestand)}
                      </TableCell>
                      <TableCell className="text-right">
                        {diffNull ? (
                          <Badge
                            variant="outline"
                            className="gap-1 border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={`gap-1 font-mono ${
                              Number(p.differenz) > 0
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {Number(p.differenz) > 0 ? '+' : ''}
                            {formatCurrency(p.differenz)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground md:table-cell">
                        {p.begruendung ?? '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
