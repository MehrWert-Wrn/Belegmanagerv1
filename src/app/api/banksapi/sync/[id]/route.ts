/**
 * PROJ-20: BanksAPI Sync API
 * POST /api/banksapi/sync/[id] – Holt Umsaetze fuer eine BanksAPI-Verbindung
 * und importiert sie in transaktionen.
 */

export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import {
  decrypt,
  getTransactions,
  getUserToken,
  normalizeTransaction,
} from '@/lib/banksapi'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungueltige ID' }, { status: 400 })
  }

  // Verbindung laden + Mandant pruefen
  const { data: verbindung } = await supabase
    .from('banksapi_verbindungen')
    .select(
      'id, mandant_id, zahlungsquelle_id, banksapi_username, banksapi_access_id, banksapi_product_id, status, letzter_sync_at',
    )
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!verbindung) {
    return NextResponse.json({ error: 'Verbindung nicht gefunden' }, { status: 404 })
  }

  if (verbindung.status === 'getrennt') {
    return NextResponse.json({ error: 'Verbindung ist getrennt' }, { status: 400 })
  }
  if (verbindung.status === 'sca_faellig') {
    return NextResponse.json(
      { error: 'SCA-Erneuerung notwendig. Bitte Verbindung erneuern.' },
      { status: 400 },
    )
  }
  if (verbindung.status === 'fehler') {
    return NextResponse.json({ error: 'Verbindung fehlerhaft' }, { status: 400 })
  }

  if (!verbindung.banksapi_access_id || !verbindung.banksapi_product_id) {
    return NextResponse.json({ error: 'BanksAPI-IDs fehlen auf der Verbindung' }, { status: 400 })
  }

  if (!verbindung.zahlungsquelle_id) {
    return NextResponse.json({ error: 'Keine Zahlungsquelle verknuepft' }, { status: 400 })
  }

  // DB-basiertes Rate-Limit: max 1 Sync pro 5 Minuten je Verbindung
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { count: recentSyncs } = await supabase
    .from('banksapi_sync_historie')
    .select('id', { count: 'exact', head: true })
    .eq('verbindung_id', id)
    .gte('synced_at', fiveMinutesAgo)

  if ((recentSyncs ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'Zu viele Synchronisierungen fuer diese Verbindung. Bitte 5 Minuten warten.' },
      { status: 429 },
    )
  }

  try {
    // Schritt 1: Letzte Webform-Session laden, um an das verschluesselte Passwort zu kommen
    const { data: lastSession } = await supabase
      .from('banksapi_webform_sessions')
      .select('banksapi_user_password_encrypted')
      .eq('mandant_id', mandantId)
      .eq('banksapi_username', verbindung.banksapi_username)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastSession?.banksapi_user_password_encrypted) {
      return NextResponse.json(
        { error: 'Keine Credentials gefunden. Bitte Verbindung erneut anlegen.' },
        { status: 400 },
      )
    }

    const password = decrypt(lastSession.banksapi_user_password_encrypted)
    const userToken = await getUserToken(verbindung.banksapi_username, password)

    // Schritt 2: Umsaetze abrufen
    const banksApiTransaktionen = await getTransactions(
      userToken,
      verbindung.banksapi_access_id,
      verbindung.banksapi_product_id,
    )

    if (banksApiTransaktionen.length === 0) {
      await supabase
        .from('banksapi_verbindungen')
        .update({
          letzter_sync_at: new Date().toISOString(),
          letzter_sync_anzahl: 0,
        })
        .eq('id', id)

      await supabase.from('banksapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'success',
      })

      return NextResponse.json({ importiert: 0, duplikate: 0, gesamt: 0 })
    }

    // Schritt 3: Normalisieren
    const normalized = banksApiTransaktionen.map((t) =>
      normalizeTransaction(t, verbindung.zahlungsquelle_id as string, mandantId),
    )

    // Schritt 4: gesperrte Monate ermitteln
    const uniqueMonths = new Set(
      normalized
        .filter((t) => t.datum)
        .map((t) => {
          const [year, month] = t.datum.split('-')
          return `${year}-${month}`
        }),
    )
    const uniqueJahre = [...new Set([...uniqueMonths].map((m) => parseInt(m.split('-')[0])))]
    const closedMonths = new Set<string>()

    if (uniqueJahre.length > 0) {
      const { data: abschluesse } = await supabase
        .from('monatsabschluesse')
        .select('jahr, monat')
        .eq('mandant_id', mandantId)
        .eq('status', 'abgeschlossen')
        .in('jahr', uniqueJahre)

      for (const a of abschluesse ?? []) {
        closedMonths.add(`${a.jahr}-${String(a.monat).padStart(2, '0')}`)
      }
    }

    // Schritt 5: Duplikate via externe_id
    const externeIds = normalized.map((t) => t.externe_id)
    const { data: existingByExterneId } = await supabase
      .from('transaktionen')
      .select('externe_id')
      .eq('mandant_id', mandantId)
      .in('externe_id', externeIds)

    const existingExterneIds = new Set((existingByExterneId ?? []).map((t) => t.externe_id))

    // Schritt 5b: Cross-Source-Fallback ueber datum + betrag + beschreibung
    // (CSV-Importe haben kein externe_id; verhindert Doppelimport CSV vs BanksAPI)
    const datums = [...new Set(normalized.map((t) => t.datum).filter(Boolean))]
    const existingCrossKeys = new Set<string>()

    if (datums.length > 0) {
      const { data: csvTransactions } = await supabase
        .from('transaktionen')
        .select('datum, betrag, beschreibung')
        .eq('mandant_id', mandantId)
        .is('externe_id', null)
        .in('datum', datums)

      for (const row of csvTransactions ?? []) {
        existingCrossKeys.add(`${row.datum}__${row.betrag}__${row.beschreibung ?? ''}`)
      }
    }

    // Schritt 6: Filtern
    let anzahlImportiert = 0
    let anzahlDuplikate = 0
    let anzahlGesperrteMonate = 0
    const toInsert: Array<typeof normalized[number]> = []

    for (const t of normalized) {
      if (!t.datum) continue
      if (existingExterneIds.has(t.externe_id)) {
        anzahlDuplikate++
        continue
      }

      const crossKey = `${t.datum}__${t.betrag}__${t.beschreibung ?? ''}`
      if (existingCrossKeys.has(crossKey)) {
        anzahlDuplikate++
        continue
      }

      const [year, month] = t.datum.split('-')
      if (closedMonths.has(`${year}-${month}`)) {
        anzahlGesperrteMonate++
        continue
      }

      toInsert.push(t)
      existingExterneIds.add(t.externe_id)
    }

    // Schritt 7: Batch-Insert
    if (toInsert.length > 0) {
      const { error } = await supabase.from('transaktionen').insert(toInsert)
      if (!error) {
        anzahlImportiert = toInsert.length
      } else if (error.code === '23505') {
        // Race Condition – einzeln einfuegen
        for (const row of toInsert) {
          const { error: rowError } = await supabase.from('transaktionen').insert(row)
          if (!rowError) {
            anzahlImportiert++
          } else if (rowError.code === '23505') {
            anzahlDuplikate++
          }
        }
      } else {
        console.error('[PROJ-20 BanksAPI] Batch insert error:', error)
        await supabase.from('banksapi_sync_historie').insert({
          verbindung_id: id,
          mandant_id: mandantId,
          anzahl_importiert: 0,
          anzahl_duplikate: anzahlDuplikate,
          status: 'error',
          fehler_meldung: error.message,
        })
        return NextResponse.json({ error: `Import fehlgeschlagen: ${error.message}` }, { status: 500 })
      }
    }

    // Schritt 8: Verbindung aktualisieren
    await supabase
      .from('banksapi_verbindungen')
      .update({
        letzter_sync_at: new Date().toISOString(),
        letzter_sync_anzahl: anzahlImportiert,
      })
      .eq('id', id)

    // Schritt 9: Sync-Historie loggen
    await supabase.from('banksapi_sync_historie').insert({
      verbindung_id: id,
      mandant_id: mandantId,
      anzahl_importiert: anzahlImportiert,
      anzahl_duplikate: anzahlDuplikate,
      status: 'success',
    })

    // Schritt 10: Import-Protokoll loggen (analog CSV-Import)
    await supabase.from('import_protokolle').insert({
      mandant_id: mandantId,
      quelle_id: verbindung.zahlungsquelle_id,
      dateiname: `BanksAPI Sync ${new Date().toISOString().split('T')[0]}`,
      anzahl_importiert: anzahlImportiert,
      anzahl_duplikate: anzahlDuplikate,
      anzahl_fehler: 0,
      importiert_von: user.id,
    })

    // Schritt 11: Matching ausloesen (fire-and-forget)
    if (anzahlImportiert > 0) {
      executeMatching(supabase, mandantId, verbindung.zahlungsquelle_id).catch(() => null)
    }

    return NextResponse.json({
      importiert: anzahlImportiert,
      duplikate: anzahlDuplikate,
      gesperrte_monate: anzahlGesperrteMonate,
      gesamt: banksApiTransaktionen.length,
    })
  } catch (err) {
    console.error('[PROJ-20 BanksAPI] POST /api/banksapi/sync/[id] error:', err)
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'

    // Bei 401/403 Hinweis: vermutlich SCA-Erneuerung notwendig
    const isAuthError =
      message.includes('401') || message.includes('403') || message.toLowerCase().includes('unauthorized')

    if (isAuthError) {
      await supabase.from('banksapi_verbindungen').update({ status: 'sca_faellig' }).eq('id', id)
      await supabase.from('banksapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'error',
        fehler_meldung: 'SCA-Erneuerung notwendig',
      })
      return NextResponse.json(
        { error: 'SCA-Erneuerung notwendig. Bitte Verbindung erneuern.' },
        { status: 403 },
      )
    }

    try {
      await supabase.from('banksapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'error',
        fehler_meldung: message,
      })
    } catch {
      // best-effort
    }

    return NextResponse.json(
      { error: `Synchronisierung fehlgeschlagen: ${message}` },
      { status: 500 },
    )
  }
}
