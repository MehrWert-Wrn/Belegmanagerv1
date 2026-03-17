'use client'

import { MoreHorizontal, Eye, Pencil, Trash2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import type { Beleg } from '@/lib/supabase/types'

interface BelegTabelleProps {
  belege: Beleg[]
  loading: boolean
  onSelect: (beleg: Beleg) => void
  onEdit: (beleg: Beleg) => void
  onDelete: (beleg: Beleg) => void
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

export function BelegTabelle({
  belege,
  loading,
  onSelect,
  onEdit,
  onDelete,
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lieferant</TableHead>
            <TableHead className="hidden sm:table-cell">Rechnungsnr.</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead className="hidden md:table-cell">Datum</TableHead>
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
              onClick={() => onSelect(beleg)}
            >
              <TableCell className="font-medium">
                {beleg.lieferant || 'Unbekannt'}
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {beleg.rechnungsnummer || '-'}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(beleg.bruttobetrag)}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {formatDate(beleg.rechnungsdatum)}
              </TableCell>
              <TableCell>
                {beleg.zuordnungsstatus === 'zugeordnet' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                    Zugeordnet
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                    Offen
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Aktionen"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect(beleg)
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Vorschau
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation()
                        onEdit(beleg)
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Bearbeiten
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDelete(beleg)
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Loschen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
