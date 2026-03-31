'use client'

import Link from 'next/link'
import {
  Lock,
  LockOpen,
  ChevronRight,
  Download,
  RotateCcw,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import type { MonatsStatus, PruefungAmpel } from '@/lib/monatsabschluss-types'
import { getMonatsname } from '@/lib/monatsabschluss-types'

interface MonatsKarteProps {
  jahr: number
  monat: number
  status: MonatsStatus
  ampel: PruefungAmpel
  anzahlTransaktionen: number
  anzahlOffen: number
  datevExportVorhanden?: boolean
  onAbschliessen: (jahr: number, monat: number) => void
  onWiedereroeffnen: (jahr: number, monat: number) => void
  onExport?: (jahr: number, monat: number) => void
}

const STATUS_CONFIG: Record<
  MonatsStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline'; icon: typeof Lock; className: string }
> = {
  offen: {
    label: 'Offen',
    variant: 'outline',
    icon: LockOpen,
    className: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
  },
  in_bearbeitung: {
    label: 'In Bearbeitung',
    variant: 'secondary',
    icon: LockOpen,
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  abgeschlossen: {
    label: 'Abgeschlossen',
    variant: 'default',
    icon: Lock,
    className: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-300',
  },
}

export function MonatsKarte({
  jahr,
  monat,
  status,
  ampel,
  anzahlTransaktionen,
  anzahlOffen,
  datevExportVorhanden,
  onAbschliessen,
  onWiedereroeffnen,
  onExport,
}: MonatsKarteProps) {
  const config = STATUS_CONFIG[status]
  const StatusIcon = config.icon
  const matchingQuote = anzahlTransaktionen > 0
    ? Math.round(((anzahlTransaktionen - anzahlOffen) / anzahlTransaktionen) * 100)
    : 100
  const istAbgeschlossen = status === 'abgeschlossen'

  return (
    <Card className={`transition-colors hover:bg-muted/30 ${istAbgeschlossen ? 'bg-muted/10' : ''}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Month info */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-bold">
              {String(monat).padStart(2, '0')}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold truncate">
                  {getMonatsname(monat)} {jahr}
                </h3>
                {istAbgeschlossen && (
                  <Lock className="h-4 w-4 shrink-0 text-teal-600" aria-label="Monat gesperrt" />
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <Badge variant="outline" className={`text-xs ${config.className}`}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {config.label}
                </Badge>
                {anzahlTransaktionen > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {anzahlTransaktionen} Transaktionen
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center: Matching progress */}
          <div className="flex-1 max-w-xs hidden md:block">
            {anzahlTransaktionen > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Matching-Quote</span>
                  <span className="font-medium">
                    {matchingQuote}%
                    {anzahlOffen > 0 && (
                      <span className="ml-1 text-red-600 dark:text-red-400">
                        ({anzahlOffen} offen)
                      </span>
                    )}
                  </span>
                </div>
                <Progress
                  value={matchingQuote}
                  className="h-2"
                  aria-label={`Matching-Quote: ${matchingQuote}%`}
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                Keine Transaktionen vorhanden
              </span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {istAbgeschlossen && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onExport?.(jahr, monat)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">DATEV-Export</span>
                  <span className="sm:hidden">Export</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onWiedereroeffnen(jahr, monat)}
                  className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Wiederoeffnen</span>
                </Button>
              </>
            )}
            {!istAbgeschlossen && (
              <Button
                size="sm"
                onClick={() => onAbschliessen(jahr, monat)}
              >
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Abschliessen
              </Button>
            )}
            <Button variant="ghost" size="icon" asChild className="shrink-0">
              <Link
                href={`/monatsabschluss/${jahr}/${monat}`}
                aria-label={`${getMonatsname(monat)} ${jahr} Details anzeigen`}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Mobile matching info */}
        <div className="mt-3 md:hidden">
          {anzahlTransaktionen > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Matching-Quote</span>
                <span className="font-medium">
                  {matchingQuote}%
                  {anzahlOffen > 0 && (
                    <span className="ml-1 text-red-600 dark:text-red-400">
                      ({anzahlOffen} offen)
                    </span>
                  )}
                </span>
              </div>
              <Progress value={matchingQuote} className="h-2" />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Keine Transaktionen vorhanden
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Loading skeleton
export function MonatsKarteSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          <Skeleton className="hidden md:block h-2 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-8" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
