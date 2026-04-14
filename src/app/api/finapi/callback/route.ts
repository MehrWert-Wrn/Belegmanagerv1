/**
 * PROJ-20: FinAPI Callback
 * GET /api/finapi/callback – Receives redirect from FinAPI WebForm after completion
 *
 * Query params from FinAPI:
 *   - status: COMPLETED | ABORTED | FAILED
 *
 * Query params we append to the callback URL:
 *   - sessionId: references finapi_webform_sessions (credentials stored in DB, not URL)
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import {
  getUserToken,
  getBankConnections,
  getAccounts,
  determineBankConnectionStatus,
} from '@/lib/finapi'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const settingsUrl = `${siteUrl}/settings/bankverbindungen`

  const status = searchParams.get('status')
  const sessionId = searchParams.get('sessionId')

  // Authenticate the user making the request
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${settingsUrl}?error=nicht_authentifiziert`)
  }

  // Check WebForm status
  if (!status || status === 'ABORTED') {
    return NextResponse.redirect(`${settingsUrl}?error=abgebrochen`)
  }

  if (status === 'FAILED') {
    return NextResponse.redirect(`${settingsUrl}?error=fehlgeschlagen`)
  }

  if (status !== 'COMPLETED') {
    return NextResponse.redirect(`${settingsUrl}?error=unbekannt`)
  }

  if (!sessionId) {
    return NextResponse.redirect(`${settingsUrl}?error=session_fehlt`)
  }

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.redirect(`${settingsUrl}?error=ungueltige_session`)
  }

  try {
    // Verify the current user's mandant
    const currentMandantId = await getMandantId(supabase)
    if (!currentMandantId) {
      return NextResponse.redirect(`${settingsUrl}?error=kein_mandant`)
    }

    // Load the session from DB
    const { data: session } = await supabase
      .from('finapi_webform_sessions')
      .select('id, mandant_id, finapi_user_id, finapi_user_password_encrypted, verbindung_id, status, expires_at')
      .eq('id', sessionId)
      .single()

    if (!session) {
      return NextResponse.redirect(`${settingsUrl}?error=session_nicht_gefunden`)
    }

    // Security: verify session belongs to the current user's mandant (defense-in-depth)
    if (session.mandant_id !== currentMandantId) {
      return NextResponse.redirect(`${settingsUrl}?error=zugriff_verweigert`)
    }

    // Security checks
    if (session.status !== 'pending') {
      return NextResponse.redirect(`${settingsUrl}?error=session_bereits_verwendet`)
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('finapi_webform_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId)
      return NextResponse.redirect(`${settingsUrl}?error=session_abgelaufen`)
    }

    const mandantId = session.mandant_id

    // SCA Renewal: update existing verbindung status
    if (session.verbindung_id) {
      const { data: verbindung } = await supabase
        .from('finapi_verbindungen')
        .select('id, finapi_bank_connection_id')
        .eq('id', session.verbindung_id)
        .eq('mandant_id', mandantId)
        .single()

      if (!verbindung) {
        await supabase.from('finapi_webform_sessions').update({ status: 'failed' }).eq('id', sessionId)
        return NextResponse.redirect(`${settingsUrl}?error=verbindung_nicht_gefunden`)
      }

      // Verify the connection status via FinAPI
      const userToken = await getUserToken(
        session.finapi_user_id,
        session.finapi_user_password_encrypted
      )

      const connections = await getBankConnections(userToken)
      const conn = connections.find(c => c.id === verbindung.finapi_bank_connection_id)
      const newStatus = conn ? determineBankConnectionStatus(conn) : 'aktiv'

      await supabase
        .from('finapi_verbindungen')
        .update({ status: newStatus })
        .eq('id', session.verbindung_id)

      // Mark session as completed
      await supabase.from('finapi_webform_sessions').update({ status: 'completed' }).eq('id', sessionId)

      return NextResponse.redirect(`${settingsUrl}?success=erneuert`)
    }

    // New connection: fetch bank connection details from FinAPI
    const userToken = await getUserToken(
      session.finapi_user_id,
      session.finapi_user_password_encrypted
    )
    const connections = await getBankConnections(userToken)

    if (connections.length === 0) {
      await supabase.from('finapi_webform_sessions').update({ status: 'failed' }).eq('id', sessionId)
      return NextResponse.redirect(`${settingsUrl}?error=keine_verbindung`)
    }

    // Process each new connection
    for (const conn of connections) {
      // Check if this bank connection already exists in our DB
      const { data: existing } = await supabase
        .from('finapi_verbindungen')
        .select('id')
        .eq('mandant_id', mandantId)
        .eq('finapi_bank_connection_id', conn.id)
        .limit(1)

      if (existing && existing.length > 0) continue // Already imported

      const accounts = await getAccounts(userToken, conn.id)
      const connectionStatus = determineBankConnectionStatus(conn)

      for (const account of accounts) {
        // Check for duplicate IBAN
        if (account.iban) {
          const { data: ibanDuplicate } = await supabase
            .from('finapi_verbindungen')
            .select('id')
            .eq('mandant_id', mandantId)
            .eq('iban', account.iban)
            .neq('status', 'getrennt')
            .limit(1)

          if (ibanDuplicate && ibanDuplicate.length > 0) continue
        }

        // Auto-create a Zahlungsquelle for this account
        const bankName = account.bankName || conn.name || 'Bankkonto'
        const quellenName = account.iban
          ? `${bankName} (${account.iban.substring(0, 2)}...${account.iban.slice(-4)})`
          : bankName

        const { data: zahlungsquelle } = await supabase
          .from('zahlungsquellen')
          .insert({
            mandant_id: mandantId,
            name: quellenName,
            typ: 'kontoauszug',
            iban: account.iban,
          })
          .select('id')
          .single()

        // Save the bank connection
        await supabase
          .from('finapi_verbindungen')
          .insert({
            mandant_id: mandantId,
            zahlungsquelle_id: zahlungsquelle?.id ?? null,
            finapi_user_id: session.finapi_user_id,
            finapi_user_password_encrypted: session.finapi_user_password_encrypted,
            finapi_bank_connection_id: conn.id,
            bank_name: bankName,
            iban: account.iban,
            kontonummer: account.accountNumber,
            status: connectionStatus,
          })
      }

      // If no accounts found, still save the connection
      if (accounts.length === 0) {
        await supabase
          .from('finapi_verbindungen')
          .insert({
            mandant_id: mandantId,
            finapi_user_id: session.finapi_user_id,
            finapi_user_password_encrypted: session.finapi_user_password_encrypted,
            finapi_bank_connection_id: conn.id,
            bank_name: conn.name || 'Bankkonto',
            status: connectionStatus,
          })
      }
    }

    // Mark session as completed
    await supabase.from('finapi_webform_sessions').update({ status: 'completed' }).eq('id', sessionId)

    return NextResponse.redirect(`${settingsUrl}?success=verbunden`)
  } catch (err) {
    console.error('[PROJ-20] GET /api/finapi/callback error:', err)

    // Try to mark session as failed
    if (sessionId) {
      try {
        await supabase
          .from('finapi_webform_sessions')
          .update({ status: 'failed' })
          .eq('id', sessionId)
      } catch {
        // Ignore – best-effort cleanup
      }
    }

    return NextResponse.redirect(`${settingsUrl}?error=server_fehler`)
  }
}
