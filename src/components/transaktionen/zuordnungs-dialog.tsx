'use client'

import { useState, useEffect, useMemo } from 'react'
import { Search, FileText, AlertTriangle, CalendarDays, Hash, Building2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert'
import type { TransaktionWithRelations, Beleg } from '@/lib/supabase/types'

interface ZuordnungsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaktion: TransaktionWithRelations | null
  onAssigned: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ZuordnungsDialog({
  open,
  onOpenChange,
  transaktion,
  onAssigned,
}: ZuordnungsDialogProps) {
  const [belege, setBelege] = useState<Beleg[]>([])
  const [loadingBelege, setLoadingBelege] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBelegId, setSelectedBelegId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch unmatched belege when dialog opens
  useEffect(() => {
    if (!open || !transaktion) return
    setSearchQuery('')
    setSelectedBelegId(null)

    async function fetchBelege() {
      setLoadingBelege(true)
      try {
        const response = await fetch('/api/belege?status=offen')
        if (!response.ok) throw new Error('Belege konnten nicht geladen werden.')
        const data = await response.json()
        setBelege(data)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Fehler beim Laden der Belege')
        setBelege([])
      } finally {
        setLoadingBelege(false)
      }
    }

    fetchBelege()
  }, [open, transaktion])

  // Client-side search filtering (< 500 docs, < 300ms)
  const filteredBelege = useMemo(() => {
    if (!searchQuery.trim()) return belege

    const query = searchQuery.toLowerCase().trim()
    return belege.filter((b) => {
      const lieferant = (b.lieferant ?? '').toLowerCase()
      const rechnungsnummer = (b.rechnungsnummer ?? '').toLowerCase()
      const betrag = b.bruttobetrag?.toString() ?? ''
      const datum = b.rechnungsdatum ?? ''

      return (
        lieferant.includes(query) ||
        rechnungsnummer.includes(query) ||
        betrag.includes(query) ||
        datum.includes(query)
      )
    })
  }, [belege, searchQuery])

  const selectedBeleg = useMemo(
    () => belege.find((b) => b.id === selectedBelegId) ?? null,
    [belege, selectedBelegId]
  )

  // Warnings
  const warnings: string[] = useMemo(() => {
    if (!transaktion || !selectedBeleg) return []

    const w: string[] = []

    // Amount mismatch warning
    if (selectedBeleg.bruttobetrag !== null) {
      const transaktionAbs = Math.abs(transaktion.betrag)
      const diff = Math.abs(transaktionAbs - selectedBeleg.bruttobetrag)
      const pct = selectedBeleg.bruttobetrag > 0 ? diff / selectedBeleg.bruttobetrag : 0
      if (pct >= 0.1) {
        w.push(
          `Betragsabweichung: Transaktion ${formatCurrency(transaktionAbs)} vs. Beleg ${formatCurrency(selectedBeleg.bruttobetrag)} (${Math.round(pct * 100)}% Differenz)`
        )
      }
    }

    // Missing amount on beleg
    if (selectedBeleg.bruttobetrag === null) {
      w.push('Der Beleg hat keinen Betrag hinterlegt.')
    }

    // Cross-month warning
    if (selectedBeleg.rechnungsdatum && transaktion.datum) {
      const tMonth = transaktion.datum.substring(0, 7)
      const bMonth = selectedBeleg.rechnungsdatum.substring(0, 7)
      if (tMonth !== bMonth) {
        w.push(
          `Monatsabweichung: Transaktion (${tMonth}) und Beleg (${bMonth}) stammen aus unterschiedlichen Monaten.`
        )
      }
    }

    return w
  }, [transaktion, selectedBeleg])

  async function handleAssign() {
    if (!transaktion || !selectedBelegId) return

    setSubmitting(true)
    try {
      const response = await fetch(`/api/transaktionen/${transaktion.id}/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beleg_id: selectedBelegId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Zuordnung fehlgeschlagen')
      }

      toast.success('Beleg erfolgreich zugeordnet')
      onOpenChange(false)
      onAssigned()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler bei der Zuordnung')
    } finally {
      setSubmitting(false)
    }
  }

  if (!transaktion) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Beleg manuell zuordnen</DialogTitle>
          <DialogDescription>
            Waehlen Sie einen Beleg fuer diese Transaktion aus.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden md:flex-row">
          {/* Left: Transaction details */}
          <div className="shrink-0 space-y-3 rounded-lg border bg-muted/30 p-4 md:w-[260px]">
            <h3 className="text-sm font-semibold">Transaktion</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Datum:</span>
                <span className="font-medium">{formatDate(transaktion.datum)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Betrag:</span>
                <span
                  className={`font-mono font-medium ${
                    transaktion.betrag < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-teal-600 dark:text-teal-400'
                  }`}
                >
                  {formatCurrency(transaktion.betrag)}
                </span>
              </div>
              {transaktion.beschreibung && (
                <div className="flex items-start gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">Beschreibung:</span>
                    <p className="font-medium break-words">
                      {transaktion.beschreibung}
                    </p>
                  </div>
                </div>
              )}
              {transaktion.iban_gegenseite && (
                <div className="flex items-start gap-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">IBAN:</span>
                    <p className="font-mono text-xs break-all">
                      {transaktion.iban_gegenseite}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Beleg search + list */}
          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Lieferant, Rechnungsnr., Betrag, Datum..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
                aria-label="Belege durchsuchen"
              />
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-[350px]">
              {loadingBelege ? (
                <div className="space-y-2 p-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              ) : filteredBelege.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {belege.length === 0
                      ? 'Keine offenen Belege vorhanden.'
                      : 'Keine Belege gefunden.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 p-1">
                  {filteredBelege.map((beleg) => {
                    const isSelected = selectedBelegId === beleg.id
                    const amountDiff =
                      beleg.bruttobetrag !== null
                        ? Math.abs(Math.abs(transaktion.betrag) - beleg.bruttobetrag)
                        : null
                    const hasAmountWarning =
                      amountDiff !== null &&
                      beleg.bruttobetrag !== null &&
                      beleg.bruttobetrag > 0 &&
                      amountDiff / beleg.bruttobetrag >= 0.1

                    return (
                      <button
                        key={beleg.id}
                        type="button"
                        onClick={() => setSelectedBelegId(isSelected ? null : beleg.id)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border'
                        }`}
                        aria-pressed={isSelected}
                        aria-label={`Beleg ${beleg.lieferant ?? 'Unbekannt'} ${beleg.rechnungsnummer ?? ''} auswaehlen`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium text-sm truncate">
                              {beleg.lieferant ?? 'Unbekannter Lieferant'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasAmountWarning && (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 text-xs">
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                Abweichung
                              </Badge>
                            )}
                            {beleg.bruttobetrag !== null && (
                              <span className="font-mono text-sm font-medium">
                                {formatCurrency(beleg.bruttobetrag)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {beleg.rechnungsnummer && (
                            <span>RN: {beleg.rechnungsnummer}</span>
                          )}
                          {beleg.rechnungsdatum && (
                            <span>{formatDate(beleg.rechnungsdatum)}</span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            <Separator />
            {warnings.map((warning, i) => (
              <Alert key={i} variant="destructive" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 [&>svg]:text-amber-600">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  {warning}
                </AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedBelegId || submitting}
          >
            {submitting ? 'Wird zugeordnet...' : 'Beleg zuordnen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
