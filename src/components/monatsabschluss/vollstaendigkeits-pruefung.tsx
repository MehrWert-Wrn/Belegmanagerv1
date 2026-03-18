'use client'

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  CreditCard,
  Wallet,
  Scale,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Pruefung, PruefungAmpel, QuellenPruefung } from '@/lib/monatsabschluss-types'

interface VollstaendigkeitsPruefungProps {
  pruefung: Pruefung
  loading?: boolean
}

const AMPEL_CONFIG: Record<PruefungAmpel, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  gruen: {
    label: 'Alle Pruefungen bestanden',
    className: 'text-emerald-600 dark:text-emerald-400',
    icon: CheckCircle2,
  },
  gelb: {
    label: 'Pruefung mit Warnungen',
    className: 'text-amber-600 dark:text-amber-400',
    icon: AlertTriangle,
  },
  rot: {
    label: 'Pruefung fehlgeschlagen',
    className: 'text-red-600 dark:text-red-400',
    icon: XCircle,
  },
}

function getQuelleIcon(typ: string) {
  switch (typ) {
    case 'kassa':
      return Wallet
    case 'kreditkarte':
      return CreditCard
    default:
      return Database
  }
}

export function VollstaendigkeitsPruefung({ pruefung, loading }: VollstaendigkeitsPruefungProps) {
  if (loading) return <VollstaendigkeitsPruefungSkeleton />

  const config = AMPEL_CONFIG[pruefung.ampel]
  const AmpelIcon = config.icon

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AmpelIcon className={`h-5 w-5 ${config.className}`} />
          <CardTitle className="text-base">{config.label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Zahlungsquellen Check */}
        {pruefung.quellen.length > 0 ? (
          pruefung.quellen.map((quelle) => (
            <QuellenCheckItem key={quelle.quelle_id} quelle={quelle} />
          ))
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-amber-700 dark:text-amber-300">
              Keine aktiven Zahlungsquellen konfiguriert.
            </span>
          </div>
        )}

        {/* Offene Transaktionen */}
        <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
          pruefung.anzahl_offen === 0
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
            : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
        }`}>
          {pruefung.anzahl_offen === 0 ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span className={
            pruefung.anzahl_offen === 0
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-red-700 dark:text-red-300'
          }>
            {pruefung.anzahl_offen === 0
              ? 'Alle Transaktionen sind zugeordnet'
              : `${pruefung.anzahl_offen} offene Transaktionen ohne Zuordnung`}
          </span>
        </div>

        {/* Kassabuch Saldo */}
        {pruefung.kassa_saldo !== null && (
          <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
            pruefung.kassa_saldo_positiv
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
              : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          }`}>
            {pruefung.kassa_saldo_positiv ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <Scale className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={
              pruefung.kassa_saldo_positiv
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-amber-700 dark:text-amber-300'
            }>
              Kassasaldo:{' '}
              {pruefung.kassa_saldo.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
              {!pruefung.kassa_saldo_positiv && ' \u2014 negativer Saldo'}
            </span>
          </div>
        )}

        {/* Gesamtzahl */}
        <div className="pt-1 text-xs text-muted-foreground">
          Gesamt: {pruefung.anzahl_transaktionen} Transaktionen in diesem Monat
        </div>
      </CardContent>
    </Card>
  )
}

function QuellenCheckItem({ quelle }: { quelle: QuellenPruefung }) {
  const QuelleIcon = getQuelleIcon(quelle.typ)
  const passed = quelle.hat_transaktionen

  return (
    <div className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
      passed
        ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950'
        : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
    }`}>
      {passed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
      )}
      <QuelleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className={
        passed
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-red-700 dark:text-red-300'
      }>
        {quelle.quelle_name}:{' '}
        {passed
          ? `Import vorhanden${quelle.anzahl_offen > 0 ? ` (${quelle.anzahl_offen} offen)` : ''}`
          : 'Kein Import fuer diesen Monat'}
      </span>
    </div>
  )
}

function VollstaendigkeitsPruefungSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </CardContent>
    </Card>
  )
}
