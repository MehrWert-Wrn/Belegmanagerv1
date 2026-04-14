/**
 * PROJ-20: FinAPI Verbindungen API
 * GET  /api/finapi/verbindungen – List bank connections for current mandant
 * POST /api/finapi/verbindungen – Initiate new bank connection (create FinAPI user if needed + WebForm URL)
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createFinAPIUser,
  encrypt,
  getUserToken,
  createBankConnectionWebForm,
  createBankConnectionUpdateWebForm,
} from '@/lib/finapi'

const postSchema = z.object({
  // If updating an existing connection (SCA renewal), pass the verbindung ID
  update_verbindung_id: z.string().uuid().optional(),
})

// GET /api/finapi/verbindungen
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Fetch all non-getrennt connections with zahlungsquelle join
  const { data: verbindungen, error } = await supabase
    .from('finapi_verbindungen')
    .select(`
      id,
      zahlungsquelle_id,
      bank_name,
      iban,
      kontonummer,
      status,
      letzter_sync_at,
      letzter_sync_anzahl,
      created_at,
      zahlungsquellen (id, name, typ)
    `)
    .eq('mandant_id', mandantId)
    .neq('status', 'getrennt')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch last 5 sync history entries per verbindung
  const verbindungIds = (verbindungen ?? []).map(v => v.id)
  const syncHistorie: Record<string, Array<{
    sync_at: string
    anzahl_importiert: number
    anzahl_duplikate: number
    status: string
    fehler_meldung: string | null
  }>> = {}

  if (verbindungIds.length > 0) {
    const { data: historie } = await supabase
      .from('finapi_sync_historie')
      .select('verbindung_id, sync_at, anzahl_importiert, anzahl_duplikate, status, fehler_meldung')
      .in('verbindung_id', verbindungIds)
      .order('sync_at', { ascending: false })
      .limit(verbindungIds.length * 5)

    for (const entry of (historie ?? [])) {
      const vid = entry.verbindung_id
      if (!syncHistorie[vid]) syncHistorie[vid] = []
      if (syncHistorie[vid].length < 5) {
        syncHistorie[vid].push({
          sync_at: entry.sync_at,
          anzahl_importiert: entry.anzahl_importiert,
          anzahl_duplikate: entry.anzahl_duplikate,
          status: entry.status,
          fehler_meldung: entry.fehler_meldung,
        })
      }
    }
  }

  const enriched = (verbindungen ?? []).map(v => ({
    ...v,
    sync_historie: syncHistorie[v.id] ?? [],
  }))

  return NextResponse.json(enriched)
}

// POST /api/finapi/verbindungen
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  // Only admins can connect bank accounts
  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  try {
    // SCA Renewal flow
    if (parsed.data.update_verbindung_id) {
      const { data: verbindung } = await supabase
        .from('finapi_verbindungen')
        .select('id, finapi_user_id, finapi_user_password_encrypted, finapi_bank_connection_id, mandant_id')
        .eq('id', parsed.data.update_verbindung_id)
        .eq('mandant_id', mandantId)
        .single()

      if (!verbindung) {
        return NextResponse.json({ error: 'Verbindung nicht gefunden' }, { status: 404 })
      }

      if (!verbindung.finapi_bank_connection_id) {
        return NextResponse.json({ error: 'Keine Bank-Connection-ID vorhanden' }, { status: 400 })
      }

      // Create a webform session to securely pass credentials through the callback
      const { data: session } = await supabase
        .from('finapi_webform_sessions')
        .insert({
          mandant_id: mandantId,
          finapi_user_id: verbindung.finapi_user_id,
          finapi_user_password_encrypted: verbindung.finapi_user_password_encrypted,
          verbindung_id: verbindung.id,
        })
        .select('id')
        .single()

      if (!session) {
        return NextResponse.json({ error: 'Session konnte nicht erstellt werden' }, { status: 500 })
      }

      const userToken = await getUserToken(
        verbindung.finapi_user_id,
        verbindung.finapi_user_password_encrypted
      )

      const callbackUrl = `${siteUrl}/api/finapi/callback?sessionId=${session.id}`
      const { webFormId, webFormUrl } = await createBankConnectionUpdateWebForm(
        userToken,
        verbindung.finapi_bank_connection_id,
        callbackUrl
      )

      // Store webform ID on session for verification
      await supabase
        .from('finapi_webform_sessions')
        .update({ webform_id: webFormId })
        .eq('id', session.id)

      return NextResponse.json({ webform_url: webFormUrl })
    }

    // New connection flow
    // Step 1: Get or create FinAPI user for this mandant
    const { data: mandant } = await supabase
      .from('mandanten')
      .select('id, finapi_user_id')
      .eq('id', mandantId)
      .single()

    let finapiUserId = mandant?.finapi_user_id
    let encryptedPassword: string | null = null

    if (!finapiUserId) {
      // Create new FinAPI user
      const { userId, password } = await createFinAPIUser(mandantId)
      finapiUserId = userId
      encryptedPassword = encrypt(password)

      // Store FinAPI user ID on mandant
      await supabase
        .from('mandanten')
        .update({ finapi_user_id: finapiUserId })
        .eq('id', mandantId)
    } else {
      // Look up the encrypted password from an existing connection
      const { data: existingConn } = await supabase
        .from('finapi_verbindungen')
        .select('finapi_user_password_encrypted')
        .eq('mandant_id', mandantId)
        .eq('finapi_user_id', finapiUserId)
        .limit(1)
        .single()

      encryptedPassword = existingConn?.finapi_user_password_encrypted ?? null
    }

    if (!encryptedPassword) {
      return NextResponse.json(
        { error: 'FinAPI-Benutzer-Credentials nicht gefunden. Bitte Support kontaktieren.' },
        { status: 500 }
      )
    }

    // Step 2: Create a webform session (credentials stored securely in DB, not in URL)
    const { data: session } = await supabase
      .from('finapi_webform_sessions')
      .insert({
        mandant_id: mandantId,
        finapi_user_id: finapiUserId,
        finapi_user_password_encrypted: encryptedPassword,
      })
      .select('id')
      .single()

    if (!session) {
      return NextResponse.json({ error: 'Session konnte nicht erstellt werden' }, { status: 500 })
    }

    // Step 3: Get user token
    const userToken = await getUserToken(finapiUserId, encryptedPassword)

    // Step 4: Create WebForm URL (callback references the session ID only)
    const callbackUrl = `${siteUrl}/api/finapi/callback?sessionId=${session.id}`
    const { webFormId, webFormUrl } = await createBankConnectionWebForm(userToken, callbackUrl)

    // Store webform ID on session
    await supabase
      .from('finapi_webform_sessions')
      .update({ webform_id: webFormId })
      .eq('id', session.id)

    return NextResponse.json({
      webform_url: webFormUrl,
    })
  } catch (err) {
    console.error('[PROJ-20] POST /api/finapi/verbindungen error:', err)
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json(
      { error: `Verbindung konnte nicht hergestellt werden: ${message}` },
      { status: 500 }
    )
  }
}
