/**
 * Kassabuch PDF-Renderer (@react-pdf/renderer).
 * SSR-only: nutze renderToBuffer() in API Routes, nie im Client.
 */
import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'

type PdfStyle = ReturnType<typeof StyleSheet.create>[string]

export interface KassaBuchungPdfRow {
  lfd_nr_kassa: number | null
  datum: string // 'YYYY-MM-DD'
  kassa_buchungstyp: string | null
  beschreibung: string | null
  einnahme: number | null
  ausgabe: number | null
  laufender_saldo: number
  kategorie: string | null
  is_storno: boolean
}

export interface KassabuchPdfInput {
  mandantName: string
  zeitraumLabel: string
  anfangssaldo: number
  anfangssaldoDatum: string
  endsaldo: number
  endsaldoDatum: string
  summeEinnahmen: number
  summeAusgaben: number
  buchungen: KassaBuchungPdfRow[]
  erstelltAm: Date
  /** Footer-Hinweis (für Archiv-PDFs mit Sperrdatum) */
  gesperrtAm?: Date | null
  /** Zusatz-Gruppen für Jahresbericht: Quartalszeilen zwischen Buchungen */
  quartalsZwischensummen?: Array<{
    quartal: 1 | 2 | 3 | 4
    summeEinnahmen: number
    summeAusgaben: number
    endsaldo: number
    /** Position in buchungen-Array wo nach dieser Buchung die Q-Summe eingefügt wird */
    nachIndex: number
  }>
  hinweisOffeneMonate?: string[]
}

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  headerWrap: {
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    borderBottomStyle: 'solid',
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: '#475569',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    fontSize: 8,
    color: '#64748b',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    borderBottomStyle: 'solid',
    fontSize: 8,
    fontWeight: 700,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    paddingHorizontal: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    borderBottomStyle: 'solid',
  },
  tableRowStorno: {
    backgroundColor: '#fef2f2',
    color: '#9ca3af',
  },
  tableRowSummary: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    borderBottomStyle: 'solid',
    fontWeight: 700,
  },
  tableRowQuartal: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 2,
    backgroundColor: '#fef3c7',
    borderBottomWidth: 0.5,
    borderBottomColor: '#f59e0b',
    borderBottomStyle: 'solid',
    fontWeight: 700,
  },
  col_nr:       { width: '5%',  textAlign: 'right', paddingRight: 3 },
  col_datum:    { width: '10%' },
  col_typ:      { width: '10%' },
  col_besch:    { width: '34%' },
  col_kategorie:{ width: '10%' },
  col_einnahme: { width: '10%', textAlign: 'right' },
  col_ausgabe:  { width: '10%', textAlign: 'right' },
  col_saldo:    { width: '11%', textAlign: 'right', fontWeight: 700 },
  stornoText:   { color: '#9ca3af', textDecoration: 'line-through' },
  footerWrap: {
    marginTop: 16,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    borderTopStyle: 'solid',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
    fontSize: 9,
  },
  footerLabel: { color: '#475569' },
  footerValue: { fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  baoHinweis: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#eef2ff',
    fontSize: 8,
    color: '#3730a3',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 14,
    left: 28,
    right: 28,
    textAlign: 'center',
    fontSize: 7,
    color: '#94a3b8',
  },
  hinweisBox: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#fef3c7',
    fontSize: 8,
    color: '#92400e',
  },
})

function formatBetrag(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDateDE(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d) return iso
  return `${d}.${m}.${y}`
}

function formatDateTimeDE(d: Date): string {
  const date = d.toLocaleDateString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const time = d.toLocaleTimeString('de-AT', {
    hour: '2-digit', minute: '2-digit',
  })
  return `${date} ${time}`
}

const TYP_LABEL: Record<string, string> = {
  EINNAHME:  'Einnahme',
  AUSGABE:   'Ausgabe',
  EINLAGE:   'Einlage',
  ENTNAHME:  'Entnahme',
  STORNO:    'Storno',
  DIFFERENZ: 'Differenz',
}

