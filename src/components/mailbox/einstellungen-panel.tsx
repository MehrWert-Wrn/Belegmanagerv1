'use client'

/**
 * PROJ-32: EinstellungenPanel - Konfiguration der aktiven Verbindung
 *
 * Drei Bereiche:
 *  - OrdnerAuswahl: Welche Ordner ueberwachen?
 *  - StartdatumPicker: Mails importieren ab wann?
 *  - KiKlassifizierungToggle: Nur echte Rechnungen importieren
 *
 * Aenderungen werden lokal gehalten und ueber den "Speichern"-Button
 * via PATCH an die API uebergeben.
 */

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import type { MailboxOrdnerListe, MailboxVerbindung } from './mailbox-types'

interface EinstellungenPanelProps {
  verbindung: MailboxVerbindung
  /** Wird nach erfolgreichem Speichern aufgerufen, damit der Parent neu lesen kann. */
  onAktualisiert: () => void
}

const MAX_TAGE_VERGANGENHEIT = 90

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function dateMinusTage(tage: number): string {
  const d = new Date()
  d.setDate(d.getDate() - tage)
  return isoDate(d)
}

export function EinstellungenPanel({ verbindung, onAktualisiert }: EinstellungenPanelProps) {
  const [ordnerFilter, setOrdnerFilter] = useState<string[]>(verbindung.ordner_filter)
  const [importSeit, setImportSeit] = useState(verbindung.import_seit)
  const [kiAktiv, setKiAktiv] = useState(verbindung.ki_klassifizierung_aktiv)

  const [verfuegbareOrdner, setVerfuegbareOrdner] = useState<string[] | null>(null)
  const [ordnerLaden, setOrdnerLaden] = useState(false)
  const [ordnerFehler, setOrdnerFehler] = useState<string | null>(null)

  const [speichert, setSpeichert] = useState(false)

  // Sync wenn neue Verbindung uebergeben wird
  useEffect(() => {
    setOrdnerFilter(verbindung.ordner_filter)
    setImportSeit(verbindung.import_seit)
    setKiAktiv(verbindung.ki_klassifizierung_aktiv)
  }, [verbindung])

  async function handleOrdnerLaden() {
    setOrdnerLaden(true)
    setOrdnerFehler(null)
    try {
      const res = await fetch('/api/mailbox/ordner')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Ordner konnten nicht geladen werden.')
      }
      const data: MailboxOrdnerListe = await res.json()
      setVerfuegbareOrdner(data.ordner)
    } catch (err) {
      setOrdnerFehler(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setOrdnerLaden(false)
    }
  }

  function toggleOrdner(name: string, aktiv: boolean) {
    setOrdnerFilter((prev) => {
      if (aktiv) {
        return prev.includes(name) ? prev : [...prev, name]
      }
      return prev.filter((o) => o !== name)
    })
  }

  function importSeitGueltig(): boolean {
    if (!importSeit) return false
    const eingabe = new Date(importSeit)
    if (Number.isNaN(eingabe.getTime())) return false
    const minimum = new Date(dateMinusTage(MAX_TAGE_VERGANGENHEIT))
    const heute = new Date(isoDate(new Date()))
    return eingabe >= minimum && eingabe <= heute
  }

  async function handleSpeichern() {
    if (ordnerFilter.length === 0) {
      toast.error('Mindestens ein Ordner muss ausgewaehlt sein.')
      return
    }
    if (!importSeitGueltig()) {
      toast.error(`Startdatum darf maximal ${MAX_TAGE_VERGANGENHEIT} Tage in der Vergangenheit liegen.`)
      return
    }
    setSpeichert(true)
    try {
      const res = await fetch('/api/mailbox/verbindung', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ordner_filter: ordnerFilter,
          import_seit: importSeit,
          ki_klassifizierung_aktiv: kiAktiv,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Einstellungen konnten nicht gespeichert werden.')
      }
      toast.success('Einstellungen gespeichert.')
      onAktualisiert()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.')
    } finally {
      setSpeichert(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Einstellungen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OrdnerAuswahl */}
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Welche Ordner sollen ueberwacht werden?</h3>
            <p className="text-xs text-muted-foreground">
              Standard ist INBOX. Mit &quot;Ordner laden&quot; kannst du weitere Ordner aus deiner
              Mailbox auswaehlen.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOrdnerLaden}
              disabled={ordnerLaden}
            >
              {ordnerLaden ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Lade Ordner...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Ordner laden
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Aktuell ausgewaehlt: {ordnerFilter.length > 0 ? ordnerFilter.join(', ') : 'keiner'}
            </span>
          </div>

          {ordnerFehler && (
            <Alert variant="destructive">
              <AlertDescription>{ordnerFehler}</AlertDescription>
            </Alert>
          )}

          {ordnerLaden && !verfuegbareOrdner && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-48" />
            </div>
          )}

          {verfuegbareOrdner && verfuegbareOrdner.length > 0 && (
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
              {verfuegbareOrdner.map((ordner) => {
                const aktiv = ordnerFilter.includes(ordner)
                const id = `ordner-${ordner}`
                return (
                  <div key={ordner} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={aktiv}
                      onCheckedChange={(checked) => toggleOrdner(ordner, checked === true)}
                    />
                    <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
                      {ordner}
                    </Label>
                  </div>
                )
              })}
            </div>
          )}

          {verfuegbareOrdner && verfuegbareOrdner.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Keine Ordner gefunden. Standard INBOX bleibt aktiv.
            </p>
          )}
        </section>

        {/* StartdatumPicker */}
        <section className="space-y-2">
          <Label htmlFor="import-seit" className="text-sm font-semibold">
            Mails importieren ab
          </Label>
          <Input
            id="import-seit"
            type="date"
            value={importSeit}
            min={dateMinusTage(MAX_TAGE_VERGANGENHEIT)}
            max={isoDate(new Date())}
            onChange={(e) => setImportSeit(e.target.value)}
            className="max-w-xs"
          />
          <p className="text-xs text-muted-foreground">
            Gilt nur fuer den ersten Import. Danach werden nur neue Mails verarbeitet.
            Maximal {MAX_TAGE_VERGANGENHEIT} Tage in die Vergangenheit moeglich.
          </p>
        </section>

        {/* KI-Klassifizierung */}
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="ki-aktiv" className="text-sm font-semibold cursor-pointer">
                Nur echte Rechnungen importieren (KI-Erkennung)
              </Label>
              <p className="text-xs text-muted-foreground">
                Die KI prueft vor dem Import, ob ein Anhang eine Rechnung oder ein Beleg ist.
                Newsletters, AGBs und Vertraege werden uebersprungen.
              </p>
            </div>
            <Switch
              id="ki-aktiv"
              checked={kiAktiv}
              onCheckedChange={setKiAktiv}
              aria-label="KI-Klassifizierung aktivieren"
            />
          </div>
        </section>

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={handleSpeichern} disabled={speichert}>
            {speichert ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Speichert...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Einstellungen speichern
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
