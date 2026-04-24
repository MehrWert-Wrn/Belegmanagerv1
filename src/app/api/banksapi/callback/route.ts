/**
 * PROJ-20: BanksAPI Callback
 * GET /api/banksapi/callback – Empfaengt den Redirect von BanksAPI nach REG/Protect.
 *
 * Erwartete Query-Parameter:
 *   - session    : unsere banksapi_webform_sessions.id (UUID)
 *   - baReentry  : Status von BanksAPI (z.B. 'ACCOUNT_CREATED', sonst Fehler)
 *
 * Bei Erfolg: Bankzugang via /customer/v2/bankzugaenge laden, fuer jedes Konto
 *             eine Zahlungsquelle anlegen, banksapi_verbindungen befuellen.
 */

import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import {
  decrypt,
  getBankConnections,
  getUserToken,
  type BanksApiBankzugang,
  type BanksApiKonto,
} from '@/lib/banksapi'
import { generateKuerzel } from '@/lib/ear-buchungsnummern'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const settingsUrl = `${siteUrl}/settings/bankverbindungen`

  const sessionId = searchParams.get('session')
  const baReentry = searchParams.get('baReentry')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${settingsUrl}?banksapi_error=nicht_authentifiziert`)
  }

  if (!sessionId) {
    return NextResponse.redirect(`${settingsUrl}?banksapi_error=session_fehlt`)
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return NextResponse.redirect(`${settingsUrl}?banksapi_error=ungueltige_session`)
  }

  // Bekannte Fehlerwerte von BanksAPI REG/Protect:
  //   NO_CALLBACK_URL        – keine callbackUrl konfiguriert
  //   INVALID_CALLBACK_URL   – callbackUrl steht nicht auf der Allow-List
  //   ACCOUNT_CREATED        – Erfolg
  //   (andere Werte)         – User hat abgebrochen oder sonstiger Fehler
  if (!baReentry || baReentry !== 'ACCOUNT_CREATED') {
    await markSessionFailed(supabase, sessionId)
    const reason =
      baReentry === 'NO_CALLBACK_URL' ? 'keine_callback_url'
      : baReentry === 'INVALID_CALLBACK_URL' ? 'ungueltige_callback_url'
      : 'abgebrochen'
    return NextResponse.redirect(`${settingsUrl}?banksapi_error=${reason}`)
  }

  try {
    const currentMandantId = await getMandantId(supabase)
    if (!currentMandantId) {
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=kein_mandant`)
    }

    const { data: session } = await supabase
      .from('banksapi_webform_sessions')
      .select('id, mandant_id, banksapi_username, banksapi_user_password_encrypted, status, expires_at')
      .eq('id', sessionId)
      .single()

    if (!session) {
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=session_nicht_gefunden`)
    }

    // Defense-in-depth: Session muss zum aktuellen Mandanten gehoeren
    if (session.mandant_id !== currentMandantId) {
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=zugriff_verweigert`)
    }

    if (session.status !== 'pending') {
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=session_bereits_verwendet`)
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('banksapi_webform_sessions')
        .update({ status: 'expired' })
        .eq('id', sessionId)
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=session_abgelaufen`)
    }

    const mandantId = session.mandant_id

    // User-Token holen
    const password = decrypt(session.banksapi_user_password_encrypted)
    const userToken = await getUserToken(session.banksapi_username, password)

    // Aktuelle Bankzugaenge bei BanksAPI abfragen
    const bankzugaenge = await getBankConnections(userToken)
    if (bankzugaenge.length === 0) {
      await markSessionFailed(supabase, sessionId)
      return NextResponse.redirect(`${settingsUrl}?banksapi_error=keine_verbindung`)
    }

    // banksapi_username auch auf mandanten persistieren (Idempotenz)
    await supabase
      .from('mandanten')
      .update({ banksapi_username: session.banksapi_username })
      .eq('id', mandantId)
      .is('banksapi_username', null)

    // Pro Bankzugang + Konto eine zahlungsquelle + banksapi_verbindungen anlegen
    for (const bankzugang of bankzugaenge) {
      const konten = extractKonten(bankzugang)

      if (konten.length === 0) {
        // Bankzugang ohne Konten: Trotzdem eintragen, damit Mandant ihn sieht
        await upsertVerbindung(supabase, {
          mandantId,
          username: session.banksapi_username,
          encryptedPassword: session.banksapi_user_password_encrypted,
          accessId: bankzugang.id,
          productId: null,
          bankName: bankNameOf(bankzugang) ?? 'Bankkonto',
          iban: null,
          zahlungsquelleId: null,
        })
        continue
      }

      for (const konto of konten) {
        const productId = konto.id ?? konto.iban ?? null
        if (!productId) continue

        // Duplikat-Pruefung: gleicher accessId+productId beim selben Mandanten?
        const { data: existing } = await supabase
          .from('banksapi_verbindungen')
          .select('id')
          .eq('mandant_id', mandantId)
          .eq('banksapi_access_id', bankzugang.id)
          .eq('banksapi_product_id', productId)
          .neq('status', 'getrennt')
          .limit(1)

        if (existing && existing.length > 0) continue

        const bankName = bankNameOf(bankzugang) ?? konto.kreditinstitut ?? 'Bankkonto'
        const quellenName = konto.iban
          ? `${bankName} (${konto.iban.substring(0, 2)}...${konto.iban.slice(-4)})`
          : bankName

        // IBAN-Pruefung direkt in zahlungsquellen: selbe IBAN = selbe Zahlungsquelle
        let zahlungsquelleId: string | null = null
        if (konto.iban) {
          const { data: existingQuelle } = await supabase
            .from('zahlungsquellen')
            .select('id')
            .eq('mandant_id', mandantId)
            .eq('iban', konto.iban)
            .limit(1)
            .maybeSingle()
          if (existingQuelle) {
            zahlungsquelleId = existingQuelle.id
          }
        }

        if (!zahlungsquelleId) {
          const kuerzel = await generateKuerzel(supabase, mandantId, 'kontoauszug')
          const { data: zahlungsquelle, error: zErr } = await supabase
            .from('zahlungsquellen')
            .insert({
              mandant_id: mandantId,
              name: quellenName,
              typ: 'kontoauszug',
              iban: konto.iban ?? null,
              kuerzel,
            })
            .select('id')
            .single()

          if (zErr) {
            console.error('[PROJ-20 BanksAPI] Zahlungsquelle anlegen fehlgeschlagen:', zErr)
            continue
          }
          zahlungsquelleId = zahlungsquelle?.id ?? null
        }

        await upsertVerbindung(supabase, {
          mandantId,
          username: session.banksapi_username,
          encryptedPassword: session.banksapi_user_password_encrypted,
          accessId: bankzugang.id,
          productId,
          bankName,
          iban: konto.iban ?? null,
          zahlungsquelleId,
        })
      }
    }

    // Session als completed markieren
    await supabase
      .from('banksapi_webform_sessions')
      .update({ status: 'completed' })
      .eq('id', sessionId)

    return NextResponse.redirect(`${settingsUrl}?banksapi_success=true`)
  } catch (err) {
    console.error('[PROJ-20 BanksAPI] GET /api/banksapi/callback error:', err)
    if (sessionId) await markSessionFailed(supabase, sessionId)
    return NextResponse.redirect(`${settingsUrl}?banksapi_error=server_fehler`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markSessionFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
) {
  try {
    await supabase
      .from('banksapi_webform_sessions')
      .update({ status: 'failed' })
      .eq('id', sessionId)
  } catch {
    // best-effort
  }
}

function extractKonten(bankzugang: BanksApiBankzugang): BanksApiKonto[] {
  // BanksAPI liefert Konten in "bankprodukte"
  if (Array.isArray(bankzugang.bankprodukte) && bankzugang.bankprodukte.length > 0) {
    return bankzugang.bankprodukte
  }
  return []
}

function bankNameOf(bankzugang: BanksApiBankzugang): string | null {
  // Bankname steht im ersten Bankprodukt unter "kreditinstitut"
  return bankzugang.bankprodukte?.[0]?.kreditinstitut ?? null
}

interface UpsertArgs {
  mandantId: string
  username: string
  encryptedPassword: string
  accessId: string
  productId: string | null
  bankName: string
  iban: string | null
  zahlungsquelleId: string | null
}

async function upsertVerbindung(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: UpsertArgs,
) {
  await supabase.from('banksapi_verbindungen').insert({
    mandant_id: args.mandantId,
    zahlungsquelle_id: args.zahlungsquelleId,
    banksapi_username: args.username,
    banksapi_access_id: args.accessId,
    banksapi_product_id: args.productId,
    bank_name: args.bankName,
    iban: args.iban,
    status: 'aktiv',
  })

  // Wir speichern hier bewusst NICHT das Passwort in banksapi_verbindungen.
  // Es wird ueber banksapi_webform_sessions zentral pro Mandant verwaltet
  // und beim Sync von dort gelesen. So vermeiden wir Redundanz und
  // Inkonsistenzen wenn das Passwort spaeter rotiert wird.
  void args.encryptedPassword
}
