/**
 * PROJ-20: BanksAPI Bankverbindungen – Frontend Types
 */

export type BanksApiVerbindungStatus = 'aktiv' | 'sca_faellig' | 'fehler' | 'getrennt'

export interface BanksApiSyncHistorieEintrag {
  synced_at: string
  anzahl_importiert: number
  anzahl_duplikate: number
  status: 'success' | 'error'
  fehler_meldung: string | null
}

export interface BanksApiVerbindung {
  id: string
  zahlungsquelle_id: string | null
  bank_name: string | null
  iban: string | null
  status: BanksApiVerbindungStatus
  letzter_sync_at: string | null
  letzter_sync_anzahl: number
  created_at: string
  zahlungsquellen: {
    id: string
    name: string
    typ: string
  } | null
  sync_historie: BanksApiSyncHistorieEintrag[]
}

export interface BanksApiSyncErgebnis {
  importiert: number
  duplikate: number
  gesperrte_monate?: number
  gesamt: number
}
