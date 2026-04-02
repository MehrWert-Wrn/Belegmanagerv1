export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      belege: {
        Row: {
          beschreibung: string | null
          bestellnummer: string | null
          bruttobetrag: number | null
          dateityp: string
          eigenbeleg_jahr: number | null
          eigenbeleg_laufnummer: number | null
          erstellt_am: string
          faelligkeitsdatum: string | null
          faelligkeit_bezahlt: boolean
          file_hash: string | null
          geloescht_am: string | null
          id: string
          import_quelle: Database['public']['Enums']['import_quelle']
          kein_beleg_grund: string | null
          lieferant: string | null
          lieferant_iban: string | null
          mandant_id: string
          mandatsreferenz: string | null
          mwst_satz: number | null
          nettobetrag: number | null
          original_filename: string | null
          rechnungsdatum: string | null
          rechnungsname: string | null
          rechnungsnummer: string | null
          rechnungstyp: Database['public']['Enums']['rechnungstyp']
          steuerzeilen: Array<{nettobetrag: number | null, mwst_satz: number | null, bruttobetrag: number | null}> | null
          storage_path: string | null
          uid_lieferant: string | null
          zahlungsreferenz: string | null
          zuordnungsstatus: Database['public']['Enums']['zuordnungsstatus']
        }
        Insert: {
          beschreibung?: string | null
          bestellnummer?: string | null
          bruttobetrag?: number | null
          dateityp?: string
          eigenbeleg_jahr?: number | null
          eigenbeleg_laufnummer?: number | null
          faelligkeitsdatum?: string | null
          faelligkeit_bezahlt?: boolean
          file_hash?: string | null
          id?: string
          import_quelle?: Database['public']['Enums']['import_quelle']
          kein_beleg_grund?: string | null
          lieferant?: string | null
          lieferant_iban?: string | null
          mandant_id: string
          mandatsreferenz?: string | null
          mwst_satz?: number | null
          nettobetrag?: number | null
          original_filename?: string | null
          rechnungsdatum?: string | null
          rechnungsname?: string | null
          rechnungsnummer?: string | null
          rechnungstyp?: Database['public']['Enums']['rechnungstyp']
          steuerzeilen?: Array<{nettobetrag: number | null, mwst_satz: number | null, bruttobetrag: number | null}> | null
          storage_path?: string | null
          uid_lieferant?: string | null
          zahlungsreferenz?: string | null
          zuordnungsstatus?: Database['public']['Enums']['zuordnungsstatus']
        }
        Update: {
          beschreibung?: string | null
          bestellnummer?: string | null
          bruttobetrag?: number | null
          faelligkeitsdatum?: string | null
          faelligkeit_bezahlt?: boolean
          geloescht_am?: string | null
          lieferant?: string | null
          lieferant_iban?: string | null
          mandatsreferenz?: string | null
          mwst_satz?: number | null
          nettobetrag?: number | null
          rechnungsdatum?: string | null
          rechnungsname?: string | null
          rechnungsnummer?: string | null
          rechnungstyp?: Database['public']['Enums']['rechnungstyp']
          uid_lieferant?: string | null
          zahlungsreferenz?: string | null
          zuordnungsstatus?: Database['public']['Enums']['zuordnungsstatus']
        }
      }
      kein_beleg_regeln: {
        Row: {
          id: string
          mandant_id: string
          pattern: string
          erstellt_am: string
        }
        Insert: {
          id?: string
          mandant_id: string
          pattern: string
          erstellt_am?: string
        }
        Update: {
          pattern?: string
        }
      }
      import_protokolle: {
        Row: {
          anzahl_duplikate: number
          anzahl_fehler: number
          anzahl_importiert: number
          dateiname: string
          id: string
          importiert_am: string
          importiert_von: string
          mandant_id: string
          quelle_id: string
        }
        Insert: {
          anzahl_duplikate?: number
          anzahl_fehler?: number
          anzahl_importiert?: number
          dateiname: string
          id?: string
          importiert_von: string
          mandant_id: string
          quelle_id: string
        }
        Update: {
          anzahl_duplikate?: number
          anzahl_fehler?: number
          anzahl_importiert?: number
        }
      }
      mandanten: {
        Row: {
          erstellt_am: string
          firmenname: string
          geschaeftsjahr_beginn: number
          id: string
          land: string
          onboarding_abgeschlossen: boolean
          ort: string | null
          owner_id: string
          plz: string | null
          rechtsform: string | null
          strasse: string | null
          trial_ends_at: string | null
          uid_nummer: string | null
        }
        Insert: {
          firmenname: string
          geschaeftsjahr_beginn?: number
          id?: string
          land?: string
          onboarding_abgeschlossen?: boolean
          ort?: string | null
          owner_id: string
          plz?: string | null
          rechtsform?: string | null
          strasse?: string | null
          trial_ends_at?: string | null
          uid_nummer?: string | null
        }
        Update: {
          firmenname?: string
          geschaeftsjahr_beginn?: number
          land?: string
          onboarding_abgeschlossen?: boolean
          ort?: string | null
          plz?: string | null
          rechtsform?: string | null
          strasse?: string | null
          trial_ends_at?: string | null
          uid_nummer?: string | null
        }
      }
      billing_plans: {
        Row: {
          id: string
          name: string
          amount_cents: number
          currency: string
          interval: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          amount_cents: number
          currency?: string
          interval?: string
          active?: boolean
        }
        Update: {
          name?: string
          amount_cents?: number
          currency?: string
          interval?: string
          active?: boolean
        }
      }
      billing_subscriptions: {
        Row: {
          id: string
          mandant_id: string
          plan_id: string | null
          status: string
          gc_mandate_id: string | null
          gc_subscription_id: string | null
          gc_customer_id: string | null
          gc_billing_request_id: string | null
          current_period_end: string | null
          payment_failed_at: string | null
          cancelled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          mandant_id: string
          plan_id?: string | null
          status?: string
          gc_mandate_id?: string | null
          gc_subscription_id?: string | null
          gc_customer_id?: string | null
          gc_billing_request_id?: string | null
          current_period_end?: string | null
          payment_failed_at?: string | null
          cancelled_at?: string | null
        }
        Update: {
          status?: string
          gc_mandate_id?: string | null
          gc_subscription_id?: string | null
          gc_customer_id?: string | null
          gc_billing_request_id?: string | null
          current_period_end?: string | null
          payment_failed_at?: string | null
          cancelled_at?: string | null
          updated_at?: string
        }
      }
      billing_payments: {
        Row: {
          id: string
          mandant_id: string
          subscription_id: string | null
          gc_payment_id: string
          amount_cents: number
          currency: string
          status: string
          charge_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          mandant_id: string
          subscription_id?: string | null
          gc_payment_id: string
          amount_cents: number
          currency?: string
          status?: string
          charge_date?: string | null
        }
        Update: {
          status?: string
          charge_date?: string | null
        }
      }
      transaktions_kommentare: {
        Row: {
          id: string
          transaktion_id: string
          mandant_id: string
          user_id: string
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          transaktion_id: string
          mandant_id: string
          user_id: string
          text: string
          created_at?: string
        }
        Update: Record<never, never>
      }
      transaktionen: {
        Row: {
          beschreibung: string | null
          betrag: number
          bic_gegenseite: string | null
          buchungsreferenz: string | null
          datum: string
          erstellt_am: string
          iban_gegenseite: string | null
          id: string
          mandant_id: string
          match_score: number | null
          match_status: Database['public']['Enums']['match_status']
          mwst_satz: number | null
          quelle_id: string
          workflow_status: Database['public']['Enums']['workflow_status']
        }
        Insert: {
          beschreibung?: string | null
          betrag: number
          bic_gegenseite?: string | null
          buchungsreferenz?: string | null
          datum: string
          iban_gegenseite?: string | null
          id?: string
          mandant_id: string
          match_score?: number | null
          match_status?: Database['public']['Enums']['match_status']
          mwst_satz?: number | null
          quelle_id: string
          workflow_status?: Database['public']['Enums']['workflow_status']
        }
        Update: {
          beschreibung?: string | null
          betrag?: number
          match_score?: number | null
          match_status?: Database['public']['Enums']['match_status']
          mwst_satz?: number | null
          workflow_status?: Database['public']['Enums']['workflow_status']
        }
      }
      mandant_users: {
        Row: {
          id: string
          mandant_id: string
          user_id: string | null
          email: string
          rolle: 'admin' | 'buchhalter'
          aktiv: boolean
          eingeladen_am: string
          einladung_angenommen_am: string | null
          einladung_token: string | null
          einladung_gueltig_bis: string | null
        }
        Insert: {
          id?: string
          mandant_id: string
          user_id?: string | null
          email: string
          rolle: 'admin' | 'buchhalter'
          aktiv?: boolean
          eingeladen_am?: string
          einladung_angenommen_am?: string | null
          einladung_token?: string | null
          einladung_gueltig_bis?: string | null
        }
        Update: {
          rolle?: 'admin' | 'buchhalter'
          aktiv?: boolean
          user_id?: string | null
          einladung_angenommen_am?: string | null
          einladung_token?: string | null
          einladung_gueltig_bis?: string | null
        }
      }
      zahlungsquellen: {
        Row: {
          aktiv: boolean
          csv_mapping: Json | null
          erstellt_am: string
          iban: string | null
          id: string
          mandant_id: string
          name: string
          typ: Database['public']['Enums']['zahlungsquelle_typ']
        }
        Insert: {
          aktiv?: boolean
          csv_mapping?: Json | null
          iban?: string | null
          id?: string
          mandant_id: string
          name: string
          typ: Database['public']['Enums']['zahlungsquelle_typ']
        }
        Update: {
          aktiv?: boolean
          csv_mapping?: Json | null
          iban?: string | null
          name?: string
        }
      }
    }
    Enums: {
      match_status: 'offen' | 'vorgeschlagen' | 'bestaetigt' | 'kein_beleg'
      rechnungstyp: 'eingangsrechnung' | 'ausgangsrechnung' | 'gutschrift' | 'sonstiges' | 'eigenbeleg'
      import_quelle: 'manuell' | 'n8n_import'
      workflow_status: 'normal' | 'rueckfrage' | 'erledigt'
      zahlungsquelle_typ: 'kontoauszug' | 'kassa' | 'kreditkarte' | 'paypal' | 'sonstige'
      zuordnungsstatus: 'offen' | 'zugeordnet'
    }
    Functions: {
      get_mandant_id: { Args: Record<never, never>; Returns: string }
      get_user_rolle: { Args: Record<never, never>; Returns: string }
    }
  }
}

