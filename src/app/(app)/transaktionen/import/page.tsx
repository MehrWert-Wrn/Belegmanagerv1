'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DropZone } from '@/components/transaktionen/drop-zone'
import { SpaltenMapping } from '@/components/transaktionen/spalten-mapping'
import {
  ImportErgebnis,
  type ImportResult,
} from '@/components/transaktionen/import-ergebnis'
import {
  detectEncoding,
  parseCsvFile,
  autoDetectMapping,
  applyMapping,
  type CsvParseResult,
  type ColumnMapping,
} from '@/lib/csv-parser'
import type { Zahlungsquelle } from '@/lib/supabase/types'

/**
 * Converts stored column name mapping (strings) to column index mapping (numbers).
 * Falls back to autoDetectMapping for any field not found in the stored mapping.
 */
function resolveMapping(
  headers: string[],
  rows: string[][],
  storedCsvMapping: Record<string, unknown> | null | undefined
): ColumnMapping {
  const auto = autoDetectMapping(headers, rows)
  if (!storedCsvMapping) return auto

  function findIndex(storedName: unknown): number | null {
    if (typeof storedName !== 'string' || !storedName.trim()) return null
    const idx = headers.findIndex(
      (h) => h.trim().toLowerCase() === storedName.trim().toLowerCase()
    )
    return idx !== -1 ? idx : null
  }

  return {
    datum: findIndex(storedCsvMapping.datum) ?? auto.datum,
    betrag: findIndex(storedCsvMapping.betrag) ?? auto.betrag,
    beschreibung: findIndex(storedCsvMapping.beschreibung) ?? auto.beschreibung,
    iban: findIndex(storedCsvMapping.iban) ?? auto.iban,
    referenz: findIndex(storedCsvMapping.referenz) ?? auto.referenz,
  }
}

type WizardStep = 1 | 2 | 3

const STEPS = [
  { number: 1, label: 'Datei hochladen' },
  { number: 2, label: 'Spalten zuordnen' },
  { number: 3, label: 'Importieren' },
]

