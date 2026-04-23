'use client'

import { useState } from 'react'
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface KassabuchExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type ExportMode = 'monat' | 'jahr'
type ExportFormat = 'pdf' | 'csv'

const MONATE = [
  { value: '01', label: 'Januar' },
  { value: '02', label: 'Februar' },
  { value: '03', label: 'März' },
  { value: '04', label: 'April' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Dezember' },
]

function getAvailableYears(): string[] {
  const currentYear = new Date().getFullYear()
  const years: string[] = []
  for (let y = currentYear; y >= currentYear - 6; y--) {
    years.push(String(y))
  }
  return years
}

export function KassabuchExportDialog({
  open,
  onOpenChange,
}: KassabuchExportDialogProps) {
  const now = new Date()
  const [mode, setMode] = useState<ExportMode>('monat')
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [monat, setMonat] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [jahr, setJahr] = useState(String(now.getFullYear()))
  const [downloading, setDownloading] = useState(false)

  const years = getAvailableYears()

  async function handleExport() {
    setDownloading(true)
    try {
      // TODO (Backend): Implement API route
      //   GET /api/kassabuch/export?monat=YYYY-MM&format=pdf|csv
      //   GET /api/kassabuch/export?jahr=YYYY&format=pdf|csv
      // PDF: Server-side via @react-pdf/renderer (install pending)
      // CSV: Server-side with UTF-8 BOM, Semikolon-Separator, Dezimalkomma
      const params = new URLSearchParams()
      if (mode === 'monat') {
        params.set('monat', `${jahr}-${monat}`)
      } else {
        params.set('jahr', jahr)
      }
      params.set('format', format)

      const response = await fetch(`/api/kassabuch/export?${params.toString()}`)
      if (!response.ok) {
        throw new Error('Export fehlgeschlagen')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const extension = format === 'pdf' ? 'pdf' : 'csv'
      const filename =
        mode === 'monat'
          ? `kassabuch-${jahr}-${monat}.${extension}`
          : `kassabuch-jahresbericht-${jahr}.${extension}`
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success('Export bereit zum Download')
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      toast.error(message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kassabuch exportieren</DialogTitle>
          <DialogDescription>
            Erstellen Sie einen Monats- oder Jahresbericht als PDF oder CSV.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as ExportMode)} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monat">Monat</TabsTrigger>
            <TabsTrigger value="jahr">Jahresbericht</TabsTrigger>
          </TabsList>

          <TabsContent value="monat" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="export-monat">Monat</Label>
                <Select value={monat} onValueChange={setMonat}>
                  <SelectTrigger id="export-monat" aria-label="Monat wählen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONATE.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="export-jahr-monat">Jahr</Label>
                <Select value={jahr} onValueChange={setJahr}>
                  <SelectTrigger id="export-jahr-monat" aria-label="Jahr wählen">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="jahr" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="export-jahr">Jahr</Label>
              <Select value={jahr} onValueChange={setJahr}>
                <SelectTrigger id="export-jahr" aria-label="Jahr wählen">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Alert>
              <AlertDescription className="text-xs">
                Nur abgeschlossene Monate werden vollständig berücksichtigt. Offene Monate werden mit
                Hinweis aufgeführt.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label>Format</Label>
          <RadioGroup
            value={format}
            onValueChange={(v) => setFormat(v as ExportFormat)}
            className="grid grid-cols-2 gap-3"
          >
            <Label
              htmlFor="fmt-pdf"
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 dark:has-[:checked]:bg-teal-950"
            >
              <RadioGroupItem value="pdf" id="fmt-pdf" />
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">PDF</p>
                <p className="text-xs text-muted-foreground">Druckfertig</p>
              </div>
            </Label>
            <Label
              htmlFor="fmt-csv"
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-accent has-[:checked]:border-teal-500 has-[:checked]:bg-teal-50 dark:has-[:checked]:bg-teal-950"
            >
              <RadioGroupItem value="csv" id="fmt-csv" />
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">CSV</p>
                <p className="text-xs text-muted-foreground">Excel / BMD / RZL</p>
              </div>
            </Label>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={downloading}
          >
            Abbrechen
          </Button>
          <Button onClick={handleExport} disabled={downloading}>
            {downloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Export wird erstellt...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Herunterladen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
