// Types for the Monatsabschluss API responses

export type MonatsStatus = 'offen' | 'in_bearbeitung' | 'abgeschlossen'

export type PruefungAmpel = 'gruen' | 'gelb' | 'rot'

export interface QuellenPruefung {
  quelle_id: string
  quelle_name: string
  typ: string
  kuerzel?: string | null
  hat_transaktionen: boolean
  anzahl_offen: number
}

export interface Pruefung {
  ampel: PruefungAmpel
  quellen: QuellenPruefung[]
  anzahl_offen: number
  anzahl_transaktionen: number
  alle_quellen_haben_import: boolean
  kassa_saldo: number | null
  kassa_saldo_positiv: boolean | null
}

export interface Abschluss {
  id?: string
  mandant_id: string
  jahr: number
  monat: number
  status: MonatsStatus
  abgeschlossen_am?: string | null
  abgeschlossen_von?: string | null
  wiedergeoeffnet_am?: string | null
  wiedergeoeffnet_von?: string | null
  export_vorhanden?: boolean
}

export type Buchfuehrungsart = 'DOPPELT' | 'EAR'

export interface EarPreview {
  ear_zu_nummerieren: number
  ear_privat: number
  ear_quellen_ohne_kuerzel: string[]
}

export interface MonatsDetail {
  abschluss: Abschluss
  pruefung: Pruefung
  buchfuehrungsart: Buchfuehrungsart
  ear?: EarPreview
}

// German month names
export const MONATSNAMEN = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const

export function getMonatsname(monat: number): string {
  return MONATSNAMEN[monat - 1] ?? `Monat ${monat}`
}
