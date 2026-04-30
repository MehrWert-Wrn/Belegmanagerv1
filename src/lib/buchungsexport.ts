/**
 * Buchhaltungsübergabe-Export (PROJ-9)
 *
 * Erzeugt eine allgemeine Buchhaltungs-CSV für österreichische Buchhaltungssysteme
 * wie BMD NTCS, RZL, Sage oder manuelle Weiterverarbeitung.
 *
 * Format:
 *   - Trennzeichen:   Semikolon (;)
 *   - Dezimalzeichen: Komma (,)
 *   - Datumsformat:   YYYYMMDD (z.B. 20260430)
 *   - Zeichensatz:    UTF-8 OHNE BOM
 *   - Zeilentrennung: \r\n
 *
 * Spalten (feste Reihenfolge):
 *   belegnr;belegdat;buchdat;betrag;bucod;mwst;steuer;symbol;extbelegnr;text;dokument;verbuchkz;gegenbuchkz
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BuchungsexportBeleg = {
  rechnungstyp?: string | null          // 'eingangsrechnung' | 'ausgangsrechnung' | 'gutschrift' | 'sonstiges' | 'eigenbeleg'
  rechnungsdatum?: string | null        // ISO 'YYYY-MM-DD'
  nettobetrag?: number | null
  mwst_satz?: number | null
  steuerzeilen?: Steuerzeile[] | null
  rechnungsnummer?: string | null
  beschreibung?: string | null
  original_filename?: string | null
  storage_path?: string | null
}

export type Steuerzeile = {
  nettobetrag: number
  mwst_satz: number
  bruttobetrag?: number | null
}

export type BuchungsexportTransaktion = {
  buchungsnummer?: string | null   // PROJ-25; dient als belegnr
  betrag: number                   // Brutto-Bankbetrag (Fallback für ungematchte TX)
  datum: string                    // ISO 'YYYY-MM-DD' (Transaktions-/Buchungsdatum)
  beschreibung?: string | null
  match_status: string             // 'offen' | 'match_bestaetigt' | 'match_vorschlag' | ...
  workflow_status?: string | null  // 'normal' | 'kein_beleg' | ...
  zahlungsquelle_typ?: string | null // 'kontoauszug' | 'kassa' | 'kreditkarte' | 'paypal' | 'sonstige'
  beleg?: BuchungsexportBeleg | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Datum: ISO 'YYYY-MM-DD' -> 'YYYYMMDD'
function formatDatum(iso: string): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// Monatsultimo eines (jahr, monat)-Paars als YYYYMMDD
function monatsultimoYYYYMMDD(jahr: number, monat: number): string {
  const last = new Date(Date.UTC(jahr, monat, 0)) // Tag 0 = letzter Tag des Vormonats
  return formatDatum(last.toISOString().slice(0, 10))
}

// Zahl -> "1234,56" (Komma, 2 Nachkommastellen)
function formatBetrag(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

// Feldtext bereinigen (Semikolons, CR/LF raus, optional auf maxLen kürzen)
function clean(value: string | null | undefined, maxLen = 255): string {
  if (!value) return ''
  return value.replace(/[;\r\n]/g, ' ').trim().substring(0, maxLen)
}

// CSV-Escaping: wenn das Feld ein " enthaelt, muss es verdoppelt und das Feld
// in Anfuehrungszeichen gesetzt werden. Wir produzieren hier aber keine " innerhalb
// der Felder (nach clean() bleibt " erlaubt), daher als Safeguard: escape + quote nur
// wenn noetig. Fuer dieses Format ist das einfache Stripping mittels clean()
// ausreichend (Semikolon/Newline raus); wir verzichten auf Quoting, damit Importer
// das unveraenderte Format lesen.
function field(value: string): string {
  // Sicherheitsnetz: quote nur, wenn ein " vorkommt (unwahrscheinlich nach clean)
  if (value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// Dateiname aus Storage-Pfad ableiten (nur letzter Pfad-Teil, keine Verzeichnisse)
function storagePathToFilename(storagePath: string | null | undefined, fallback: string | null | undefined): string {
  if (storagePath) {
    const parts = storagePath.split('/')
    const last = parts[parts.length - 1]
    if (last) return last
  }
  if (fallback) return fallback
  return ''
}

// Symbol-Ableitung (ER / AR / KA / BK)
function deriveSymbol(tx: BuchungsexportTransaktion): 'ER' | 'AR' | 'KA' | 'BK' {
  // 1. Priorität: rechnungstyp aus Beleg
  const typ = tx.beleg?.rechnungstyp
  if (typ === 'ausgangsrechnung') return 'AR'
  if (typ === 'eingangsrechnung' || typ === 'gutschrift' || typ === 'eigenbeleg' || typ === 'eigenverbrauch') return 'ER'

  // 2. Priorität: Zahlungsquellen-Typ (fallback fuer ungematchte TX oder typ=sonstiges)
  if (tx.zahlungsquelle_typ === 'kassa') return 'KA'
  // alle anderen (kontoauszug, kreditkarte, paypal, sonstige) -> BK
  return 'BK'
}

// Bucod aus dem Vorzeichen des Betrags
// 1 = Soll (positiver Buchungsbetrag, typisch fuer ER/KA/BK-Aufwand)
// 2 = Haben (negativer Buchungsbetrag, typisch fuer AR)
function deriveBucod(betragCsv: number, symbol: 'ER' | 'AR' | 'KA' | 'BK'): '1' | '2' {
  if (symbol === 'AR') return '2'
  if (betragCsv < 0) return '2'
  return '1'
}

// Buchungstext (text-Feld): Beleg-Beschreibung bevorzugt, Fallback = TX-Beschreibung
function deriveText(tx: BuchungsexportTransaktion): string {
  const base = clean(tx.beleg?.beschreibung ?? tx.beschreibung, 40)
  if (tx.workflow_status === 'kein_beleg') {
    return clean(`KEIN BELEG ${clean(tx.beschreibung, 30)}`, 40)
  }
  if (tx.match_status === 'offen') {
    return clean(`OFFEN ${clean(tx.beschreibung, 34)}`, 40)
  }
  return base
}

// ---------------------------------------------------------------------------
// Row Builder
// ---------------------------------------------------------------------------

type Row = {
  belegnr: string
  belegdat: string
  buchdat: string
  betrag: string
  bucod: '1' | '2'
  mwst: string
  steuer: string
  symbol: 'ER' | 'AR' | 'KA' | 'BK'
  extbelegnr: string
  text: string
  dokument: string
  verbuchkz: 'A'
  gegenbuchkz: 'E'
}

const COLUMNS: (keyof Row)[] = [
  'belegnr',
  'belegdat',
  'buchdat',
  'betrag',
  'bucod',
  'mwst',
  'steuer',
  'symbol',
  'extbelegnr',
  'text',
  'dokument',
  'verbuchkz',
  'gegenbuchkz',
]

function rowToCsv(r: Row): string {
  return COLUMNS.map(c => field(String(r[c] ?? ''))).join(';')
}

function buildRowsForTx(
  tx: BuchungsexportTransaktion,
  buchdat: string,
  fallbackLaufnr: number
): Row[] {
  const symbol = deriveSymbol(tx)
  const belegnrBase = tx.buchungsnummer && tx.buchungsnummer.length > 0
    ? tx.buchungsnummer
    : String(fallbackLaufnr)

  const belegdatIso = tx.beleg?.rechnungsdatum ?? tx.datum
  const belegdat = formatDatum(belegdatIso)
  const extbelegnr = clean(tx.beleg?.rechnungsnummer ?? '', 36)

  // Dateiname: {buchungsnummer}_{original_filename} – spiegelt die ZIP-Benennung wider
  const rawFilename = tx.beleg?.original_filename
    ?? storagePathToFilename(tx.beleg?.storage_path, null)
    ?? ''
  const dokument = clean(
    rawFilename ? `${belegnrBase}_${rawFilename}` : '',
    120
  )
  const text = deriveText(tx)

  // Fall 1: KEIN Beleg (offen oder kein_beleg) -> eine Zeile mit Brutto-TX-Betrag
  if (!tx.beleg) {
    const betragNum = tx.betrag
    return [{
      belegnr: belegnrBase,
      belegdat,
      buchdat,
      betrag: formatBetrag(Math.abs(betragNum)),
      bucod: deriveBucod(betragNum, symbol),
      mwst: '0',
      steuer: '0,00',
      symbol,
      extbelegnr,
      text,
      dokument,
      verbuchkz: 'A',
      gegenbuchkz: 'E',
    }]
  }

  // Fall 2: Beleg mit mehreren MwSt-Sätzen -> eine Zeile pro Steuerzeile
  const steuerzeilen = Array.isArray(tx.beleg.steuerzeilen) ? tx.beleg.steuerzeilen : []
  if (steuerzeilen.length >= 2) {
    return steuerzeilen.map((sz, idx) => {
      const netto = Number(sz.nettobetrag)
      const mwst = Number(sz.mwst_satz)
      const steuer = (Math.abs(netto) * mwst) / 100
      return {
        belegnr: `${belegnrBase}_${idx + 1}`,
        belegdat,
        buchdat,
        betrag: formatBetrag(Math.abs(netto)),
        bucod: deriveBucod(netto, symbol),
        mwst: String(mwst),
        steuer: formatBetrag(steuer),
        symbol,
        extbelegnr,
        text,
        dokument,
        verbuchkz: 'A',
        gegenbuchkz: 'E',
      }
    })
  }

  // Fall 3: Beleg mit einem MwSt-Satz -> eine Zeile aus Toplevel-Beleg-Feldern
  const netto = tx.beleg.nettobetrag != null ? Number(tx.beleg.nettobetrag) : tx.betrag
  const mwst = tx.beleg.mwst_satz != null ? Number(tx.beleg.mwst_satz) : 0
  const steuer = (Math.abs(netto) * mwst) / 100
  return [{
    belegnr: belegnrBase,
    belegdat,
    buchdat,
    betrag: formatBetrag(Math.abs(netto)),
    bucod: deriveBucod(netto, symbol),
    mwst: String(mwst),
    steuer: formatBetrag(steuer),
    symbol,
    extbelegnr,
    text,
    dokument,
    verbuchkz: 'A',
    gegenbuchkz: 'E',
  }]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Erzeugt den CSV-Inhalt der Buchhaltungsübergabe für den angegebenen Monat.
 * Rückgabe: UTF-8 CSV-String OHNE BOM.
 */
