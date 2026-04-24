'use client'

import { useState, useEffect } from 'react'
import {
  ArrowUpRight, ArrowDownLeft, CheckCircle2, Link2, EyeOff,
  Eye, X, FileQuestion, ExternalLink, Loader2,
} from 'lucide-react'
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
import { cn } from '@/lib/utils'

type BelegVorschauDaten = {
  id: string
  lieferant: string | null
  rechnungsnummer: string | null
  rechnungsname: string | null
  rechnungstyp: string | null
  bruttobetrag: number | null
  rechnungsdatum: string | null
  storage_path: string | null
  dateityp: string | null
  original_filename: string | null
}

interface TransaktionDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  transaktion: TransaktionWithRelations | null
  isEar?: boolean
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
  isEar = false,
  onWorkflowStatusChange,
  onAssigned,
}: TransaktionDetailSheetProps) {
  const [zuordnungsOpen, setZuordnungsOpen] = useState(false)
  const [eigenbelegOpen, setEigenbelegOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [markingPrivat, setMarkingPrivat] = useState(false)

  // Beleg preview panel state
  const [belegPanelOpen, setBelegPanelOpen] = useState(false)
  const [belegDaten, setBelegDaten] = useState<BelegVorschauDaten | null>(null)
  const [belegUrl, setBelegUrl] = useState<string | null>(null)
  const [belegLaedt, setBelegLaedt] = useState(false)

  // Reset beleg panel when sheet closes or transaktion changes
  useEffect(() => {
    if (!open) {
      setBelegPanelOpen(false)
      setBelegDaten(null)
      setBelegUrl(null)
    }
  }, [open])

  useEffect(() => {
    setBelegPanelOpen(false)
    setBelegDaten(null)
    setBelegUrl(null)
  }, [transaktion?.id])

  async function handleOpenBelegPanel() {
    if (!transaktion?.beleg_id) return
    if (belegPanelOpen) {
      setBelegPanelOpen(false)
      return
    }
    setBelegPanelOpen(true)
    if (belegDaten?.id === transaktion.beleg_id) return // already loaded

    setBelegLaedt(true)
    setBelegDaten(null)
    setBelegUrl(null)
    try {
      const [belegRes, urlRes] = await Promise.all([
        fetch(`/api/belege/${transaktion.beleg_id}`),
        fetch(`/api/belege/${transaktion.beleg_id}/signed-url`),
      ])
      if (belegRes.ok) {
        const data = await belegRes.json()
        setBelegDaten(data)
      }
      if (urlRes.ok) {
        const { url } = await urlRes.json()
        setBelegUrl(url ?? null)
      }
    } catch {
      // silently fail – panel shows placeholder
    } finally {
      setBelegLaedt(false)
    }
  }

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

  async function handleMarkPrivat() {
    if (!transaktion) return
    setMarkingPrivat(true)
    try {
      const res = await fetch(`/api/transaktionen/${transaktion.id}/workflow-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_status: 'privat' }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Speichern fehlgeschlagen')
      }
      toast.success('Als Privatausgabe markiert')
      onWorkflowStatusChange?.(transaktion.id, 'privat')
      onAssigned?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setMarkingPrivat(false)
    }
  }

  if (!transaktion) return null

  const isExpense = transaktion.betrag < 0
  const quelleName = transaktion.zahlungsquellen?.name ?? 'Unbekannt'
  const quelleTyp = transaktion.zahlungsquellen?.typ ?? 'sonstige'
  const hasBelegAttached =
    (transaktion.match_status === 'bestaetigt' || transaktion.match_status === 'vorgeschlagen') &&
    !!transaktion.beleg_id

  const fileExt = belegDaten?.original_filename?.split('.').pop()?.toLowerCase() ?? ''
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const isImage = imageExts.includes(belegDaten?.dateityp ?? '') || imageExts.includes(fileExt)
  const isPdf = !isImage && (belegDaten?.dateityp === 'pdf' || fileExt === 'pdf')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          'w-full overflow-hidden p-0 transition-[max-width] duration-300 ease-in-out',
          belegPanelOpen ? 'sm:max-w-[860px]' : 'sm:max-w-md',
        )}
      >
        <div className="flex h-full">
          {/* ── Beleg Vorschau Panel (links) ── */}
          <div
            className={cn(
              'flex flex-col border-r bg-muted/20 overflow-hidden transition-[width,min-width] duration-300 ease-in-out',
              belegPanelOpen ? 'w-[420px] min-w-[420px]' : 'w-0 min-w-0',
            )}
          >
            {belegPanelOpen && (
              <>
                {/* Panel Header */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b bg-background shrink-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {belegDaten?.rechnungsname ?? belegDaten?.original_filename ?? 'Beleg'}
                    </p>
                    {belegDaten?.original_filename && belegDaten.rechnungsname && (
                      <p className="text-xs text-muted-foreground truncate">
                        {belegDaten.original_filename}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {belegUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => window.open(belegUrl, '_blank', 'noopener,noreferrer')}
                        title="In neuem Tab öffnen"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setBelegPanelOpen(false)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* File Preview */}
                <div className="flex-1 overflow-hidden relative bg-muted/30">
                  {belegLaedt ? (
                    <div className="flex h-full items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : !belegDaten?.storage_path || !belegUrl ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <FileQuestion className="h-10 w-10" />
                      <p className="text-sm">Kein Dokument vorhanden</p>
                    </div>
                  ) : isPdf ? (
                    <iframe
                      src={belegUrl}
                      className="h-full w-full border-0"
                      title="Beleg Vorschau"
                    />
                  ) : isImage ? (
                    <div className="flex h-full items-center justify-center overflow-auto p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={belegUrl}
                        alt="Beleg"
                        className="max-h-full max-w-full object-contain rounded"
                      />
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                      <FileQuestion className="h-10 w-10" />
                      <p className="text-sm">Vorschau nicht verfügbar</p>
                      {belegUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(belegUrl, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Öffnen
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Beleg Metadata Footer */}
                {belegDaten && (
                  <div className="shrink-0 border-t bg-background px-4 py-3">
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {belegDaten.lieferant && (
                        <>
                          <dt className="text-muted-foreground">Lieferant</dt>
                          <dd className="truncate font-medium">{belegDaten.lieferant}</dd>
                        </>
                      )}
                      {belegDaten.rechnungsnummer && (
                        <>
                          <dt className="text-muted-foreground">Rechnungsnr.</dt>
                          <dd className="font-mono truncate">{belegDaten.rechnungsnummer}</dd>
                        </>
                      )}
                      {belegDaten.bruttobetrag !== null && (
                        <>
                          <dt className="text-muted-foreground">Bruttobetrag</dt>
                          <dd className="font-mono">{formatCurrency(belegDaten.bruttobetrag)}</dd>
                        </>
                      )}
                      {belegDaten.rechnungsdatum && (
                        <>
                          <dt className="text-muted-foreground">Rechnungsdatum</dt>
                          <dd>{formatDate(belegDaten.rechnungsdatum)}</dd>
                        </>
                      )}
                    </dl>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Transaktionsdetails (rechts) ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {isExpense ? (
                    <ArrowUpRight className="h-5 w-5 text-red-500 shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-5 w-5 text-teal-500 shrink-0" />
                  )}
                  <span
                    className={cn(
                      'font-mono',
                      isExpense
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-teal-600 dark:text-teal-400',
                    )}
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
                      className={cn(
                        'font-mono',
                        isExpense
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-teal-600 dark:text-teal-400',
                      )}
                    >
                      {formatCurrency(transaktion.betrag)}
                    </dd>

                    <dt className="text-muted-foreground">Beschreibung</dt>
                    <dd className="break-words">{transaktion.beschreibung || '-'}</dd>

                    <dt className="text-muted-foreground">Zahlungsquelle</dt>
                    <dd>
                      {quelleName}
                      <span className="ml-1 text-xs text-muted-foreground">({quelleTyp})</span>
                    </dd>

                    {transaktion.iban_gegenseite && (
                      <>
                        <dt className="text-muted-foreground">IBAN</dt>
                        <dd className="font-mono text-xs">{transaktion.iban_gegenseite}</dd>
                      </>
                    )}

                    {transaktion.buchungsreferenz && (
                      <>
                        <dt className="text-muted-foreground">Buchungsreferenz</dt>
                        <dd className="font-mono text-xs">{transaktion.buchungsreferenz}</dd>
                      </>
                    )}

                    {transaktion.buchungsnummer && (
                      <>
                        <dt className="text-muted-foreground">Buchungsnummer</dt>
                        <dd className="font-mono text-xs font-medium text-teal-700 dark:text-teal-400">
                          {transaktion.buchungsnummer}
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
                  </div>
                  <div className="flex items-center gap-3">
                    <AmpelBadge
                      status={transaktion.match_status}
                      score={transaktion.match_score}
                    />
                    <MatchGrund
                      matchType={
                        transaktion.match_type as Parameters<typeof MatchGrund>[0]['matchType']
                      }
                      score={transaktion.match_score}
                    />
                  </div>

                  {(transaktion.match_status === 'vorgeschlagen' ||
                    transaktion.match_status === 'bestaetigt') &&
                    transaktion.belege && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
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
                        {hasBelegAttached && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-1.5 mt-1"
                            onClick={handleOpenBelegPanel}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            {belegPanelOpen ? 'Beleg ausblenden' : 'Beleg ansehen'}
                          </Button>
                        )}
                      </div>
                    )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {transaktion.match_status === 'offen' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZuordnungsOpen(true)}
                        className="gap-1.5"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        Manuell zuordnen
                      </Button>
                    )}
                    {(transaktion.match_status === 'vorgeschlagen' ||
                      transaktion.match_status === 'bestaetigt') && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setZuordnungsOpen(true)}
                      >
                        Beleg ändern
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
                    {isEar &&
                      transaktion.match_status === 'offen' &&
                      isExpense &&
                      transaktion.workflow_status !== 'privat' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleMarkPrivat}
                          disabled={markingPrivat}
                          className="gap-1.5"
                        >
                          <EyeOff className="h-3.5 w-3.5 text-purple-500" />
                          {markingPrivat ? 'Wird markiert…' : 'Als Privatausgabe'}
                        </Button>
                      )}
                  </div>
                </div>

                <Separator />

                {/* Workflow status */}
                <WorkflowStatusSection
                  transaktionId={transaktion.id}
                  initialStatus={transaktion.workflow_status}
                  isEar={isEar}
                  onStatusChange={(newStatus) =>
                    onWorkflowStatusChange?.(transaktion.id, newStatus)
                  }
                />

                <Separator />

                {/* Comments */}
                <KommentareSection transaktionId={transaktion.id} />
              </div>
            </div>
          </div>
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
