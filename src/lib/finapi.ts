/**
 * FinAPI Service – PROJ-20
 *
 * Handles all communication with FinAPI Access API and WebForm 2.0.
 * Environment: controlled via FINAPI_ENV (sandbox / live), no code changes needed.
 *
 * Security:
 * - FinAPI user passwords are AES-256-GCM encrypted at rest
 * - Client credentials and encryption key come from environment variables
 * - All API calls happen server-side only
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function getConfig() {
  const env = process.env.FINAPI_ENV || 'sandbox'

  const baseUrl = env === 'live'
    ? 'https://api.finapi.io'
    : 'https://sandbox.finapi.io'

  const webformUrl = env === 'live'
    ? 'https://webform.finapi.io'
    : 'https://webform-sandbox.finapi.io'

  const clientId = process.env.FINAPI_CLIENT_ID
  const clientSecret = process.env.FINAPI_CLIENT_SECRET
  const encryptionKey = process.env.FINAPI_ENCRYPTION_KEY

  if (!clientId || !clientSecret) {
    throw new Error('Missing FINAPI_CLIENT_ID or FINAPI_CLIENT_SECRET')
  }

  if (!encryptionKey) {
    throw new Error('Missing FINAPI_ENCRYPTION_KEY')
  }

  return { env, baseUrl, webformUrl, clientId, clientSecret, encryptionKey }
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16

/**
 * Derive a 32-byte key from the FINAPI_ENCRYPTION_KEY.
 * If the key is already 64 hex chars (32 bytes), use it directly.
 * Otherwise hash it (but we prefer exact-length keys).
 */
function deriveKey(raw: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  // Fallback: use first 32 bytes of a SHA-256 hash
  return createHash('sha256').update(raw).digest()
}

export function encrypt(plaintext: string): string {
  const { encryptionKey } = getConfig()
  const key = deriveKey(encryptionKey)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
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
  scope: string
}

// Simple in-memory token cache (per serverless invocation)
let clientTokenCache: { token: string; expiresAt: number } | null = null

/**
 * Get a client-level access token (for user management).
 */
export async function getClientToken(): Promise<string> {
  const now = Date.now()
  if (clientTokenCache && clientTokenCache.expiresAt > now + 30_000) {
    return clientTokenCache.token
  }

  const config = getConfig()
  const res = await fetch(`${config.baseUrl}/api/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI client token failed (${res.status}): ${text}`)
  }

  const data: TokenResponse = await res.json()
  clientTokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }

  return data.access_token
}

/**
 * Get a user-level access token (for bank connections + transactions).
 */
export async function getUserToken(finapiUserId: string, encryptedPassword: string): Promise<string> {
  const config = getConfig()
  const password = decrypt(encryptedPassword)

  const res = await fetch(`${config.baseUrl}/api/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      username: finapiUserId,
      password,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI user token failed (${res.status}): ${text}`)
  }

  const data: TokenResponse = await res.json()
  return data.access_token
}

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

/**
 * Create a new FinAPI user for a mandant.
 * Returns the user ID and the raw password (caller must encrypt before storing).
 */
export async function createFinAPIUser(mandantId: string): Promise<{ userId: string; password: string }> {
  const config = getConfig()
  const clientToken = await getClientToken()

  // Generate a unique user ID and strong password
  const userId = `bm_${mandantId.replace(/-/g, '').substring(0, 16)}_${Date.now()}`
  const password = randomBytes(24).toString('base64url')

  const res = await fetch(`${config.baseUrl}/api/v2/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${clientToken}`,
    },
    body: JSON.stringify({
      id: userId,
      password,
      email: `finapi-${mandantId}@belegmanager.at`,
      isAutoUpdateEnabled: false,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI create user failed (${res.status}): ${text}`)
  }

  return { userId, password }
}

/**
 * Delete a FinAPI user (cleanup).
 */
export async function deleteFinAPIUser(finapiUserId: string, encryptedPassword: string): Promise<void> {
  const config = getConfig()
  const userToken = await getUserToken(finapiUserId, encryptedPassword)

  const res = await fetch(`${config.baseUrl}/api/v2/users`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI delete user failed (${res.status}): ${text}`)
  }
}

// ---------------------------------------------------------------------------
// WebForm 2.0 – Bank Connection Import
// ---------------------------------------------------------------------------

interface WebFormResponse {
  id: string
  url: string
  status: string
}