export function generateBuchungsCSV(
  transaktionen: BuchungsexportTransaktion[],
  jahr: number,
  monat: number
): string {
  const buchdat = monatsultimoYYYYMMDD(jahr, monat)

  // Kopfzeile
  const header = COLUMNS.join(';')

  // Datenzeilen
  const rows: string[] = []
  transaktionen.forEach((tx, i) => {
    const txRows = buildRowsForTx(tx, buchdat, i + 1)
    txRows.forEach(r => rows.push(rowToCsv(r)))
  })

  return [header, ...rows].join('\r\n')
}

/**
 * Zählt die CSV-Zeilen, die der Export erzeugen würde (ohne Kopfzeile).
 * Wird für die Vorschau im UI verwendet – berücksichtigt Multi-MwSt-Expansion.
 */
export function countCsvZeilen(transaktionen: BuchungsexportTransaktion[]): number {
  let count = 0
  for (const tx of transaktionen) {
    if (!tx.beleg) {
      count += 1
      continue
    }
    const steuerzeilen = Array.isArray(tx.beleg.steuerzeilen) ? tx.beleg.steuerzeilen : []
    count += steuerzeilen.length >= 2 ? steuerzeilen.length : 1
  }
  return count
}

/**
 * Erzeugt den Inhalt der LIESMICH.txt für das ZIP-Paket.
 */
