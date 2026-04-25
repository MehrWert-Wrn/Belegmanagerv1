'use client'

import { AlertTriangle } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { StatusBadge, type ReferralStatus } from './status-badge'

export interface ReferralRow {
  id: string
  clicked_at: string
  registered_at: string | null
  rewarded_at: string | null
  referred_email: string | null
  status: ReferralStatus
  same_domain_flag: boolean
}

interface TabelleProps {
  rows: ReferralRow[]
  loading?: boolean
}

function fmtDate(iso: string | null): string {
  if (!iso) return '–'
  return new Intl.DateTimeFormat('de-AT', { dateStyle: 'medium' }).format(new Date(iso))
}

function maskEmail(email: string | null): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  const visible = local.slice(0, 1)
  return `${visible}***@${domain}`
}

export function Tabelle({ rows, loading = false }: TabelleProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-teal-200 bg-teal-50/40 px-6 py-10 text-center">
        <p className="text-sm font-medium text-teal-700">Noch keine Empfehlungen</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobald jemand deinen Link nutzt, erscheint die Empfehlung hier.
        </p>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[140px]">Datum</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Belohnt am</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-sm font-medium">
                  {fmtDate(row.clicked_at)}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs">{maskEmail(row.referred_email)}</span>
                    {row.same_domain_flag && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span aria-label="Gleiche E-Mail-Domain">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">
                            Gleiche E-Mail-Domain – wird manuell geprüft
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-sm text-muted-foreground">
                  {row.rewarded_at ? fmtDate(row.rewarded_at) : '–'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
