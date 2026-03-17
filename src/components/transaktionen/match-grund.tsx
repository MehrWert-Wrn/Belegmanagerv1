'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type MatchType = 'RN_MATCH' | 'SEPA_MATCH' | 'IBAN_GUARDED' | 'PAYPAL_ID_MATCH' | 'SCORE' | 'MANUAL' | null

interface MatchGrundProps {
  matchType: MatchType
  score: number | null
}

const MATCH_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  RN_MATCH: {
    label: 'Rechnungsnr.',
    description: 'Rechnungsnummer im Verwendungszweck gefunden',
  },
  SEPA_MATCH: {
    label: 'SEPA-Ref.',
    description: 'SEPA-Referenz stimmt mit Rechnungsnummer ueberein',
  },
  IBAN_GUARDED: {
    label: 'IBAN + Betrag',
    description: 'IBAN des Lieferanten + exakter Betrag stimmen ueberein',
  },
  PAYPAL_ID_MATCH: {
    label: 'PayPal-ID',
    description: 'PayPal-Transaktions-ID im Verwendungszweck gefunden',
  },
  SCORE: {
    label: 'Score',
    description: 'Automatisch anhand von Betrag, Datum, Lieferant und Beschreibung bewertet',
  },
  MANUAL: {
    label: 'Manuell',
    description: 'Manuell vom Benutzer zugeordnet',
  },
}

export function MatchGrund({ matchType, score }: MatchGrundProps) {
  if (!matchType) {
    return (
      <span className="text-xs text-muted-foreground">-</span>
    )
  }

  const config = MATCH_TYPE_LABELS[matchType]
  if (!config) return null

  const displayLabel = matchType === 'SCORE' && score !== null
    ? `Score ${score}`
    : config.label

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="text-xs font-mono">
            {displayLabel}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
