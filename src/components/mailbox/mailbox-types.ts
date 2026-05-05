/**
 * PROJ-32: Natives Mandanten-Postfach - Shared TypeScript Types
 *
 * Diese Types werden vom Frontend genutzt um die Verbindungs-Status
 * und Konfiguration der Mailbox-Anbindung darzustellen. Die Backend-
 * Routen liefern Daten in diesem Format zurueck (siehe API-Routen
 * in der Feature-Spec PROJ-32).
 */

export type MailboxProvider = 'imap' | 'gmail' | 'microsoft'

export type MailboxStatus = 'active' | 'error' | 'paused'

/**
 * Status-Felder einer Mailbox-Verbindung.
 * Achtung: encrypted_payload wird NIE an das Frontend ausgeliefert.
 */
export interface MailboxVerbindung {
  id: string
  mandant_id: string
  provider: MailboxProvider
  status: MailboxStatus
  /** Anzeige-Adresse (E-Mail) – fuer Status-Card */
  email_adresse: string | null
  ordner_filter: string[]
  import_seit: string // ISO-Date
  ki_klassifizierung_aktiv: boolean
  last_polled_at: string | null
  last_successful_poll_at: string | null
  consecutive_error_count: number
  error_message: string | null
  created_at: string
  updated_at: string
}

/**
 * Eingabe-Daten fuer das IMAP-Formular.
 * Wird sowohl fuer den Test (Modus A) als auch fuer das Speichern verwendet.
 */
export interface ImapFormularDaten {
  host: string
  port: number
  ssl: boolean
  email: string
  password: string
  ordner: string
}

/**
 * Antwort des Verbindungstest-Endpoints.
 */
export interface MailboxTestErgebnis {
  erfolg: boolean
  meldung: string
  /** Optional: Wenn der Test erfolgreich war, kann die App eine Liste verfuegbarer Ordner liefern. */
  verfuegbare_ordner?: string[]
}

/**
 * Verfuegbare Ordner / Labels der verbundenen Mailbox.
 */
export interface MailboxOrdnerListe {
  ordner: string[]
}
