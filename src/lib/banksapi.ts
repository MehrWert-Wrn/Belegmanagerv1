/**
 * BanksAPI Service – PROJ-20
 *
 * Spricht den BanksAPI-Mandanten (z.B. "mehrwerttest") an und kapselt:
 * - OAuth2 Management-/User-Tokens
 * - User-Anlage (pro Mandant ein BanksAPI-Subuser)
 * - Bankzugang ueber hosted UI (REG/Protect) starten
 * - Bankzugaenge + Konten + Umsaetze abrufen
 * - AES-256-GCM Verschluesselung des Subuser-Passworts
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getConfig() {
  const baseUrl = (process.env.BANKSAPI_BASE_URL ?? 'https://banksapi.io').replace(/\/$/, '')
  const tenant = process.env.BANKSAPI_TENANT
  const authorization = process.env.BANKSAPI_AUTHORIZATION
  const encryptionKey = process.env.BANKSAPI_ENCRYPTION_KEY

  if (!tenant) {
    throw new Error('Missing BANKSAPI_TENANT')
  }
  if (!authorization) {
    throw new Error('Missing BANKSAPI_AUTHORIZATION')
  }
  if (!encryptionKey) {
    throw new Error('Missing BANKSAPI_ENCRYPTION_KEY')
  }

  return { baseUrl, tenant, authorization, encryptionKey }
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

function deriveKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

export function encrypt(plaintext: string): string {
  const { encryptionKey } = getConfig()
  const key = deriveKey(encryptionKey)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const { encryptionKey } = getConfig()
  const key = deriveKey(encryptionKey)
  const parts = ciphertext.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(parts[0], 'hex')
  const tag = Buffer.from(parts[1], 'hex')
  const encrypted = Buffer.from(parts[2], 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

// ---------------------------------------------------------------------------
// Token Management
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope?: string
}

let managementTokenCache: { token: string; expiresAt: number } | null = null

/**
 * Liefert ein Management-Access-Token (grant_type=client_credentials).
 * Wird fuer Anlage neuer User benoetigt.
 */
export async function getManagementToken(): Promise<string> {
  const now = Date.now()
  if (managementTokenCache && managementTokenCache.expiresAt > now + 30_000) {
    return managementTokenCache.token
  }

  const { baseUrl, authorization } = getConfig()
  const res = await fetch(`${baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authorization,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BanksAPI management token failed (${res.status}): ${text}`)
  }

  const data: TokenResponse = await res.json()
  managementTokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }
  return data.access_token
}

/**
 * Liefert ein User-Access-Token (grant_type=password) fuer einen
 * BanksAPI-Subuser (Mandant).
 */
export async function getUserToken(username: string, password: string): Promise<string> {
  const { baseUrl, authorization } = getConfig()
  const res = await fetch(`${baseUrl}/auth/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: authorization,
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username,
      password,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BanksAPI user token failed (${res.status}): ${text}`)
  }

  const data: TokenResponse = await res.json()
  return data.access_token
}

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen neuen BanksAPI-Subuser im konfigurierten Tenant.
 * 201 Created bei Erfolg, 409 Conflict wenn der User bereits existiert.
 */
