/**
 * PROJ-20: BanksAPI Verbindungen API
 * GET  /api/banksapi/verbindungen – Liste der Bankzugaenge fuer aktuellen Mandanten
 * POST /api/banksapi/verbindungen – Neuen Bankzugang ueber hosted UI starten
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  createBanksApiUser,
  createBankAccess,
  decrypt,
  deleteRegProtectSessions,
  encrypt,
  generateBanksApiCredentials,
  getUserToken,
} from '@/lib/banksapi'

const postSchema = z.object({}).passthrough()

// ---------------------------------------------------------------------------
// GET /api/banksapi/verbindungen
// ---------------------------------------------------------------------------

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data: verbindungen, error } = await supabase
    .from('banksapi_verbindungen')
    .select(`
      id,
      zahlungsquelle_id,
      bank_name,
      iban,
      status,
      letzter_sync_at,
      letzter_sync_anzahl,
      created_at,
      zahlungsquellen (id, name, typ)
    `)
    .eq('mandant_id', mandantId)
    .neq('status', 'getrennt')
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Letzte 5 Sync-Historie-Eintraege je Verbindung nachladen
  const verbindungIds = (verbindungen ?? []).map((v) => v.id)
  const syncHistorie: Record<
    string,
    Array<{
      synced_at: string
      anzahl_importiert: number
      anzahl_duplikate: number
      status: string
      fehler_meldung: string | null
    }>
  > = {}

  if (verbindungIds.length > 0) {
    const { data: historie } = await supabase
      .from('banksapi_sync_historie')
      .select('verbindung_id, synced_at, anzahl_importiert, anzahl_duplikate, status, fehler_meldung')
      .in('verbindung_id', verbindungIds)
      .order('synced_at', { ascending: false })
      .limit(verbindungIds.length * 5)

    for (const entry of historie ?? []) {
      const vid = entry.verbindung_id as string
      if (!syncHistorie[vid]) syncHistorie[vid] = []
      if (syncHistorie[vid].length < 5) {
        syncHistorie[vid].push({
          synced_at: entry.synced_at,
          anzahl_importiert: entry.anzahl_importiert,
          anzahl_duplikate: entry.anzahl_duplikate,
          status: entry.status,
          fehler_meldung: entry.fehler_meldung,
        })
      }
    }
  }

  const enriched = (verbindungen ?? []).map((v) => ({
    ...v,
    sync_historie: syncHistorie[v.id] ?? [],
  }))

  return NextResponse.json(enriched)
}

// ---------------------------------------------------------------------------
// POST /api/banksapi/verbindungen
// ---------------------------------------------------------------------------

export async function POST(request: Request & { headers: Headers }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  try {
    // Schritt 1: Mandant laden – pruefen ob bereits ein BanksAPI-Username existiert
    const { data: mandant } = await supabase
      .from('mandanten')
      .select('id, banksapi_username')
      .eq('id', mandantId)
      .single()

    let username = mandant?.banksapi_username ?? null
    let plainPassword: string | null = null
    let encryptedPassword: string | null = null

    if (!username) {
      // Neuen BanksAPI-Subuser anlegen
      const credentials = generateBanksApiCredentials()
      username = credentials.username
      plainPassword = credentials.password
      encryptedPassword = encrypt(plainPassword)

      // Management-User-Anlage (idempotent: 409 wird in createBanksApiUser geschluckt)
      await createBanksApiUser(username, plainPassword)

      const { error: updateErr } = await supabase
        .from('mandanten')
        .update({ banksapi_username: username })
        .eq('id', mandantId)

      if (updateErr) {
        return NextResponse.json(
          { error: `BanksAPI-Username konnte nicht gespeichert werden: ${updateErr.message}` },
          { status: 500 },
        )
      }
    } else {
      // Username existiert bereits – Passwort aus letzter Webform-Session lesen.
      // BanksAPI erlaubt kein nachtraegliches Passwort-Lesen, daher persistieren
      // wir es verschluesselt in banksapi_webform_sessions.
      const { data: lastSession } = await supabase
        .from('banksapi_webform_sessions')
        .select('banksapi_user_password_encrypted')
        .eq('mandant_id', mandantId)
        .eq('banksapi_username', username)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastSession?.banksapi_user_password_encrypted) {
        return NextResponse.json(
          {
            error:
              'BanksAPI-Credentials nicht gefunden. Bitte vorhandene Bankverbindungen trennen und neu starten.',
          },
          { status: 500 },
        )
      }

      encryptedPassword = lastSession.banksapi_user_password_encrypted
    }

    if (!encryptedPassword) {
      return NextResponse.json(
        { error: 'Passwortermittlung fehlgeschlagen' },
        { status: 500 },
      )
    }

    // Schritt 3: WebForm-Session in DB anlegen (verschluesseltes Passwort statt URL)
    const { data: session, error: sessionErr } = await supabase
      .from('banksapi_webform_sessions')
      .insert({
        mandant_id: mandantId,
        banksapi_username: username,
        banksapi_user_password_encrypted: encryptedPassword,
      })
      .select('id')
      .single()

    if (sessionErr || !session) {
      return NextResponse.json(
        { error: `Session konnte nicht erstellt werden: ${sessionErr?.message ?? 'unbekannt'}` },
        { status: 500 },
      )
    }

    // Schritt 4: User-Token holen
    const passwordForToken = plainPassword ?? decrypt(encryptedPassword)
    const userToken = await getUserToken(username, passwordForToken)

    // Schritt 5a: Stale REG/Protect-Sessions loeschen (sonst antwortet BanksAPI mit 400 statt 451)
    await deleteRegProtectSessions(userToken)

    // Schritt 5b: Bankzugang anlegen → BanksAPI liefert hosted UI URL (451 + Location)
    const customerIp =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      request.headers.get('x-real-ip') ??
      undefined
    const hostedUiUrl = await createBankAccess(userToken, customerIp)

    // Schritt 6: callbackUrl an die hosted UI URL anhaengen
    const callbackUrl = `${siteUrl}/api/banksapi/callback?session=${session.id}`
    const completeUrl = appendCallback(hostedUiUrl, callbackUrl)

    return NextResponse.json({ webform_url: completeUrl })
  } catch (err) {
    console.error('[PROJ-20 BanksAPI] POST /api/banksapi/verbindungen error:', err)
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    return NextResponse.json(
      { error: `Verbindung konnte nicht hergestellt werden: ${message}` },
      { status: 500 },
    )
  }
}

/**
 * Haengt callbackUrl an die hosted UI-URL als Query-Parameter an.
 * BanksAPI erwartet den Parameter "callbackUrl".
 */
function appendCallback(hostedUiUrl: string, callbackUrl: string): string {
  try {
    const url = new URL(hostedUiUrl)
    url.searchParams.set('callbackUrl', callbackUrl)
    return url.toString()
  } catch {
    const sep = hostedUiUrl.includes('?') ? '&' : '?'
    return `${hostedUiUrl}${sep}callbackUrl=${encodeURIComponent(callbackUrl)}`
  }
}