export default function ImportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1)

  // Zahlungsquelle (payment source) state
  const [quellen, setQuellen] = useState<Zahlungsquelle[]>([])
  const [quellenLoading, setQuellenLoading] = useState(true)
  const [quellenError, setQuellenError] = useState<string | null>(null)
  const [selectedQuelleId, setSelectedQuelleId] = useState<string | null>(null)
  // Ref to always access current selected source inside useCallback without stale closure
  const selectedQuelleRef = useRef<Zahlungsquelle | null>(null)
  useEffect(() => {
    selectedQuelleRef.current = quellen.find((q) => q.id === selectedQuelleId) ?? null
  }, [quellen, selectedQuelleId])

  // Step 1: File
  const [file, setFile] = useState<File | null>(null)
  const [csvData, setCsvData] = useState<CsvParseResult | null>(null)
  const [rawPreviewLines, setRawPreviewLines] = useState<string[]>([])
  const [encoding, setEncoding] = useState('auto')
  const [delimiter, setDelimiter] = useState('auto')
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // Step 2: Mapping
  const [mapping, setMapping] = useState<ColumnMapping>({
    datum: null,
    betrag: null,
    beschreibung: null,
    iban: null,
    referenz: null,
  })
  const [invertSign, setInvertSign] = useState(false)

  // Step 3: Import
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Fetch available Zahlungsquellen on mount
  useEffect(() => {
    async function fetchQuellen() {
      try {
        const response = await fetch('/api/zahlungsquellen')
        if (!response.ok) {
          throw new Error('Zahlungsquellen konnten nicht geladen werden.')
        }
        const data: Zahlungsquelle[] = await response.json()

        if (data.length === 0) {
          throw new Error('Keine aktiven Zahlungsquellen vorhanden. Bitte zuerst eine Zahlungsquelle anlegen.')
        }

        setQuellen(data)
        const preselectedId = searchParams.get('quelle_id')
        const match = preselectedId ? data.find((q) => q.id === preselectedId) : null
        setSelectedQuelleId(match ? match.id : data[0].id)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
        setQuellenError(message)
      } finally {
        setQuellenLoading(false)
      }
    }
    fetchQuellen()
  }, [])

  // Parsed transactions based on current mapping
  const parsedTransactions = useMemo(() => {
    if (!csvData) return []
    return applyMapping(csvData.rows, mapping, invertSign)
  }, [csvData, mapping, invertSign])

  const validTransactions = parsedTransactions.filter((t) => !t.error)
  const errorTransactions = parsedTransactions.filter((t) => t.error)

  // Read raw preview lines from file (first 3 lines, unparsed)
  async function readRawPreview(f: File, enc?: string) {
    try {
      const resolvedEnc = enc || (encoding === 'auto' ? await detectEncoding(f) : encoding)
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
        reader.readAsText(f.slice(0, 10000), resolvedEnc)
      })
      const lines = text.split(/\r?\n/).filter(l => l.trim() !== '').slice(0, 3)
      setRawPreviewLines(lines)
    } catch {
      setRawPreviewLines([])
    }
  }

  // Handle file selection – store file and show raw preview, do NOT auto-advance
  async function handleFileAccepted(newFile: File) {
    setFile(newFile)
    setCsvData(null)
    setParseError(null)
    await readRawPreview(newFile)
  }

  // Validate step can proceed
  function canProceed(): boolean {
    if (step === 1) return file !== null && selectedQuelleId !== null
    if (step === 2) return mapping.datum !== null && mapping.betrag !== null && validTransactions.length > 0
    return false
  }

  // Handle import
  async function handleImport() {
    if (validTransactions.length === 0 || !file || !selectedQuelleId) return

    setImporting(true)
    setImportProgress(0)

    // Simulate progress: ramp to 85% over ~(rowCount * 10ms), then wait for response
    const rowCount = validTransactions.length
    const totalMs = Math.min(Math.max(rowCount * 8, 1500), 12000)
    const intervalMs = 200
    const steps = totalMs / intervalMs
    let tick = 0
    const progressTimer = setInterval(() => {
      tick++
      // Ease-out curve: slows down near 85%
      const pct = 85 * (1 - Math.pow(1 - tick / steps, 2))
      setImportProgress(Math.min(pct, 85))
      if (tick >= steps) clearInterval(progressTimer)
    }, intervalMs)

    try {
      const payload = {
        quelle_id: selectedQuelleId,
        dateiname: file.name,
        transaktionen: validTransactions.map((t) => ({
          datum: t.datum,
          betrag: t.betrag,
          beschreibung: t.beschreibung,
          iban_gegenseite: t.iban_gegenseite,
          buchungsreferenz: t.buchungsreferenz,
        })),
      }

      const response = await fetch('/api/transaktionen/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errMsg =
          typeof errorData.error === 'string'
            ? errorData.error
            : errorData.error
              ? JSON.stringify(errorData.error)
              : 'Import fehlgeschlagen. Bitte versuchen Sie es erneut.'
        throw new Error(errMsg)
      }

      clearInterval(progressTimer)
      setImportProgress(100)
      const result = await response.json()
      setImportResult({
        importiert: result.anzahl_importiert ?? 0,
        duplikate: result.anzahl_duplikate ?? 0,
        fehler: errorTransactions.length + (result.anzahl_fehler ?? 0),
        gesperrte_monate: result.anzahl_gesperrte_monate ?? 0,
        matching_quote: result.matching_quote ?? 0,
      })
      setStep(3)
      toast.success(
        `${result.anzahl_importiert ?? 0} Transaktionen importiert.`
      )
    } catch (err) {
      clearInterval(progressTimer)
      setImportProgress(0)
      const message =
        err instanceof Error ? err.message : 'Unbekannter Fehler beim Import.'
      toast.error(message)
    } finally {
      setImporting(false)
    }
  }

  function handleBack() {
    if (step === 2) setStep(1)
  }

  async function handleNext() {
    if (step === 1 && canProceed() && file) {
      setParseLoading(true)
      setParseError(null)

      try {
        const enc = encoding === 'auto' ? await detectEncoding(file) : encoding
        const delim = delimiter === 'auto' ? '' : delimiter

        const result = await parseCsvFile(file, enc, delim, hasHeaderRow)

        if (result.rows.length === 0) {
          throw new Error('Die CSV-Datei enthalt keine Datenzeilen.')
        }

        setCsvData(result)

        // Apply stored mapping from selected source, fall back to auto-detect
        const storedCsvMapping = selectedQuelleRef.current?.csv_mapping as Record<string, unknown> | null
        setMapping(resolveMapping(result.headers, result.rows, storedCsvMapping))

        setStep(2)
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : 'Fehler beim Lesen der Datei.'
        )
      } finally {
        setParseLoading(false)
      }
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/transaktionen')}
          aria-label="Zuruck zur Transaktionsubersicht"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            CSV importieren
          </h1>
          <p className="text-sm text-muted-foreground">
            CSV-Datei hochladen und Spalten zuordnen.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          {STEPS.map((s) => (
            <div
              key={s.number}
              className="flex items-center gap-2"
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  s.number < step
                    ? 'bg-emerald-600 text-white'
                    : s.number === step
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {s.number < step ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  s.number
                )}
              </div>
              <span
                className={`text-sm hidden sm:inline ${
                  s.number === step
                    ? 'font-medium'
                    : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <Progress value={(step / 3) * 100} className="h-1" />
      </div>

      {/* Zahlungsquelle error state */}
      {quellenError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{quellenError}</span>
        </div>
      )}

      {/* Step content */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>CSV-Datei hochladen</CardTitle>
            <CardDescription>
              Laden Sie den Kontoauszug als CSV-Datei hoch. Unterstuzte Formate:
              UTF-8, Latin-1 (ISO-8859-1), mit Semikolon oder Komma als
              Trennzeichen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Zahlungsquelle selection */}
            {quellenLoading ? (
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : quellen.length > 1 ? (
              <div className="space-y-1.5">
                <Label htmlFor="quelle" className="text-xs">
                  Zahlungsquelle
                </Label>
                <Select
                  value={selectedQuelleId ?? ''}
                  onValueChange={setSelectedQuelleId}
                >
                  <SelectTrigger id="quelle" aria-label="Zahlungsquelle wahlen">
                    <SelectValue placeholder="Zahlungsquelle wahlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {quellen.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                        {q.iban ? ` (${q.iban})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : quellen.length === 1 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Zahlungsquelle:</span>
                <Badge variant="outline">{quellen[0].name}</Badge>
              </div>
            ) : null}

            <DropZone
              onFileAccepted={handleFileAccepted}
              isLoading={parseLoading}
              error={parseError}
            />

            {/* Encoding & delimiter overrides */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="encoding" className="text-xs">
                  Zeichenkodierung
                </Label>
                <Select
                  value={encoding}
                  onValueChange={(v) => {
                    setEncoding(v)
                    if (file) readRawPreview(file, v === 'auto' ? undefined : v)
                  }}
                >
                  <SelectTrigger id="encoding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatisch</SelectItem>
                    <SelectItem value="UTF-8">UTF-8</SelectItem>
                    <SelectItem value="ISO-8859-1">
                      Latin-1 (ISO-8859-1)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="delimiter" className="text-xs">
                  Trennzeichen
                </Label>
                <Select
                  value={delimiter}
                  onValueChange={setDelimiter}
                >
                  <SelectTrigger id="delimiter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatisch</SelectItem>
                    <SelectItem value=";">Semikolon ( ; )</SelectItem>
                    <SelectItem value=",">Komma ( , )</SelectItem>
                    <SelectItem value="	">Tabulator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Header row toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="header-row"
                checked={hasHeaderRow}
                onCheckedChange={setHasHeaderRow}
              />
              <Label htmlFor="header-row" className="text-sm cursor-pointer">
                Erste Zeile enthalt Spaltenuberschriften
              </Label>
            </div>

            {/* File info */}
            {file && (
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">{file.name}</Badge>
                <Badge variant="secondary">
                  {(file.size / 1024).toFixed(1)} KB
                </Badge>
              </div>
            )}

            {/* Raw CSV preview (first 3 lines, unparsed) */}
            {rawPreviewLines.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-muted-foreground">
                    Rohvorschau (erste {rawPreviewLines.length} Zeilen)
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    Trennzeichen:{' '}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono">
                      {delimiter === 'auto' ? 'auto' : delimiter === '\t' ? 'Tab' : delimiter}
                    </code>
                  </span>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre leading-relaxed">
                    {rawPreviewLines.map((line, i) => (
                      <div key={i} className="py-0.5">
                        <span className="text-muted-foreground mr-3 select-none">{i + 1}</span>
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pruefen Sie, ob Umlaute und Trennzeichen korrekt dargestellt werden. Falls nicht, aendern Sie die Einstellungen oben.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && csvData && (
        <Card>
          <CardHeader>
            <CardTitle>Spalten zuordnen</CardTitle>
            <CardDescription>
              Ordnen Sie die CSV-Spalten den Transaktionsfeldern zu. Datum und
              Betrag sind Pflichtfelder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpaltenMapping
              headers={csvData.headers}
              rows={csvData.rows}
              mapping={mapping}
              onMappingChange={setMapping}
              invertSign={invertSign}
              onInvertSignChange={setInvertSign}
              previewData={parsedTransactions}
            />
          </CardContent>
        </Card>
      )}

      {step === 3 && importResult && file && (
        <Card>
          <CardHeader>
            <CardTitle>Import abgeschlossen</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportErgebnis
              result={importResult}
              fileName={file.name}
              onClose={() => router.push('/transaktionen')}
            />
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      {step !== 3 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zuruck
          </Button>

          {step === 1 && (
            <Button onClick={handleNext} disabled={!canProceed() || parseLoading}>
              {parseLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird verarbeitet...
                </>
              ) : (
                <>
                  Weiter
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3">
                <div className="text-sm text-muted-foreground hidden sm:block">
                  {validTransactions.length} gueltige Zeilen
                  {errorTransactions.length > 0 && (
                    <span className="text-destructive">
                      , {errorTransactions.length} Fehler
                    </span>
                  )}
                </div>
                <Button
                  onClick={handleImport}
                  disabled={!canProceed() || importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Importiere...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      {validTransactions.length} Transaktionen importieren
                    </>
                  )}
                </Button>
              </div>
              {importing && validTransactions.length > 100 && (
                <div className="w-48 space-y-1">
                  <Progress value={importProgress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {validTransactions.length} Zeilen…
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
