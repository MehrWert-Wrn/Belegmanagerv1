import Papa from 'papaparse'

export interface CsvParseResult {
  headers: string[]
  rows: string[][]
  encoding: string
  delimiter: string
}

export interface ColumnMapping {
  datum: number | null
  betrag: number | null
  beschreibung: number | null
  iban: number | null
  referenz: number | null
}

export interface ParsedTransaktion {
  datum: string
  betrag: number
  beschreibung: string
  iban_gegenseite: string | null
  buchungsreferenz: string | null
  rowIndex: number
  error?: string
}

// Known Austrian bank CSV formats for auto-mapping
const KNOWN_FORMATS: {
  name: string
  detect: (headers: string[]) => boolean
  mapping: ColumnMapping
}[] = [
  {
    name: 'Erste Bank',
    detect: (h) =>
      h.some((c) => /buchungsdatum/i.test(c)) &&
      h.some((c) => /betrag/i.test(c)),
    mapping: { datum: -1, betrag: -1, beschreibung: -1, iban: -1, referenz: -1 },
  },
  {
    name: 'Raiffeisen',
    detect: (h) =>
      h.some((c) => /valuta/i.test(c) || /wertstellung/i.test(c)) &&
      h.some((c) => /betrag/i.test(c)),
    mapping: { datum: -1, betrag: -1, beschreibung: -1, iban: -1, referenz: -1 },
  },
]

/**
 * Auto-detect encoding from a File by checking BOM bytes.
 * Falls back to UTF-8.
 */
export function detectEncoding(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const arr = new Uint8Array(reader.result as ArrayBuffer)
      // Check BOM
      if (arr[0] === 0xef && arr[1] === 0xbb && arr[2] === 0xbf) {
        resolve('UTF-8')
        return
      }
      // Check for Latin-1 indicators (bytes > 127 that are valid Latin-1 but not valid UTF-8)
      let hasHighBytes = false
      for (let i = 0; i < Math.min(arr.length, 1000); i++) {
        if (arr[i] > 127) {
          hasHighBytes = true
          break
        }
      }
      // Try parsing as UTF-8 first
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true })
        decoder.decode(arr.slice(0, Math.min(arr.length, 2000)))
        resolve('UTF-8')
      } catch {
        resolve(hasHighBytes ? 'ISO-8859-1' : 'UTF-8')
      }
    }
    reader.readAsArrayBuffer(file.slice(0, 2000))
  })
}

/**
 * Parse a CSV file client-side using papaparse.
 * @param hasHeaderRow - When false, treats all rows as data and generates column names ("Spalte 1", "Spalte 2", ...)
 */
export function parseCsvFile(
  file: File,
  encoding: string = 'UTF-8',
  delimiter: string = '',
  hasHeaderRow: boolean = true
): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      encoding,
      delimiter: delimiter || undefined,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as string[][]
        if (data.length === 0) {
          reject(new Error('CSV-Datei ist leer.'))
          return
        }

        const detectedDelimiter = results.meta.delimiter

        let headers: string[]
        let rows: string[][]
        if (hasHeaderRow) {
          headers = data[0] ?? []
          rows = data.slice(1)
        } else {
          const colCount = Math.max(...data.map((r) => r.length))
          headers = Array.from({ length: colCount }, (_, i) => `Spalte ${i + 1}`)
          rows = data
        }

        resolve({
          headers,
          rows,
          encoding,
          delimiter: detectedDelimiter,
        })
      },
      error: (error) => {
        reject(new Error(`CSV-Parsing fehlgeschlagen: ${error.message}`))
      },
    })
  })
}

