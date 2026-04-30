'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Link2,
  Ban,
  X,
  FileQuestion,
  ExternalLink,
  Loader2,
  Eye,
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
import { KommentareSection } from '@/components/transaktionen/kommentare-section'
import { ZuordnungsDialog } from '@/components/transaktionen/zuordnungs-dialog'
import type { KassaEintrag } from './kassabuch-tabelle'
import type { TransaktionWithRelations } from '@/lib/supabase/types'
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

interface KassaEintragDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eintrag: KassaEintrag | null
  initialBelegPanelOpen?: boolean
  onActionComplete?: () => void
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

export function KassaEintragDetailSheet({
  open,
  onOpenChange,
  eintrag,
  initialBelegPanelOpen = false,
  onActionComplete,
}: KassaEintragDetailSheetProps) {
  const [zuordnungsOpen, setZuordnungsOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const [belegPanelOpen, setBelegPanelOpen] = useState(false)
  const [belegDaten, setBelegDaten] = useState<BelegVorschauDaten | null>(null)
  const [belegUrl, setBelegUrl] = useState<string | null>(null)
  const [belegLaedt, setBelegLaedt] = useState(false)

  const wasOpenRef = useRef(false)

  // Reset when sheet closes
  useEffect(() => {
    if (!open) {
      setBelegPanelOpen(false)
      setBelegDaten(null)
      setBelegUrl(null)
    }
  }, [open])

  // Reset beleg panel when eintrag changes
  useEffect(() => {
    setBelegPanelOpen(false)
    setBelegDaten(null)
    setBelegUrl(null)
  }, [eintrag?.id])

  // Auto-open beleg panel when sheet first opens with initialBelegPanelOpen=true
  useEffect(() => {
    if (open && !wasOpenRef.current && initialBelegPanelOpen && eintrag?.beleg_id) {
      openBelegPanel(eintrag.beleg_id)
    }
    wasOpenRef.current = open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function openBelegPanel(belegId: string) {
    setBelegPanelOpen(true)
    setBelegLaedt(true)
    setBelegDaten(null)
    setBelegUrl(null)
    try {
      const [belegRes, urlRes] = await Promise.all([
        fetch(`/api/belege/${belegId}`),
        fetch(`/api/belege/${belegId}/signed-url`),
      ])
      if (belegRes.ok) setBelegDaten(await belegRes.json())
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

  async function handleToggleBelegPanel() {
    if (!eintrag?.beleg_id) return
    if (belegPanelOpen) {
      setBelegPanelOpen(false)
      return
    }
    if (belegDaten?.id === eintrag.beleg_id) {
      setBelegPanelOpen(true)
      return
    }
    await openBelegPanel(eintrag.beleg_id)
  }

  async function handleConfirm() {
    if (!eintrag?.beleg_id) return
    setConfirming(true)
    try {
      const res = await fetch('/api/matching/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaktion_id: eintrag.id, beleg_id: eintrag.beleg_id }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Bestätigung fehlgeschlagen')
      }
      toast.success('Beleg bestätigt')
      onActionComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler bei der Bestätigung')
    } finally {
      setConfirming(false)
    }
  }

  if (!eintrag) return null

  const isExpense = eintrag.betrag < 0
  const isStorno = eintrag.kassa_buchungstyp === 'STORNO'
  const isStorniert = eintrag.ist_storniert
  const hasBelegAttached =
    (eintrag.match_status === 'bestaetigt' || eintrag.match_status === 'vorgeschlagen') &&
    !!eintrag.beleg_id

  const fileExt = belegDaten?.original_filename?.split('.').pop()?.toLowerCase() ?? ''
  const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif']
  const isImage = imageExts.includes(belegDaten?.dateityp ?? '') || imageExts.includes(fileExt)
  const isPdf = !isImage && (belegDaten?.dateityp === 'pdf' || fileExt === 'pdf')

  const asTransaktion: TransaktionWithRelations = {
    id: eintrag.id,
    datum: eintrag.datum,
    betrag: eintrag.betrag,
    beschreibung: eintrag.beschreibung,
    match_status: eintrag.match_status,
    match_score: eintrag.match_score,
    match_type: eintrag.match_type,
    beleg_id: eintrag.beleg_id,
    erstellt_am: eintrag.erstellt_am,
    mandant_id: '',
    quelle_id: '',
    iban_gegenseite: null,
    bic_gegenseite: null,
    buchungsreferenz: null,
    mwst_satz: eintrag.mwst_satz ?? null,
    workflow_status: 'normal',
    belege: eintrag.belege,
    zahlungsquellen: { name: 'Kassa', typ: 'kassa' },
    buchungsnummer: null,
    geloescht_am: null,
    match_bestaetigt_am: null,
    match_bestaetigt_von: null,
  }

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

          {/* ── Kassaeintragsdetails (rechts) ── */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  {isStorno || isStorniert ? (
                    <Ban className="h-5 w-5 text-muted-foreground shrink-0" />
                  ) : isExpense ? (
                    <ArrowUpRight className="h-5 w-5 text-red-500 shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-5 w-5 text-teal-500 shrink-0" />
                  )}
                  <span
                    className={cn(
                      'font-mono',
                      isStorno
                        ? 'text-muted-foreground line-through'
                        : isExpense
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-teal-600 dark:text-teal-400',
                    )}
                  >
                    {formatCurrency(eintrag.betrag)}
                  </span>
                </SheetTitle>
                <SheetDescription>
                  Kassaeintrag vom {formatDate(eintrag.datum)}
                  {eintrag.lfd_nr_kassa != null && ` · #${eintrag.lfd_nr_kassa}`}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Entry details */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Eintragsdetails</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Datum</dt>
                    <dd>{formatDate(eintrag.datum)}</dd>

                    <dt className="text-muted-foreground">Betrag</dt>
                    <dd
                      className={cn(
                        'font-mono',
                        isStorno
                          ? 'text-muted-foreground line-through'
                          : isExpense
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-teal-600 dark:text-teal-400',
                      )}
                    >
                      {formatCurrency(eintrag.betrag)}
                    </dd>

                    <dt className="text-muted-foreground">Beschreibung</dt>
                    <dd className="break-words">{eintrag.beschreibung || '-'}</dd>

                    {eintrag.lfd_nr_kassa != null && (
                      <>
                        <dt className="text-muted-foreground">Lfd. Nr.</dt>
                        <dd className="font-mono text-xs">{eintrag.lfd_nr_kassa}</dd>
                      </>
                    )}

                    {eintrag.kassa_kategorien && (
                      <>
                        <dt className="text-muted-foreground">Kategorie</dt>
                        <dd>
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: eintrag.kassa_kategorien.farbe }}
                            />
                            {eintrag.kassa_kategorien.name}
                          </span>
                        </dd>
                      </>
                    )}

                    {eintrag.mwst_satz != null && (
                      <>
                        <dt className="text-muted-foreground">MwSt-Satz</dt>
                        <dd>{eintrag.mwst_satz} %</dd>
                      </>
                    )}

                    {eintrag.mwst_betrag != null && (
                      <>
                        <dt className="text-muted-foreground">MwSt-Betrag</dt>
                        <dd className="font-mono">{formatCurrency(eintrag.mwst_betrag)}</dd>
                      </>
                    )}

                    {isStorno && eintrag.storno_grund && (
                      <>
                        <dt className="text-muted-foreground">Storno-Grund</dt>
                        <dd className="break-words">{eintrag.storno_grund}</dd>
                      </>
                    )}

                    {isStorniert && (
                      <>
                        <dt className="text-muted-foreground">Status</dt>
                        <dd className="text-muted-foreground">Storniert</dd>
                      </>
                    )}
                  </dl>
                </div>

                {!isStorno && !isStorniert && (
                  <>
                    <Separator />

                    {/* Match info */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Matching</h3>
                        {eintrag.match_status === 'vorgeschlagen' && eintrag.beleg_id && (
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
                          status={eintrag.match_status}
                          score={eintrag.match_score}
                        />
                        <MatchGrund
                          matchType={
                            eintrag.match_type as Parameters<typeof MatchGrund>[0]['matchType']
                          }
                          score={eintrag.match_score}
                        />
                      </div>

                      {(eintrag.match_status === 'vorgeschlagen' ||
                        eintrag.match_status === 'bestaetigt') &&
                        eintrag.belege && (
                          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                              <dt className="text-muted-foreground">Lieferant</dt>
                              <dd>{eintrag.belege.lieferant ?? '-'}</dd>
                              <dt className="text-muted-foreground">Rechnungsnr.</dt>
                              <dd>{eintrag.belege.rechnungsnummer ?? '-'}</dd>
                              <dt className="text-muted-foreground">Bruttobetrag</dt>
                              <dd className="font-mono">
                                {eintrag.belege.bruttobetrag !== null
                                  ? formatCurrency(eintrag.belege.bruttobetrag)
                                  : '-'}
                              </dd>
                            </dl>
                            {hasBelegAttached && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full gap-1.5 mt-1"
                                onClick={handleToggleBelegPanel}
                              >
                                <Eye className="h-3.5 w-3.5" />
                                {belegPanelOpen ? 'Beleg ausblenden' : 'Beleg ansehen'}
                              </Button>
                            )}
                          </div>
                        )}

                      <div className="flex flex-wrap gap-2">
                        {(eintrag.match_status === 'offen' ||
                          eintrag.match_status === 'vorgeschlagen' ||
                          eintrag.match_status === 'bestaetigt') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setZuordnungsOpen(true)}
                            className="gap-1.5"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            {eintrag.match_status === 'offen'
                              ? 'Manuell zuordnen'
                              : 'Beleg ändern'}
                          </Button>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Comments */}
                    <KommentareSection transaktionId={eintrag.id} />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </SheetContent>

      <ZuordnungsDialog
        open={zuordnungsOpen}
        onOpenChange={setZuordnungsOpen}
        transaktion={asTransaktion}
        onAssigned={() => {
          setZuordnungsOpen(false)
          onActionComplete?.()
        }}
      />
    </Sheet>
  )
}
