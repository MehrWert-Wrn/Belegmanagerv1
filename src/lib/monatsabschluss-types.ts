// Types for the Monatsabschluss API responses

export type MonatsStatus = 'offen' | 'in_bearbeitung' | 'abgeschlossen'

export type PruefungAmpel = 'gruen' | 'gelb' | 'rot'

export interface QuellenPruefung {
  quelle_id: string
  quelle_name: string
  typ: string
  hat_transaktionen: boolean
}

export interface Pruefung {
  ampel: PruefungAmpel
  quellen: QuellenPruefung[]
  anzahl_offen: number
  anzahl_transaktionen: number
  alle_quellen_haben_import: boolean
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
  datev_export_vorhanden?: boolean
}

export interface MonatsDetail {
  abschluss: Abschluss
  pruefung: Pruefung
}

// German month names
export const MONATSNAMEN = [
  'Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const

export function getMonatsname(monat: number): string {
  return MONATSNAMEN[monat - 1] ?? `Monat ${monat}`
}
