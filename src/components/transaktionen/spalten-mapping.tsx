'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { ColumnMapping, ParsedTransaktion } from '@/lib/csv-parser'

interface SpaltenMappingProps {
  headers: string[]
  rows: string[][]
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  invertSign: boolean
  onInvertSignChange: (value: boolean) => void
  previewData: ParsedTransaktion[]
}

const NONE_VALUE = '__none__'

const COLUMN_CONFIG: {
  key: keyof ColumnMapping
  label: string
  required: boolean
}[] = [
  { key: 'datum', label: 'Datum', required: true },
  { key: 'betrag', label: 'Betrag', required: true },
  { key: 'beschreibung', label: 'Beschreibung / Verwendungszweck', required: false },
]

export function SpaltenMapping({
  headers,
  rows,
  mapping,
  onMappingChange,
  invertSign,
  onInvertSignChange,
  previewData,
}: SpaltenMappingProps) {
  function handleColumnChange(key: keyof ColumnMapping, value: string) {
    onMappingChange({
      ...mapping,
      [key]: value === NONE_VALUE ? null : parseInt(value, 10),
    })
  }

  const previewRows = previewData.slice(0, 10)

  return (
    <div className="space-y-6">
      {/* Column mapping selects */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Spalten zuordnen</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COLUMN_CONFIG.map((col) => (
            <div key={col.key} className="space-y-1.5">
              <Label htmlFor={`mapping-${col.key}`} className="text-xs">
                {col.label}
                {col.required && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              <Select
                value={
                  mapping[col.key] !== null
                    ? String(mapping[col.key])
                    : NONE_VALUE
                }
                onValueChange={(val) => handleColumnChange(col.key, val)}
              >
                <SelectTrigger id={`mapping-${col.key}`}>
                  <SelectValue placeholder="Spalte wahlen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>
                    -- Nicht zugeordnet --
                  </SelectItem>
                  {headers.map((header, idx) => (
                    <SelectItem key={idx} value={String(idx)}>
                      {header || `Spalte ${idx + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Sign inversion toggle */}
      <div className="flex items-center gap-3 rounded-lg border p-4">
        <Switch
          id="invert-sign"
          checked={invertSign}
          onCheckedChange={onInvertSignChange}
        />
        <div>
          <Label htmlFor="invert-sign" className="text-sm font-medium cursor-pointer">
            Vorzeichen umkehren
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Aktivieren, wenn Ausgaben als positive Betrage dargestellt sind.
          </p>
        </div>
      </div>

      {/* Preview table */}
      {previewRows.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">
              Vorschau (erste {Math.min(previewRows.length, 10)} Zeilen)
            </h3>
            {previewRows.some((r) => r.error) && (
              <Badge variant="destructive" className="text-xs">
                {previewRows.filter((r) => r.error).length} Fehler
              </Badge>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Zeile</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow
                    key={row.rowIndex}
                    className={row.error ? 'bg-destructive/5' : ''}
                  >
                    <TableCell className="text-xs text-muted-foreground">
                      {row.rowIndex}
                    </TableCell>
                    <TableCell className="text-sm">{row.datum || '-'}</TableCell>
                    <TableCell
                      className={`text-sm text-right font-mono ${
                        row.betrag < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {row.error && row.betrag === 0
                        ? '-'
                        : new Intl.NumberFormat('de-AT', {
                            style: 'currency',
                            currency: 'EUR',
                          }).format(row.betrag)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {row.beschreibung || '-'}
                    </TableCell>
                    <TableCell>
                      {row.error ? (
                        <Badge variant="destructive" className="text-xs">
                          Fehler
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-xs border-emerald-500 text-emerald-600"
                        >
                          OK
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