function KassabuchDocument(props: KassabuchPdfInput): React.ReactElement {
  const {
    mandantName, zeitraumLabel, anfangssaldo, anfangssaldoDatum,
    endsaldo, endsaldoDatum, summeEinnahmen, summeAusgaben, buchungen,
    erstelltAm, gesperrtAm, quartalsZwischensummen, hinweisOffeneMonate,
  } = props

  // Merge buchungen + Quartalszeilen an der richtigen Position (für Jahresbericht)
  const mergedRows: Array<
    | { kind: 'buchung'; row: KassaBuchungPdfRow }
    | { kind: 'quartal'; data: NonNullable<KassabuchPdfInput['quartalsZwischensummen']>[number] }
  > = []

  buchungen.forEach((b, idx) => {
    mergedRows.push({ kind: 'buchung', row: b })
    const q = quartalsZwischensummen?.find(q => q.nachIndex === idx)
    if (q) mergedRows.push({ kind: 'quartal', data: q })
  })

  return (
    <Document>
      <Page size="A4" style={styles.page} orientation="landscape">
        {/* Header */}
        <View style={styles.headerWrap}>
          <Text style={styles.title}>Kassabuch {mandantName}</Text>
          <Text style={styles.subtitle}>Zeitraum: {zeitraumLabel}</Text>
          <View style={styles.metaRow}>
            <Text>Erstellt am {formatDateTimeDE(erstelltAm)}</Text>
            <Text>§ 131 BAO konform</Text>
          </View>
        </View>

        {/* Tabelle */}
        <View style={styles.table}>
          {/* Header-Zeile */}
          <View style={styles.tableHeader}>
            <Text style={styles.col_nr}>Nr.</Text>
            <Text style={styles.col_datum}>Datum</Text>
            <Text style={styles.col_typ}>Typ</Text>
            <Text style={styles.col_besch}>Beschreibung</Text>
            <Text style={styles.col_kategorie}>Kategorie</Text>
            <Text style={styles.col_einnahme}>Einnahme</Text>
            <Text style={styles.col_ausgabe}>Ausgabe</Text>
            <Text style={styles.col_saldo}>Saldo</Text>
          </View>

          {/* Anfangssaldo */}
          <View style={styles.tableRowSummary}>
            <Text style={styles.col_nr}></Text>
            <Text style={styles.col_datum}>{formatDateDE(anfangssaldoDatum)}</Text>
            <Text style={styles.col_typ}></Text>
            <Text style={styles.col_besch}>Anfangssaldo</Text>
            <Text style={styles.col_kategorie}></Text>
            <Text style={styles.col_einnahme}></Text>
            <Text style={styles.col_ausgabe}></Text>
            <Text style={styles.col_saldo}>{formatBetrag(anfangssaldo)}</Text>
          </View>

          {/* Buchungen + Quartalszeilen */}
          {mergedRows.map((entry, i) => {
            if (entry.kind === 'quartal') {
              const q = entry.data
              return (
                <View key={`q-${i}`} style={styles.tableRowQuartal}>
                  <Text style={styles.col_nr}></Text>
                  <Text style={styles.col_datum}></Text>
                  <Text style={styles.col_typ}>Q{q.quartal}</Text>
                  <Text style={styles.col_besch}>Quartalssumme Q{q.quartal}</Text>
                  <Text style={styles.col_kategorie}></Text>
                  <Text style={styles.col_einnahme}>{formatBetrag(q.summeEinnahmen)}</Text>
                  <Text style={styles.col_ausgabe}>{formatBetrag(q.summeAusgaben)}</Text>
                  <Text style={styles.col_saldo}>{formatBetrag(q.endsaldo)}</Text>
                </View>
              )
            }

            const b = entry.row
            const typLabel = b.kassa_buchungstyp
              ? TYP_LABEL[b.kassa_buchungstyp] ?? b.kassa_buchungstyp
              : ''
            const rowStyle = b.is_storno
              ? [styles.tableRow, styles.tableRowStorno]
              : styles.tableRow

            const applyStorno = (base: PdfStyle): PdfStyle | PdfStyle[] =>
              b.is_storno ? [base, styles.stornoText] : base

            return (
              <View key={`b-${i}`} style={rowStyle}>
                <Text style={applyStorno(styles.col_nr)}>
                  {b.lfd_nr_kassa ?? ''}
                </Text>
                <Text style={applyStorno(styles.col_datum)}>
                  {formatDateDE(b.datum)}
                </Text>
                <Text style={applyStorno(styles.col_typ)}>{typLabel}</Text>
                <Text style={applyStorno(styles.col_besch)}>
                  {b.beschreibung ?? ''}
                </Text>
                <Text style={applyStorno(styles.col_kategorie)}>
                  {b.kategorie ?? ''}
                </Text>
                <Text style={applyStorno(styles.col_einnahme)}>
                  {formatBetrag(b.einnahme)}
                </Text>
                <Text style={applyStorno(styles.col_ausgabe)}>
                  {formatBetrag(b.ausgabe)}
                </Text>
                <Text style={applyStorno(styles.col_saldo)}>
                  {formatBetrag(b.laufender_saldo)}
                </Text>
              </View>
            )
          })}

          {/* Endsaldo */}
          <View style={styles.tableRowSummary}>
            <Text style={styles.col_nr}></Text>
            <Text style={styles.col_datum}>{formatDateDE(endsaldoDatum)}</Text>
            <Text style={styles.col_typ}></Text>
            <Text style={styles.col_besch}>Endsaldo</Text>
            <Text style={styles.col_kategorie}></Text>
            <Text style={styles.col_einnahme}></Text>
            <Text style={styles.col_ausgabe}></Text>
            <Text style={styles.col_saldo}>{formatBetrag(endsaldo)}</Text>
          </View>
        </View>

        {/* Leere-Liste Hinweis */}
        {buchungen.length === 0 && (
          <View style={styles.hinweisBox}>
            <Text>Keine Buchungen in diesem Zeitraum.</Text>
          </View>
        )}

        {hinweisOffeneMonate && hinweisOffeneMonate.length > 0 && (
          <View style={styles.hinweisBox}>
            <Text>Hinweis: Folgende Monate sind noch nicht abgeschlossen: {hinweisOffeneMonate.join(', ')}.</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footerWrap}>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Summe Einnahmen</Text>
            <Text style={styles.footerValue}>{formatBetrag(summeEinnahmen)} EUR</Text>
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Summe Ausgaben</Text>
            <Text style={styles.footerValue}>{formatBetrag(summeAusgaben)} EUR</Text>
          </View>
          <View style={styles.footerRow}>
            <Text style={styles.footerLabel}>Endsaldo</Text>
            <Text style={styles.footerValue}>{formatBetrag(endsaldo)} EUR</Text>
          </View>

          {gesperrtAm && (
            <View style={styles.baoHinweis}>
              <Text>
                Kassabuch gesperrt am {formatDateTimeDE(gesperrtAm)} – unveränderlich gemäß § 131 BAO.
              </Text>
            </View>
          )}
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Seite ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}

/**
 * Rendert das Kassabuch als PDF-Buffer.
 */
export async function renderKassabuchPdf(input: KassabuchPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<KassabuchDocument {...input} />)
  return buf as Buffer
}