// Convenience-Types
export type Beleg = Database['public']['Tables']['belege']['Row']
export type BelegInsert = Database['public']['Tables']['belege']['Insert']
export type BelegUpdate = Database['public']['Tables']['belege']['Update']
export type Mandant = Database['public']['Tables']['mandanten']['Row']
export type Transaktion = Database['public']['Tables']['transaktionen']['Row']
export type TransaktionInsert = Database['public']['Tables']['transaktionen']['Insert']
export type Zahlungsquelle = Database['public']['Tables']['zahlungsquellen']['Row']
export type ImportProtokoll = Database['public']['Tables']['import_protokolle']['Row']
export type Zuordnungsstatus = Database['public']['Enums']['zuordnungsstatus']
export type MatchStatus = Database['public']['Enums']['match_status']
export type WorkflowStatus = Database['public']['Enums']['workflow_status']
export type ZahlungsquelleTyp = Database['public']['Enums']['zahlungsquelle_typ']
export type Rechnungstyp = Database['public']['Enums']['rechnungstyp']
export type ImportQuelle = Database['public']['Enums']['import_quelle']

// MandantUser type
export type MandantUser = Database['public']['Tables']['mandant_users']['Row']
export type MandantUserInsert = Database['public']['Tables']['mandant_users']['Insert']
export type UserRolle = 'admin' | 'buchhalter'

// API response type for benutzer list
export type BenutzerListItem = {
  id: string
  user_id: string | null
  email: string
  name: string | null
  rolle: UserRolle
  aktiv: boolean
  eingeladen_am: string
  einladung_angenommen_am: string | null
  last_sign_in_at: string | null
}

// Kommentar on a transaction
export type TransaktionsKommentar = {
  id: string
  text: string
  created_at: string
  user_email: string
  is_own: boolean
}

// Transaktionen with joined relations (from /api/transaktionen)
export type TransaktionWithRelations = Transaktion & {
  beleg_id: string | null
  match_type: string | null
  belege: {
    lieferant: string | null
    rechnungsnummer: string | null
    bruttobetrag: number | null
  } | null
  zahlungsquellen: {
    name: string
    typ: ZahlungsquelleTyp
  } | null
}
