/**
 * PROJ-20: FinAPI Bankverbindungen – Frontend Types
 */

export type FinapiVerbindungStatus = 'aktiv' | 'sca_faellig' | 'fehler' | 'getrennt'

export interface SyncHistorieEintrag {
  sync_at: string
  anzahl_importiert: number
  anzahl_duplikate: number
  status: 'erfolg' | 'fehler'
  fehler_meldung: string | null
}

export interface BankVerbindung {
  id: string
  zahlungsquelle_id: string | null
  bank_name: string | null
  iban: string | null
  kontonummer: string | null
  status: FinapiVerbindungStatus
  letzter_sync_at: string | null
  letzter_sync_anzahl: number
  created_at: string
  zahlungsquellen: {
    id: string
    name: string
    typ: string
  } | null
  sync_historie: SyncHistorieEintrag[]
}

export interface SyncErgebnis {
  anzahl_importiert: number
  anzahl_duplikate: number
  anzahl_gesperrte_monate?: number
  gesamt: number
  matching_quote: number
}