export async function createBanksApiUser(username: string, password: string): Promise<void> {
  const { baseUrl, tenant } = getConfig()
  const token = await getManagementToken()

  const res = await fetch(`${baseUrl}/auth/mgmt/v1/tenants/${encodeURIComponent(tenant)}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username, password }),
  })

  if (res.status === 201 || res.status === 200) return
  if (res.status === 409) return // User existiert bereits – das ist ok.

  const text = await res.text()
  throw new Error(`BanksAPI create user failed (${res.status}): ${text}`)
}

/**
 * Generiert einen sicheren Username + Passwort fuer einen Mandanten.
 */
export function generateBanksApiCredentials(): { username: string; password: string } {
  const username = `bm_${randomUUID().replace(/-/g, '')}`
  // Passwort mit hoher Entropie (32 Bytes -> ~43 base64url-Zeichen).
  const password = randomBytes(32).toString('base64url')
  return { username, password }
}

// ---------------------------------------------------------------------------
// Bankzugaenge / Hosted UI
// ---------------------------------------------------------------------------

/**
 * Loescht alle laufenden REG/Protect-Sessions des Users.
 * Muss VOR createBankAccess aufgerufen werden, sonst liefert BanksAPI 400 statt 451.
 */
export async function deleteRegProtectSessions(userToken: string): Promise<void> {
  const { baseUrl } = getConfig()
  // Fehler werden ignoriert – wenn keine Sessions vorhanden sind, kommt trotzdem 200.
  await fetch(`${baseUrl}/customer/v2/regprotect/sessions`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  }).catch(() => null)
}

/**
 * Startet einen neuen Bankzugang ueber das hosted UI von BanksAPI (REG/Protect).
 *
 * Wichtig: Vor diesem Aufruf muessen alte REG/Protect-Sessions geloescht werden
 * (deleteRegProtectSessions), sonst antwortet BanksAPI mit 400 statt 451.
 *
 * Der Request-Body ist ein Objekt { [uuid]: {} } – der UUID-Key wird als Access-ID
 * des neuen Bankzugangs verwendet.
 *
 * BanksAPI antwortet mit HTTP 451 + Location-Header (URL des REG/Protect-UI).
 */
export async function createBankAccess(userToken: string, customerIp?: string): Promise<string> {
  const { baseUrl } = getConfig()
  const accessUuid = randomUUID()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${userToken}`,
  }
  if (customerIp) {
    headers['Customer-IP-Address'] = customerIp
  }

  const res = await fetch(`${baseUrl}/customer/v2/bankzugaenge`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ [accessUuid]: {} }),
    redirect: 'manual',
  })

  // BanksAPI liefert 451 mit Location-Header zur hosted UI.
  if (res.status === 451 || res.status === 302 || res.status === 303) {
    const location = res.headers.get('location')
    if (!location) {
      throw new Error('BanksAPI createBankAccess: kein Location-Header in der Antwort')
    }
    return location
  }

  const text = await res.text().catch(() => '')
  throw new Error(`BanksAPI createBankAccess failed (${res.status}): ${text}`)
}

// ---------------------------------------------------------------------------
// Bankzugaenge & Konten (Read)
// ---------------------------------------------------------------------------

export interface BanksApiBankzugang {
  id: string           // UUID des Bankzugangs (= access-id)
  providerId?: string
  status?: string      // "VOLLSTAENDIG" | "FEHLERHAFT" | ...
  bankprodukte: BanksApiKonto[]
}

export interface BanksApiKonto {
  id: string           // IBAN wird als product-id verwendet
  iban?: string
  bezeichnung?: string // Kontobezeichnung
  kreditinstitut?: string
  inhaber?: string
  kategorie?: string   // "GIROKONTO" | "TAGESGELDKONTO" | ...
  saldo?: number
}

/**
 * Liefert alle Bankzugaenge des aktuellen Users.
 *
 * BanksAPI antwortet mit einem Objekt { [accessId]: BankAccess }, NICHT einem Array.
 */
