'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MatchStatus } from '@/lib/supabase/types'

interface AmpelBadgeProps {
  status: MatchStatus
  score?: number | null
}

const AMPEL_CONFIG: Record<
  MatchStatus,
  { label: string; dotClass: string; badgeClass: string; tooltip: string }
> = {
  bestaetigt: {
    label: 'Zugeordnet',
    dotClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    tooltip: 'Beleg erfolgreich zugeordnet',
  },
  vorgeschlagen: {
    label: 'Vorschlag',
    dotClass: 'bg-amber-500',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
    tooltip: 'Beleg vorgeschlagen – bitte bestätigen',
  },
  offen: {
    label: 'Offen',
    dotClass: 'bg-red-500',
    badgeClass: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
    tooltip: 'Kein passender Beleg gefunden',
  },
  kein_beleg: {
    label: 'Kein Beleg erforderlich',
    dotClass: 'bg-gray-400',
    badgeClass: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400',
    tooltip: 'Kein Beleg erforderlich',
  },
}

export function AmpelBadge({ status, score }: AmpelBadgeProps) {
  const config = AMPEL_CONFIG[status]

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`gap-1.5 font-medium ${config.badgeClass}`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${config.dotClass}`}
              aria-hidden="true"
            />
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {config.tooltip}
            {score !== null && score !== undefined && score > 0 && (
              <span className="ml-1 font-mono">(Score: {score})</span>
            )}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