/**
 * Try to auto-detect column mapping based on header names.
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase().trim())

  const mapping: ColumnMapping = {
    datum: null,
    betrag: null,
    beschreibung: null,
    iban: null,
    referenz: null,
  }

  // Date columns
  const datumPatterns = [
    'buchungsdatum', 'datum', 'date', 'valuta', 'wertstellung',
    'buchungstag', 'belegdatum',
  ]
  for (const pattern of datumPatterns) {
    const idx = lower.findIndex((h) => h.includes(pattern))
    if (idx !== -1) {
      mapping.datum = idx
      break
    }
  }

  // Amount columns
  const betragPatterns = ['betrag', 'amount', 'summe', 'umsatz']
  for (const pattern of betragPatterns) {
    const idx = lower.findIndex((h) => h.includes(pattern))
    if (idx !== -1) {
      mapping.betrag = idx
      break
    }
  }

  // Description columns
  const beschreibungPatterns = [
    'beschreibung', 'verwendungszweck', 'text', 'buchungstext',
    'zahlungsgrund', 'description', 'empfaenger', 'auftraggeber',
  ]
  for (const pattern of beschreibungPatterns) {
    const idx = lower.findIndex((h) => h.includes(pattern))
    if (idx !== -1) {
      mapping.beschreibung = idx
      break
    }
  }

  // IBAN columns
  const ibanPatterns = ['iban', 'kontonummer', 'konto']
  for (const pattern of ibanPatterns) {
    const idx = lower.findIndex((h) => h.includes(pattern))
    if (idx !== -1) {
      mapping.iban = idx
      break
    }
  }

  // Reference columns
  const referenzPatterns = [
    'referenz', 'buchungsreferenz', 'reference', 'belegnummer',
    'transaktionsnummer',
  ]
  for (const pattern of referenzPatterns) {
    const idx = lower.findIndex((h) => h.includes(pattern))
    if (idx !== -1) {
      mapping.referenz = idx
      break
    }
  }

  return mapping
}

/**
 * Parse a date string in various formats to ISO date (YYYY-MM-DD).
 */
function parseDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // DD.MM.YYYY (Austrian/German format)
  const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2].padStart(2, '0')}-${dotMatch[1].padStart(2, '0')}`
  }

  // DD/MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[1].padStart(2, '0')}`
  }

  // YYYY-MM-DD (already ISO)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return trimmed
  }

  // DD-MM-YYYY
  const dashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMatch) {
    return `${dashMatch[3]}-${dashMatch[2].padStart(2, '0')}-${dashMatch[1].padStart(2, '0')}`
  }

  return null
}

/**
 * Parse an amount string to a number.
 * Handles German format (1.234,56) and English format (1,234.56).
 */
function parseAmount(value: string): number | null {
  let trimmed = value.trim()
  if (!trimmed) return null

  // Remove currency symbols and whitespace
  trimmed = trimmed.replace(/[€$\s]/g, '')

  // German format: 1.234,56 → dots as thousands separator, comma as decimal
  if (trimmed.includes(',') && trimmed.includes('.')) {
    const lastComma = trimmed.lastIndexOf(',')
    const lastDot = trimmed.lastIndexOf('.')
    if (lastComma > lastDot) {
      // German: 1.234,56
      trimmed = trimmed.replace(/\./g, '').replace(',', '.')
    }
    // else English: 1,234.56
    else {
      trimmed = trimmed.replace(/,/g, '')
    }
  } else if (trimmed.includes(',') && !trimmed.includes('.')) {
    // Could be German decimal: 123,45
    trimmed = trimmed.replace(',', '.')
  }

  const num = parseFloat(trimmed)
  return isNaN(num) ? null : num
}

/**
 * Apply column mapping to raw CSV rows and produce parsed transactions.
 */
export function applyMapping(
  rows: string[][],
  mapping: ColumnMapping,
  invertSign: boolean = false
): ParsedTransaktion[] {
  if (mapping.datum === null || mapping.betrag === null) {
    return []
  }

  return rows.map((row, index) => {
    const datumRaw = row[mapping.datum!] ?? ''
    const betragRaw = row[mapping.betrag!] ?? ''
    const beschreibungRaw = mapping.beschreibung !== null ? (row[mapping.beschreibung] ?? '') : ''
    const ibanRaw = mapping.iban !== null ? (row[mapping.iban] ?? '') : null
    const referenzRaw = mapping.referenz !== null ? (row[mapping.referenz] ?? '') : null

    const datum = parseDate(datumRaw)
    let betrag = parseAmount(betragRaw)

    if (betrag !== null && invertSign) {
      betrag = -betrag
    }

    const errors: string[] = []
    if (!datum) errors.push(`Ungultiges Datum: "${datumRaw}"`)
    if (betrag === null) errors.push(`Ungultiger Betrag: "${betragRaw}"`)

    return {
      datum: datum ?? '',
      betrag: betrag ?? 0,
      beschreibung: beschreibungRaw.trim(),
      iban_gegenseite: ibanRaw?.trim() || null,
      buchungsreferenz: referenzRaw?.trim() || null,
      rowIndex: index + 2, // +2 because: +1 for header row, +1 for 1-based
      error: errors.length > 0 ? errors.join('; ') : undefined,
    }
  })
}
