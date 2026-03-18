/**
 * DATEV Buchungsstapel v700 – CSV-Generator
 * Encoding: UTF-8 mit BOM | Trennzeichen: Semikolon
 * https://developer.datev.de/datev/platform/de/dtvf/formate/buchungsstapel
 */

export type DATEVTransaktion = {
  betrag: number
  datum: string           // ISO 'YYYY-MM-DD'
  beschreibung: string | null
  buchungsreferenz: string | null
  // Beleg-Daten (optional, wenn gematcht)
  beleg?: {
    rechnungsnummer: string | null
    lieferant: string | null
    rechnungsdatum: string | null
  } | null
  match_status: string
  workflow_status: string
}

export type DATEVMandant = {
  firmenname: string
  uid_nummer: string | null
  geschaeftsjahr_beginn: number
  beraternummer?: string | null
  mandantennummer?: string | null
}

// DATEV-Datum-Format: DDMM (z.B. 14.03 → 1403)
function formatDATEVDatum(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${day}${month}`
}

// Betrag als positiven Wert + S/H-Kennzeichen (S = Soll/Ausgabe, H = Haben/Eingang)
function formatBetrag(betrag: number): { umsatz: string; sh: 'S' | 'H' } {
  return {
    umsatz: Math.abs(betrag).toFixed(2).replace('.', ','),
    sh: betrag < 0 ? 'S' : 'H',
  }
}

// Feld bereinigen: Semikolons und Zeilenumbrüche entfernen
function clean(value: string | null | undefined, maxLen = 255): string {
  if (!value) return ''
  return value.replace(/[;\r\n]/g, ' ').trim().substring(0, maxLen)
}

export function generateDATEVCSV(
  transaktionen: DATEVTransaktion[],
  mandant: DATEVMandant,
  jahr: number,
  monat: number
): string {
  const datumVon = `01${String(monat).padStart(2, '0')}${jahr}`
  const datumBis = formatDATEVDatum(new Date(jahr, monat, 0).toISOString().split('T')[0]) + String(jahr)
  const wjBeginn = `0101${jahr}` // Vereinfacht: Jänner (DATEV nutzt DDMM)

  // DATEV-Header Zeile 1 (Metadaten)
  const headerLine = [
    '"EXTF"',          // Formatname
    '700',             // Versionsnummer
    '21',              // Datenkategorie (21 = Buchungsstapel)
    '"Buchungsstapel"',
    '7',               // Format-Version
    new Date().toISOString().replace(/[-:T.Z]/g, '').substring(0, 14), // Erstellt am
    '',                // Importiert am (leer)
    '"Belegmanager"',  // Herkunft
    '',                // Exportiert von
    '',
    mandant.beraternummer ?? '00000', // Beraternummer (5-7 Stellen, numerisch)
    mandant.mandantennummer ?? '1',   // Mandantennummer (1-5 Stellen)
    wjBeginn,          // Wirtschaftsjahr-Beginn
    '4',               // Sachkontenlänge
    datumVon,          // Datum von
    datumBis,          // Datum bis
    `"${clean(mandant.firmenname)} ${String(monat).padStart(2, '0')}_${jahr}"`, // Bezeichnung
    '',                // Diktatkürzel
    '1',               // Buchungstyp (1 = Finanzbuchhaltung)
    '0',               // Rechnungslegungszweck
    '0',               // Festschreibung
    '',
  ].join(';')

  // DATEV-Header Zeile 2 (Spaltennamen)
  const columnLine = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Kurs',
    'Basis-Umsatz',
    'WKZ Basis-Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel',
    'Belegdatum',
    'Belegfeld 1',
    'Belegfeld 2',
    'Skonto',
    'Buchungstext',
  ].map(h => `"${h}"`).join(';')

  // Datenzeilen
  const rows = transaktionen.map(t => {
    const { umsatz, sh } = formatBetrag(t.betrag)
    const belegdatum = t.beleg?.rechnungsdatum
      ? formatDATEVDatum(t.beleg.rechnungsdatum)
      : formatDATEVDatum(t.datum)

    const belegfeld1 = clean(t.beleg?.rechnungsnummer, 36)
    const belegfeld2 = clean(t.beleg?.lieferant, 36)

    let buchungstext = clean(t.beschreibung, 60)
    if (t.match_status === 'offen') buchungstext = `OFFEN ${buchungstext}`.substring(0, 60)
    if (t.workflow_status === 'kein_beleg') buchungstext = `KEIN BELEG ${buchungstext}`.substring(0, 60)

    return [
      umsatz,
      sh,
      'EUR',  // Währung
      '',     // Kurs
      '',     // Basis-Umsatz
      '',     // WKZ Basis-Umsatz
      '',     // Konto – intentionally empty; Steuerberater pflegt Sachkonten in DATEV
      '',     // Gegenkonto – intentionally empty
      '',     // BU-Schlüssel
      formatDATEVDatum(t.datum),
      belegfeld1 ? `"${belegfeld1}"` : '',
      belegfeld2 ? `"${belegfeld2}"` : '',
      '',     // Skonto
      buchungstext ? `"${buchungstext}"` : '',
    ].join(';')
  })

  // UTF-8 BOM + Header + Daten zusammenführen
  const BOM = '\uFEFF'
  return BOM + [headerLine, columnLine, ...rows].join('\r\n')
}