/**
 * Appends redirect URLs as query parameters to a FinAPI WebForm URL.
 *
 * Per FinAPI WebForm 2.0 docs ("For Best Results"):
 * - redirectUrl      → user redirect on successful completion (GET)
 * - errorRedirectUrl → user redirect on unexpected error (GET)
 * - abortRedirectUrl → user redirect when user cancels (GET)
 *
 * These are appended to the WebForm URL itself, NOT sent in the POST body.
 * The POST body's callbacks.finalised is a server-to-server webhook (POST),
 * which is a separate mechanism we don't use here.
 */
function appendRedirectParams(webFormUrl: string, callbackBase: string): string {
  const url = new URL(webFormUrl)
  url.searchParams.set('redirectUrl',      `${callbackBase}&status=COMPLETED`)
  url.searchParams.set('errorRedirectUrl', `${callbackBase}&status=FAILED`)
  url.searchParams.set('abortRedirectUrl', `${callbackBase}&status=ABORTED`)
  return url.toString()
}

/**
 * Create a WebForm for importing a new bank connection.
 * callbackBase: the base callback URL including sessionId, e.g.
 *   https://app.example.com/api/finapi/callback?sessionId=<uuid>
 */
export async function createBankConnectionWebForm(
  userToken: string,
  callbackBase: string
): Promise<{ webFormId: string; webFormUrl: string }> {
  const config = getConfig()

  const res = await fetch(`${config.webformUrl}/api/webForms/bankConnectionImport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({}),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI WebForm creation failed (${res.status}): ${text}`)
  }

  const data: WebFormResponse = await res.json()
  return {
    webFormId: data.id,
    webFormUrl: appendRedirectParams(data.url, callbackBase),
  }
}

/**
 * Create a WebForm for updating (SCA renewal) an existing bank connection.
 * callbackBase: the base callback URL including sessionId, e.g.
 *   https://app.example.com/api/finapi/callback?sessionId=<uuid>
 */
export async function createBankConnectionUpdateWebForm(
  userToken: string,
  bankConnectionId: number,
  callbackBase: string
): Promise<{ webFormId: string; webFormUrl: string }> {
  const config = getConfig()

  const res = await fetch(`${config.webformUrl}/api/webForms/bankConnectionUpdate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ bankConnectionId }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI WebForm update failed (${res.status}): ${text}`)
  }

  const data: WebFormResponse = await res.json()
  return {
    webFormId: data.id,
    webFormUrl: appendRedirectParams(data.url, callbackBase),
  }
}

/**
 * Get WebForm status (to check completion after callback).
 */
export async function getWebFormStatus(webFormId: string, clientToken: string): Promise<{
  status: string
  payload?: Record<string, unknown>
}> {
  const config = getConfig()

  const res = await fetch(`${config.webformUrl}/api/webForms/${webFormId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${clientToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI WebForm status failed (${res.status}): ${text}`)
  }

  return await res.json()
}

// ---------------------------------------------------------------------------
// Bank Connections
// ---------------------------------------------------------------------------

interface BankConnection {
  id: number
  bankId: number
  name: string
  bankingUserId: string | null
  bankingCustomerId: string | null
  bankingPin: string | null
  type: string
  updateStatus: string
  categorizationStatus: string
  lastSuccessfulUpdate: string | null
  accountIds: number[]
  interfaces: Array<{
    interface: string
    status: string
    capabilities: string[]
    lastSuccessfulCommunication: string | null
    loginCredentials: Array<{ label: string; field: string }>
    properties: Record<string, unknown>[]
    aisConsent?: {
      status: string
      expiresAt: string | null
    }
  }>
}

interface AccountInfo {
  id: number
  accountName: string | null
  iban: string | null
  accountNumber: string | null
  accountHolderName: string | null
  bankConnectionId: number
  bankName: string | null
}

/**
 * Get all bank connections for a FinAPI user.
 */
export async function getBankConnections(userToken: string): Promise<BankConnection[]> {
  const config = getConfig()

  const res = await fetch(`${config.baseUrl}/api/v2/bankConnections`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI get bank connections failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return data.connections ?? []
}

/**
 * Get account details for a bank connection.
 */
export async function getAccounts(userToken: string, bankConnectionId: number): Promise<AccountInfo[]> {
  const config = getConfig()

  const res = await fetch(`${config.baseUrl}/api/v2/accounts?bankConnectionIds=${bankConnectionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI get accounts failed (${res.status}): ${text}`)
  }

  const data = await res.json()
  return data.accounts ?? []
}

