'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, CircleDot } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

interface MatchingStats {
  total: number
  bestaetigt: number
  vorgeschlagen: number
  offen: number
}

interface MatchingStatusBarProps {
  stats: MatchingStats
  loading: boolean
  onMatchingComplete: () => void
}

export function MatchingStatusBar({
  stats,
  loading,
  onMatchingComplete,
}: MatchingStatusBarProps) {
  const [running, setRunning] = useState(false)

  const matchQuote = stats.total > 0
    ? Math.round((stats.bestaetigt / stats.total) * 100)
    : 0

  async function handleRunMatching() {
    setRunning(true)
    try {
      const response = await fetch('/api/matching/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Matching fehlgeschlagen')
      }

      const result = await response.json()
      toast.success(
        `Matching abgeschlossen: ${result.matched} zugeordnet, ${result.suggested} Vorschlaege, ${result.unmatched} offen`
      )
      onMatchingComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setRunning(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-2 flex-1" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    )
  }

  if (stats.total === 0) {
    return null
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Stats */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">
              {matchQuote}% zugeordnet
            </span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>{stats.bestaetigt} zugeordnet</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span>{stats.vorgeschlagen} Vorschlaege</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="h-3.5 w-3.5 text-red-500" />
              <span>{stats.offen} offen</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="flex-1 hidden md:block">
            <Progress value={matchQuote} className="h-2" />
          </div>

          {/* Run matching button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunMatching}
            disabled={running}
            className="shrink-0"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${running ? 'animate-spin' : ''}`} />
            {running ? 'Matching laeuft...' : 'Matching neu starten'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
