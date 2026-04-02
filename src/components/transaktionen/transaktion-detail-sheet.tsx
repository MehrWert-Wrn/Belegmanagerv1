'use client'

import { useState } from 'react'
import { ArrowUpRight, ArrowDownLeft, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { AmpelBadge } from '@/components/transaktionen/ampel-badge'
import { MatchGrund } from '@/components/transaktionen/match-grund'
import { WorkflowStatusSection } from '@/components/transaktionen/workflow-status-section'
import { KommentareSection } from '@/components/transaktionen/kommentare-section'
import { ZuordnungsDialog } from '@/components/transaktionen/zuordnungs-dialog'
import { EigenbelegDialog } from '@/components/transaktionen/eigenbeleg-dialog'
import type { TransaktionWithRelations, WorkflowStatus } from '@/lib/supabase/types'

interface TransaktionDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaktion: TransaktionWithRelations | null
  onWorkflowStatusChange?: (transaktionId: string, newStatus: WorkflowStatus) => void
  onAssigned?: () => void
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function TransaktionDetailSheet({
  open,
  onOpenChange,
  transaktion,
  onWorkflowStatusChange,
  onAssigned,
}: TransaktionDetailSheetProps) {
  const [zuordnungsOpen, setZuordnungsOpen] = useState(false)
  const [eigenbelegOpen, setEigenbelegOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    if (!transaktion?.beleg_id) return
    setConfirming(true)
    try {
      const res = await fetch('/api/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaktion_id: transaktion.id, beleg_id: transaktion.beleg_id }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Bestätigung fehlgeschlagen')
      }
      toast.success('Beleg bestätigt')
      onAssigned?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler bei der Bestätigung')
    } finally {
      setConfirming(false)
    }
  }

  if (!transaktion) return null

  const isExpense = transaktion.betrag < 0
  const quelleName = transaktion.zahlungsquellen?.name ?? 'Unbekannt'
  const quelleTyp = transaktion.zahlungsquellen?.typ ?? 'sonstige'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {isExpense ? (
              <ArrowUpRight className="h-5 w-5 text-red-500 shrink-0" />
            ) : (
              <ArrowDownLeft className="h-5 w-5 text-teal-500 shrink-0" />
            )}
            <span
              className={`font-mono ${
                isExpense
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-teal-600 dark:text-teal-400'
              }`}
            >
              {formatCurrency(transaktion.betrag)}
            </span>
          </SheetTitle>
          <SheetDescription>
            Transaktion vom {formatDate(transaktion.datum)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Transaction info */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Transaktionsdetails</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Datum</dt>
              <dd>{formatDate(transaktion.datum)}</dd>

              <dt className="text-muted-foreground">Betrag</dt>
              <dd
                className={`font-mono ${
                  isExpense
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-teal-600 dark:text-teal-400'
                }`}
              >
                {formatCurrency(transaktion.betrag)}
              </dd>

              <dt className="text-muted-foreground">Beschreibung</dt>
              <dd className="break-words">
                {transaktion.beschreibung || '-'}
              </dd>

              <dt className="text-muted-foreground">Zahlungsquelle</dt>
              <dd>
                {quelleName}
                <span className="ml-1 text-xs text-muted-foreground">
                  ({quelleTyp})
                </span>
              </dd>

              {transaktion.iban_gegenseite && (
                <>
                  <dt className="text-muted-foreground">IBAN</dt>
                  <dd className="font-mono text-xs">
                    {transaktion.iban_gegenseite}
                  </dd>
                </>
              )}

              {transaktion.buchungsreferenz && (
                <>
                  <dt className="text-muted-foreground">Buchungsreferenz</dt>
                  <dd className="font-mono text-xs">
                    {transaktion.buchungsreferenz}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <Separator />

          {/* Match info */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Matching</h3>
              <div className="flex items-center gap-2">
                {transaktion.match_status === 'vorgeschlagen' && transaktion.beleg_id && (
                  <Button
                    size="sm"
                    onClick={handleConfirm}
                    disabled={confirming}
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {confirming ? 'Wird bestätigt…' : 'Bestätigen'}
                  </Button>
                )}
                {transaktion.match_status === 'offen' && isExpense && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEigenbelegOpen(true)}
                  >
                    Eigenbeleg erstellen
                  </Button>
                )}
                {(transaktion.match_status === 'vorgeschlagen' || transaktion.match_status === 'bestaetigt') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setZuordnungsOpen(true)}
                  >
                    Beleg ändern
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AmpelBadge
                status={transaktion.match_status}
                score={transaktion.match_score}
              />
              <MatchGrund
                matchType={
                  transaktion.match_type as Parameters<
                    typeof MatchGrund
                  >[0]['matchType']
                }
                score={transaktion.match_score}
              />
            </div>
            {(transaktion.match_status === 'vorgeschlagen' || transaktion.match_status === 'bestaetigt') && transaktion.belege && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm mt-2">
                <dt className="text-muted-foreground">Lieferant</dt>
                <dd>{transaktion.belege.lieferant ?? '-'}</dd>
                <dt className="text-muted-foreground">Rechnungsnr.</dt>
                <dd>{transaktion.belege.rechnungsnummer ?? '-'}</dd>
                <dt className="text-muted-foreground">Bruttobetrag</dt>
                <dd className="font-mono">
                  {transaktion.belege.bruttobetrag !== null
                    ? formatCurrency(transaktion.belege.bruttobetrag)
                    : '-'}
                </dd>
              </dl>
            )}
          </div>

          <Separator />

          {/* Workflow status */}
          <WorkflowStatusSection
            transaktionId={transaktion.id}
            initialStatus={transaktion.workflow_status}
            onStatusChange={(newStatus) =>
              onWorkflowStatusChange?.(transaktion.id, newStatus)
            }
          />

          <Separator />

          {/* Comments */}
          <KommentareSection transaktionId={transaktion.id} />
        </div>
      </SheetContent>
      <ZuordnungsDialog
        open={zuordnungsOpen}
        onOpenChange={setZuordnungsOpen}
        transaktion={transaktion}
        onAssigned={() => {
          setZuordnungsOpen(false)
          onAssigned?.()
        }}
      />
      {eigenbelegOpen && (
        <EigenbelegDialog
          open={eigenbelegOpen}
          onOpenChange={setEigenbelegOpen}
          transaktion={transaktion}
          onCreated={() => {
            setEigenbelegOpen(false)
            onAssigned?.()
          }}
        />
      )}
    </Sheet>
  )
}