/**
 * Delete a bank connection.
 */
export async function deleteBankConnection(userToken: string, bankConnectionId: number): Promise<void> {
  const config = getConfig()

  const res = await fetch(`${config.baseUrl}/api/v2/bankConnections/${bankConnectionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${userToken}`,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`FinAPI delete bank connection failed (${res.status}): ${text}`)
  }
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

interface FinAPITransaction {
  id: number
  accountId: number
  amount: number
  bankBookingDate: string // YYYY-MM-DD
  purpose: string | null
  counterpartName: string | null
  counterpartIban: string | null
  counterpartBic: string | null
  counterpartMandateReference: string | null
  endToEndReference: string | null
  primaNotaNumber: string | null
  valueDate: string | null
}

interface TransactionPage {
  transactions: FinAPITransaction[]
  paging: {
    page: number
    perPage: number
    pageCount: number
    totalCount: number
  }
}

/**
 * Fetch transactions for a bank connection (paginated).
 * @param minDate - YYYY-MM-DD format, fetch transactions from this date
 */
export async function getTransactions(
  userToken: string,
  bankConnectionIds: number[],
  minDate?: string,
  maxDate?: string
): Promise<FinAPITransaction[]> {
  const config = getConfig()
  const allTransactions: FinAPITransaction[] = []
  let page = 1
  const perPage = 500

  while (true) {
    const params = new URLSearchParams({
      view: 'userView',
      page: String(page),
      perPage: String(perPage),
    })

    // bankConnectionIds: repeated params (e.g. ?bankConnectionIds=1&bankConnectionIds=2)
    for (const id of bankConnectionIds) {
      params.append('bankConnectionIds', String(id))
    }

    if (minDate) params.set('minBankBookingDate', minDate)
    if (maxDate) params.set('maxBankBookingDate', maxDate)

    const res = await fetch(`${config.baseUrl}/api/v2/transactions?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`FinAPI get transactions failed (${res.status}): ${text}`)
    }

    const raw = await res.json()
    console.log('[PROJ-20] FinAPI transactions raw response keys:', Object.keys(raw), 'paging:', JSON.stringify(raw.paging))

    // FinAPI v2 response: { transactions: [...], paging: { ... } }
    const transactions: FinAPITransaction[] = raw.transactions ?? raw.items ?? []
    const paging = raw.paging ?? { page: 1, pageCount: 1, totalCount: transactions.length }

    allTransactions.push(...transactions)

    if (page >= paging.pageCount || transactions.length === 0) break
    page++
  }

  return allTransactions
}

/**
 * Normalize a FinAPI transaction into our transaktionen format.
 */
export function normalizeTransaction(tx: FinAPITransaction) {
  // Build a meaningful description from available fields
  const parts: string[] = []
  if (tx.counterpartName) parts.push(tx.counterpartName)
  if (tx.purpose) parts.push(tx.purpose)
  const beschreibung = parts.join(' – ') || null

  // Build buchungsreferenz from available reference fields
  const refParts: string[] = []
  if (tx.endToEndReference) refParts.push(tx.endToEndReference)
  if (tx.counterpartMandateReference) refParts.push(tx.counterpartMandateReference)
  if (tx.primaNotaNumber) refParts.push(tx.primaNotaNumber)
  const buchungsreferenz = refParts.join(' / ') || null

  return {
    datum: tx.bankBookingDate,
    betrag: tx.amount,
    beschreibung,
    iban_gegenseite: tx.counterpartIban ?? null,
    bic_gegenseite: tx.counterpartBic ?? null,
    buchungsreferenz,
    externe_id: `finapi_${tx.id}`,
    import_quelle: 'finapi' as const,
  }
}

/**
 * Determine the effective status of a bank connection by checking
 * the AIS consent status across its interfaces.
 */
export function determineBankConnectionStatus(
  connection: BankConnection
): 'aktiv' | 'sca_faellig' | 'fehler' {
  // Check if any interface requires SCA renewal
  for (const iface of connection.interfaces ?? []) {
    if (iface.aisConsent?.status === 'EXPIRED' || iface.status === 'UPDATED_FIXED') {
      return 'sca_faellig'
    }
  }

  if (connection.updateStatus === 'IN_ERROR' || connection.updateStatus === 'TECHNICAL_ERROR') {
    return 'fehler'
  }

  return 'aktiv'
}