export async function getBankConnections(userToken: string): Promise<BanksApiBankzugang[]> {
  const { baseUrl } = getConfig()
  const res = await fetch(`${baseUrl}/customer/v2/bankzugaenge`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BanksAPI getBankConnections failed (${res.status}): ${text}`)
  }

  const raw = await res.json()
  // Response ist ein Objekt { [accessId]: { id, bankprodukte, status, ... } }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.values(raw) as BanksApiBankzugang[]
  }
  // Fallback fuer unerwartete Strukturen
  if (Array.isArray(raw)) return raw as BanksApiBankzugang[]
  return []
}

// ---------------------------------------------------------------------------
// Transaktionen
// ---------------------------------------------------------------------------

export interface BanksApiTransaktion {
  id?: string
  primanotaNummer?: string
  buchungsdatum?: string
  wertstellungsdatum?: string
  betrag?: number | string
  waehrung?: string
  verwendungszweck?: string | null
  gegenkontoInhaber?: string | null
  gegenkontoIban?: string | null
  gegenkontoBic?: string | null
}

interface TransaktionenResponse {
  kontoumsaetze?: BanksApiTransaktion[]
  items?: BanksApiTransaktion[]
}

/**
 * Liefert Kontoumsaetze fuer einen Bankzugang + Produkt.
 *
 * @param fromDate - ISO 8601 datetime (z.B. "2025-01-01T00:00:00") – filtert Buchungsdatum >= fromDate.
 *                   Wenn weggelassen: BanksAPI liefert bis zu 90 Tage zurueck.
 */
export async function getTransactions(
  userToken: string,
  accessId: string,
  productId: string,
  fromDate?: string,
): Promise<BanksApiTransaktion[]> {
  const { baseUrl } = getConfig()
  const params = new URLSearchParams()
  if (fromDate) params.set('from', fromDate)

  const query = params.toString()
  const url = `${baseUrl}/customer/v2/bankzugaenge/${encodeURIComponent(accessId)}/${encodeURIComponent(productId)}/kontoumsaetze${query ? `?${query}` : ''}`

  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${userToken}` },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`BanksAPI getTransactions failed (${res.status}): ${text}`)
  }

  const raw = (await res.json()) as TransaktionenResponse | BanksApiTransaktion[]
  if (Array.isArray(raw)) return raw
  return raw?.kontoumsaetze ?? raw?.items ?? []
}

// ---------------------------------------------------------------------------
// Normalisierung
// ---------------------------------------------------------------------------

export interface NormalizedBanksApiTransaktion {
  mandant_id: string
  quelle_id: string
  datum: string
  betrag: number
  beschreibung: string | null
  iban_gegenseite: string | null
  bic_gegenseite: string | null
  buchungsreferenz: string | null
  externe_id: string
  import_quelle: 'banksapi'
}

/**
 * Normalisiert eine BanksAPI-Transaktion in unser transaktionen-Schema.
 *
 * Hinweis: Die transaktionen-Tabelle hat kein eigenes Empfaenger-Feld.
 * Wir kombinieren gegenkontoInhaber + verwendungszweck in beschreibung.
 */
export function normalizeTransaction(
  t: BanksApiTransaktion,
  zahlungsquelleId: string,
  mandantId: string,
): NormalizedBanksApiTransaktion {
  // BanksAPI liefert Datum im Format "2025-11-17 00:00:00" (Leerzeichen, kein 'T').
  const datum = (t.buchungsdatum ?? t.wertstellungsdatum ?? '').split(' ')[0]
  const betrag = typeof t.betrag === 'string' ? parseFloat(t.betrag) : (t.betrag ?? 0)
  // t.id ist ein UUID, eindeutig im Scope access-id + product-id – fuer uns global eindeutig genug.
  const externeIdQuelle = t.id ?? t.primanotaNummer ?? `${datum}_${betrag}_${t.verwendungszweck ?? ''}`

  // Beschreibung aus Empfaenger + Verwendungszweck zusammenbauen
  const parts: string[] = []
  if (t.gegenkontoInhaber) parts.push(t.gegenkontoInhaber)
  if (t.verwendungszweck) parts.push(t.verwendungszweck)
  const beschreibung = parts.join(' – ') || null

  return {
    mandant_id: mandantId,
    quelle_id: zahlungsquelleId,
    datum,
    betrag,
    beschreibung,
    iban_gegenseite: t.gegenkontoIban ?? null,
    bic_gegenseite: t.gegenkontoBic ?? null,
    buchungsreferenz: t.primanotaNummer ?? null,
    externe_id: `banksapi_${externeIdQuelle}`,
    import_quelle: 'banksapi',
  }
}
