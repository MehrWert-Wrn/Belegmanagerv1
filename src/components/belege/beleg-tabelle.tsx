'use client'

import { MoreHorizontal, Eye, Pencil, Trash2, FileText, Ban, RotateCcw, Wallet, HelpCircle, Mail, Inbox } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import type { Beleg, Rechnungstyp } from '@/lib/supabase/types'

interface BelegTabelleProps {
  belege: Beleg[]
  loading: boolean
  selectedIds: Set<string>
  onSelectChange: (id: string, checked: boolean) => void
  onSelectAll: (checked: boolean) => void
  onSelect: (beleg: Beleg) => void
  onEdit: (beleg: Beleg) => void
  onDelete: (beleg: Beleg) => void
  onDirektBezahlt?: (beleg: Beleg) => void
  onActionComplete?: () => void
}

function formatCurrency(value: number | null): string {
  if (value === null) return '-'
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

function formatDate(value: string | null): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

const rechnungstypConfig: Record<Rechnungstyp, { label: string; className: string }> = {
  eingangsrechnung: {
    label: 'Eingangsrechnung',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  },
  ausgangsrechnung: {
    label: 'Ausgangsrechnung',
    className: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
  },
  gutschrift: {
    label: 'Gutschrift',
    className: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  },
  sonstiges: {
    label: 'Sonstiges',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  },
  eigenbeleg: {
    label: 'Eigenbeleg',
    className: 'bg-teal-100 text-teal-800 hover:bg-teal-100',
  },
  eigenverbrauch: {
    label: 'Eigenverbrauch',
    className: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  },
  tageslosung: {
    label: 'Tageslosung/Abschluss',
    className: 'bg-pink-100 text-pink-800 hover:bg-pink-100',
  },
}

function RechnungstypBadge({ typ }: { typ: Rechnungstyp | undefined }) {
  if (!typ) return <span className="text-muted-foreground">-</span>
  const config = rechnungstypConfig[typ]
  return <Badge className={config.className}>{config.label}</Badge>
}

async function handleOpenDocument(belegId: string) {
  try {
    const response = await fetch(`/api/belege/${belegId}/signed-url`)
    if (!response.ok) {
      toast.error('Dokument konnte nicht geladen werden.')
      return
    }
    const data = await response.json()
    if (data.url) {
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } else {
      toast.error('Dokument-URL nicht verfuegbar.')
    }
  } catch {
    toast.error('Fehler beim Laden des Dokuments.')
  }
}

function isFaelligkeitUeberfaellig(beleg: Beleg): boolean {
  if (!beleg.faelligkeitsdatum) return false
  if (beleg.zuordnungsstatus === 'zugeordnet') return false
  if (beleg.faelligkeit_bezahlt) return false
  const today = new Date().toISOString().slice(0, 10)
  return beleg.faelligkeitsdatum < today
}

export function BelegTabelle({
  belege,
  loading,
  selectedIds,
  onSelectChange,
  onSelectAll,
  onSelect,
  onEdit,
  onDelete,
  onDirektBezahlt,
  onActionComplete,
}: BelegTabelleProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (belege.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <p className="text-lg font-medium">Keine Belege vorhanden</p>
          <p className="text-sm text-muted-foreground">
            Laden Sie Ihren ersten Beleg hoch, um loszulegen.
          </p>
        </div>
      </div>
    )
  }

  const allSelected = belege.length > 0 && belege.every((b) => selectedIds.has(b.id))
  const someSelected = belege.some((b) => selectedIds.has(b.id)) && !allSelected

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={(checked) => onSelectAll(checked === true)}
                aria-label="Alle auswaehlen"
              />
            </TableHead>
            <TableHead>Rechnungsname</TableHead>
            <TableHead className="hidden md:table-cell">Datum</TableHead>
            <TableHead className="hidden lg:table-cell">Fälligkeit</TableHead>
            <TableHead className="hidden sm:table-cell">Lieferant</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Netto</TableHead>
            <TableHead className="text-right">Brutto</TableHead>
            <TableHead className="hidden lg:table-cell">Typ</TableHead>
            <TableHead className="w-[50px]">Dok.</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[50px]">
              <span className="sr-only">Aktionen</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {belege.map((beleg) => (
            <TableRow
              key={beleg.id}
              className="cursor-pointer"
              data-state={selectedIds.has(beleg.id) ? 'selected' : undefined}
              onClick={() => onSelect(beleg)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selectedIds.has(beleg.id)}
                  onCheckedChange={(checked) => onSelectChange(beleg.id, checked === true)}
                  aria-label={`Beleg ${beleg.rechnungsname || beleg.original_filename} auswaehlen`}
                />
              </TableCell>
              <TableCell className="font-medium">
                <span className="flex items-center gap-1.5">
                  {beleg.quelle === 'email' && (
                    <span title="Via E-Mail importiert">
                      <Mail
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Via E-Mail importiert"
                      />
                    </span>
                  )}
                  {(beleg.quelle as string) === 'mailbox' && (
                    <span title="Via Postfach-Anbindung importiert">
                      <Inbox
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-label="Via Postfach-Anbindung importiert"
                      />
                    </span>
                  )}
                  {beleg.rechnungsname || beleg.original_filename || 'Unbekannt'}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {formatDate(beleg.rechnungsdatum)}
              </TableCell>
              <TableCell className="hidden lg:table-cell whitespace-nowrap">
                {beleg.faelligkeitsdatum ? (
                  <span className={isFaelligkeitUeberfaellig(beleg) ? 'font-bold text-red-600 dark:text-red-400' : ''}>
                    {formatDate(beleg.faelligkeitsdatum)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {beleg.lieferant || '-'}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-right">
                {formatCurrency(beleg.nettobetrag)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(beleg.bruttobetrag)}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                <RechnungstypBadge typ={beleg.rechnungstyp} />
              </TableCell>
              <TableCell>
                {beleg.storage_path ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenDocument(beleg.id)
                    }}
                    aria-label="Dokument oeffnen"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                {beleg.zuordnungsstatus === 'zugeordnet' ? (
                  <Badge className="bg-teal-100 text-teal-800 hover:bg-teal-100">
                    Zugeordnet
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    Offen
                  </Badge>
                )}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <BelegAktionenMenu
                  beleg={beleg}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onDirektBezahlt={onDirektBezahlt}
                  onActionComplete={onActionComplete}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// --- BelegAktionenMenu ---

interface BelegAktionenMenuProps {
  beleg: Beleg
  onSelect: (beleg: Beleg) => void
  onEdit: (beleg: Beleg) => void
  onDelete: (beleg: Beleg) => void
  onDirektBezahlt?: (beleg: Beleg) => void
  onActionComplete?: () => void
}

function BelegAktionenMenu({ beleg, onSelect, onEdit, onDelete, onDirektBezahlt, onActionComplete }: BelegAktionenMenuProps) {
  const [loading, setLoading] = useState(false)

  async function handleSetBezahlt(bezahlt: boolean) {
    setLoading(true)
    try {
      const res = await fetch(`/api/belege/${beleg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ faelligkeit_bezahlt: bezahlt }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Fehler beim Aktualisieren')
      }
      toast.success(bezahlt ? 'Als bezahlt/ignoriert markiert' : 'Markierung aufgehoben')
      onActionComplete?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setLoading(false)
    }
  }

  const hasFaelligkeit = !!beleg.faelligkeitsdatum

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={loading}
          aria-label="Aktionen"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect(beleg)}>
          <Eye className="mr-2 h-4 w-4" />
          Vorschau
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(beleg)}>
          <Pencil className="mr-2 h-4 w-4" />
          Bearbeiten
        </DropdownMenuItem>
        {beleg.zuordnungsstatus === 'offen' && onDirektBezahlt && (
          <DropdownMenuItem onClick={() => onDirektBezahlt(beleg)}>
            <Wallet className="mr-2 h-4 w-4" />
            Direkt bezahlt
            <span title="Für Ausgaben, die bar, mit privater Karte oder außerhalb deines verbundenen Firmenkontos bezahlt wurden. Erstellt automatisch einen Buchungseintrag.">
              <HelpCircle className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </DropdownMenuItem>
        )}
        {hasFaelligkeit && beleg.zuordnungsstatus !== 'zugeordnet' && (
          <>
            <DropdownMenuSeparator />
            {beleg.faelligkeit_bezahlt ? (
              <DropdownMenuItem onClick={() => handleSetBezahlt(false)} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4 text-muted-foreground" />
                Markierung aufheben
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => handleSetBezahlt(true)} disabled={loading}>
                <Ban className="mr-2 h-4 w-4 text-gray-500" />
                Bezahlt / Ignorieren
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(beleg)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Loschen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