export function generateLiesmich(params: {
  firmenname: string
  jahr: number
  monat: number
  exportiertAmIso: string
  exportiertVon: string
  anzahlBelegePdfs: number
  anzahlZeilenGesamt: number
  anzahlMitBeleg: number
  anzahlOhneBeleg: number
  csvDateiname: string
}): string {
  const mm = String(params.monat).padStart(2, '0')
  const datumFormatted = new Date(params.exportiertAmIso).toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return [
    `\uFEFFBUCHHALTUNGSÜBERGABE – ${params.firmenname}`,
    `Monat: ${mm}/${params.jahr}`,
    `Exportiert am: ${datumFormatted} von ${params.exportiertVon}`,
    `System: Belegmanager`,
    ``,
    `INHALT DIESES PAKETS`,
    `--------------------`,
    `CSV-Datei:  ${params.csvDateiname}`,
    `Belege:     ${params.anzahlBelegePdfs} PDF-Dateien im Ordner /belege/`,
    ``,
    `CSV-FORMAT`,
    `----------`,
    `Trennzeichen:     Semikolon (;)`,
    `Dezimalzeichen:   Komma (,)`,
    `Datumsformat:     JJJJMMTT (z.B. 20260430)`,
    `Buchungsdatum:    Immer Monatsultimo (buchdat) – bestimmt Buchungsperiode`,
    `Beträge:          Nettobetrag; MwSt separat in Spalten "mwst" und "steuer"`,
    `Sachkonto/Gegenkonto: Bitte nach Import im Buchhaltungssystem eintragen.`,
    ``,
    `ZEILENTYPEN`,
    `-----------`,
    `symbol=ER  Eingangsrechnung (Lieferantenrechnung)`,
    `symbol=AR  Ausgangsrechnung (eigene Rechnung an Kunden)`,
    `symbol=KA  Kassabuchung (Barzahlung)`,
    `symbol=BK  Bankbuchung (ohne zugeordnetem Beleg)`,
    ``,
    `BELEGBENAMUNG`,
    `-------------`,
    `Belege (PDFs) im Ordner /belege/ sind nach folgendem Schema benannt:`,
    ``,
    `  {Kürzel}_{lfd-Nr}_{MM}_{JJJJ}_{Originaldateiname}`,
    ``,
    `  Kürzel   = Kürzel der Zahlungsquelle (z. B. B1 = Bankkonto 1, K1 = Kasse 1)`,
    `  lfd-Nr   = Laufende Nummer je Zahlungsquelle und Monat (4-stellig, z. B. 0001)`,
    `  MM/JJJJ  = Monat und Jahr des Monatsabschlusses`,
    ``,
    `  Beispiel: B1_0001_02_2026_Rechnung-Mustermann.pdf`,
    `            └ Bankkonto B1, lfd. Nr. 1, Februar 2026`,
    ``,
    `  Dieselbe Buchungsnummer erscheint als "belegnr" in der CSV – so ist`,
    `  jede CSV-Zeile eindeutig einem Beleg im /belege/-Ordner zugeordnet.`,
    ``,
    `CSV-ZEILEN`,
    `----------`,
    `Jede Transaktion erzeugt mindestens eine CSV-Zeile.`,
    `Hat ein Beleg mehrere MwSt-Sätze, entstehen mehrere Zeilen mit Suffix`,
    `_1, _2 usw. an der belegnr (z. B. E_0001_B1_02_2026_1).`,
    ``,
    `OFFENE POSITIONEN`,
    `-----------------`,
    `Zeilen mit "OFFEN" im Text wurden keinem Beleg zugeordnet.`,
    `Bitte manuell prüfen und ggf. Rechnungen nachliefern.`,
    ``,
    `Anzahl Zeilen gesamt:     ${params.anzahlZeilenGesamt}`,
    `Davon mit Beleg:          ${params.anzahlMitBeleg}`,
    `Davon ohne Beleg (offen): ${params.anzahlOhneBeleg}`,
    ``,
  ].join('\r\n')
}

/**
 * Helfer fuer konsistente Dateinamen ueber alle Routes hinweg.
 * z.B. firmaSlug('Müller GmbH') -> 'Muller_GmbH'
 */
export function firmaSlug(firmenname: string): string {
  return firmenname
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30)
}

/**
 * Erzeugt den Dateinamen fuer die CSV.
 */
export function csvDateiname(jahr: number, monat: number, firmenname: string): string {
  const mm = String(monat).padStart(2, '0')
  return `buchungsuebergabe_${jahr}_${mm}_${firmaSlug(firmenname)}.csv`
}

/**
 * Erzeugt den Dateinamen fuer das ZIP-Paket.
 */
export function zipDateiname(jahr: number, monat: number, firmenname: string): string {
  const mm = String(monat).padStart(2, '0')
  return `buchungsuebergabe_${jahr}_${mm}_${firmaSlug(firmenname)}.zip`
}
