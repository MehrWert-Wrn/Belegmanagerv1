/**
 * Kassabuch CSV Export (österreichisches Format)
 * - UTF-8 mit BOM (Excel-Kompatibilität)
 * - Semikolon als Feldtrenner
 * - Dezimalkomma statt Punkt
 * - Zwei Nachkommastellen
 */

export interface KassaBuchungRow {
  lfd_nr_kassa: number | null
  datum: string // 'YYYY-MM-DD'
  kassa_buchungstyp: string | null
  beschreibung: string | null
  betrag: number
  laufender_saldo: number
  kategorie: string | null
}

const UTF8_BOM = '﻿'

const BUCHUNGSTYP_LABEL: Record<string, string> = {
  EINNAHME:  'Einnahme',
  AUSGABE:   'Ausgabe',
  EINLAGE:   'Einlage',
  ENTNAHME:  'Entnahme',
  STORNO:    'Storno',
  DIFFERENZ: 'Differenz',
}

function formatBetragAT(betrag: number): string {
  // Österreichisches Format: 1234.56 → "1234,56"
  return betrag.toFixed(2).replace('.', ',')
}

function formatDateAT(isoDate: string): string {
  // 'YYYY-MM-DD' → 'DD.MM.YYYY'
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}.${m}.${y}`
}

function escapeCsvField(raw: string | null | undefined): string {
  const val = raw ?? ''
  // Wenn Semikolon, Anführungszeichen oder Zeilenumbruch enthalten → quoten
  if (/[";\n\r]/.test(val)) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

interface QuartalsZwischensumme {
  quartal: 1 | 2 | 3 | 4
  summeEinnahmen: number
  summeAusgaben: number
  endsaldo: number
  nachIndex: number
}

interface BuildCsvInput {
  mandantName: string
  zeitraumLabel: string
  anfangssaldo: number
  anfangssaldoDatum: string
  endsaldo: number
  endsaldoDatum: string
  summeEinnahmen: number
  summeAusgaben: number
  buchungen: KassaBuchungRow[]
  quartalsZwischensummen?: QuartalsZwischensumme[]
  hinweisOffeneMonate?: string[]
}

export function buildKassabuchCsv(input: BuildCsvInput): string {
  const { mandantName, zeitraumLabel, anfangssaldo, anfangssaldoDatum,
          endsaldo, endsaldoDatum, summeEinnahmen, summeAusgaben, buchungen,
          quartalsZwischensummen, hinweisOffeneMonate } = input

  const SEP = ';'

  const header = [
    'Lfd.Nr.',
    'Datum',
    'Buchungstyp',
    'Beschreibung',
    'Einnahme',
    'Ausgabe',
    'Laufender Saldo',
    'Kategorie',
  ]

  const lines: string[] = []

  // Titel-Zeile (als Kommentar für den Leser)
  lines.push(
    escapeCsvField(`Kassabuch ${mandantName} – ${zeitraumLabel}`)
  )
  lines.push('') // Leerzeile

  // Header
  lines.push(header.join(SEP))

  // Anfangssaldo-Zeile
  lines.push([
    '',
    formatDateAT(anfangssaldoDatum),
    'Anfangssaldo',
    'Anfangssaldo',
    '',
    '',
    formatBetragAT(anfangssaldo),
    '',
  ].map(escapeCsvField).join(SEP))

  // Buchungen (mit optionalen Quartals-Zwischensummen für Jahresbericht)
  const quartalNachIndex = new Map<number, QuartalsZwischensumme>(
    (quartalsZwischensummen ?? []).map(q => [q.nachIndex, q])
  )

  for (let i = 0; i < buchungen.length; i++) {
    const b = buchungen[i]
    const isEinnahme = b.betrag > 0
    const einnahme = isEinnahme ? formatBetragAT(b.betrag) : ''
    const ausgabe  = !isEinnahme ? formatBetragAT(Math.abs(b.betrag)) : ''
    const typLabel = b.kassa_buchungstyp
      ? BUCHUNGSTYP_LABEL[b.kassa_buchungstyp] ?? b.kassa_buchungstyp
      : ''

    lines.push([
      b.lfd_nr_kassa !== null ? String(b.lfd_nr_kassa) : '',
      formatDateAT(b.datum),
      typLabel,
      b.beschreibung ?? '',
      einnahme,
      ausgabe,
      formatBetragAT(b.laufender_saldo),
      b.kategorie ?? '',
    ].map(escapeCsvField).join(SEP))

    // Quartals-Zwischensumme nach diesem Index einfügen (BUG-PROJ7-16)
    const q = quartalNachIndex.get(i)
    if (q) {
      lines.push('') // Leerzeile vor Quartal
      lines.push([
        '', '', '',
        `Q${q.quartal} Summe`,
        formatBetragAT(q.summeEinnahmen),
        formatBetragAT(q.summeAusgaben),
        formatBetragAT(q.endsaldo),
        '',
      ].map(escapeCsvField).join(SEP))
    }
  }

  // Endsaldo-Zeile
  lines.push([
    '',
    formatDateAT(endsaldoDatum),
    'Endsaldo',
    'Endsaldo',
    '',
    '',
    formatBetragAT(endsaldo),
    '',
  ].map(escapeCsvField).join(SEP))

  // Leerzeile + Summenzeilen
  lines.push('')
  lines.push([
    '',
    '',
    '',
    'Summe Einnahmen',
    formatBetragAT(summeEinnahmen),
    '',
    '',
    '',
  ].map(escapeCsvField).join(SEP))
  lines.push([
    '',
    '',
    '',
    'Summe Ausgaben',
    '',
    formatBetragAT(summeAusgaben),
    '',
    '',
  ].map(escapeCsvField).join(SEP))

  // BUG-PROJ7-17: Offene-Monate-Hinweis im Jahresbericht
  if (hinweisOffeneMonate && hinweisOffeneMonate.length > 0) {
    lines.push('')
    lines.push(escapeCsvField(`Hinweis: Folgende Monate sind noch nicht abgeschlossen: ${hinweisOffeneMonate.join(', ')}`))
  }

  return UTF8_BOM + lines.join('\r\n') + '\r\n'
}
