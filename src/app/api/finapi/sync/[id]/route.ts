/**
 * PROJ-20: FinAPI Sync API
 * POST /api/finapi/sync/[id] – Fetch & import transactions for a bank connection
 */

// Extend Vercel function timeout to 60s to allow for bank connection polling (up to 30s)
export const maxDuration = 60

import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import {
  getUserToken,
  getBankConnection,
  updateBankConnection,
  getTransactions,
  normalizeTransaction,
} from '@/lib/finapi'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 })
  }

  // Rate limit: max 5 syncs per mandant per 5 minutes (DB-based, works on serverless)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { count: recentSyncs } = await supabase
    .from('finapi_sync_historie')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .gte('sync_at', fiveMinutesAgo)

  if ((recentSyncs ?? 0) >= 5) {
    return NextResponse.json(
      { error: 'Zu viele Synchronisierungen. Bitte warte einige Minuten.' },
      { status: 429 }
    )
  }

  // Fetch the connection
  const { data: verbindung } = await supabase
    .from('finapi_verbindungen')
    .select('id, finapi_user_id, finapi_user_password_encrypted, finapi_bank_connection_id, zahlungsquelle_id, letzter_sync_at, status, mandant_id')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (!verbindung) {
    return NextResponse.json({ error: 'Verbindung nicht gefunden' }, { status: 404 })
  }

  if (verbindung.status === 'getrennt') {
    return NextResponse.json({ error: 'Verbindung ist getrennt. Bitte neu verbinden.' }, { status: 400 })
  }

  if (verbindung.status === 'sca_faellig') {
    return NextResponse.json({ error: 'SCA-Erneuerung notwendig. Bitte Verbindung erneuern.' }, { status: 400 })
  }

  if (verbindung.status === 'fehler') {
    return NextResponse.json({ error: 'Verbindung fehlerhaft. Bitte Verbindung erneuern.' }, { status: 400 })
  }

  if (!verbindung.finapi_bank_connection_id) {
    return NextResponse.json({ error: 'Keine Bank-Connection-ID vorhanden' }, { status: 400 })
  }

  if (!verbindung.zahlungsquelle_id) {
    return NextResponse.json({ error: 'Keine Zahlungsquelle verknüpft' }, { status: 400 })
  }

  try {
    // Step 1: Get user token
    const userToken = await getUserToken(
      verbindung.finapi_user_id,
      verbindung.finapi_user_password_encrypted
    )

    // Step 1b: Trigger bank connection update to fetch fresh data from the bank,
    // then poll until the update is complete (max 30s) before fetching transactions.
    // maxDaysForDownload=90 ensures historical transactions are included.
    try {
      const conn = await getBankConnection(userToken, verbindung.finapi_bank_connection_id)
      const bankingInterface = conn?.interfaces?.[0]?.bankingInterface

      if (bankingInterface) {
        const triggered = await updateBankConnection(
          userToken,
          verbindung.finapi_bank_connection_id,
          bankingInterface
        )

        if (triggered) {
          // Poll until updateStatus === 'READY' (max 30s, every 3s)
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(r => setTimeout(r, 3000))
            const updated = await getBankConnection(userToken, verbindung.finapi_bank_connection_id)
            console.log(`[PROJ-20] Poll ${attempt + 1}: updateStatus=${updated?.updateStatus}`)
            if (updated?.updateStatus === 'READY') break
          }
        }
        // If 422 (already in progress): also poll until ready
        else {
          for (let attempt = 0; attempt < 10; attempt++) {
            await new Promise(r => setTimeout(r, 3000))
            const updated = await getBankConnection(userToken, verbindung.finapi_bank_connection_id)
            console.log(`[PROJ-20] Poll ${attempt + 1} (in-progress): updateStatus=${updated?.updateStatus}`)
            if (updated?.updateStatus === 'READY') break
          }
        }
      } else {
        console.warn('[PROJ-20] No bankingInterface found on connection, skipping update')
      }
    } catch (updateErr) {
      console.warn('[PROJ-20] Bank update warning (non-fatal):', updateErr instanceof Error ? updateErr.message : updateErr)
    }

    // Step 2: Determine date range
    // Always fetch the last 90 days for the first sync, 30 days for subsequent syncs.
    // Using a fixed lookback (instead of lastSync - 1 day) ensures we catch transactions
    // with past bankBookingDates (banks often post with 1–3 day delays) and avoids gaps
    // when the bank update completes after letzter_sync_at was already advanced.
    // Duplicate detection via externe_id handles any overlap.
    let minDate: string | undefined
    if (verbindung.letzter_sync_at) {
      // Subsequent syncs: 30-day rolling window to catch delayed bank bookings
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      minDate = thirtyDaysAgo.toISOString().split('T')[0]
    } else {
      // First sync: 90-day history
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      minDate = ninetyDaysAgo.toISOString().split('T')[0]
    }

    // Step 3: Fetch transactions from FinAPI
    const finapiTransactions = await getTransactions(
      userToken,
      [verbindung.finapi_bank_connection_id],
      minDate
    )

    console.log(`[PROJ-20] Sync debug: bankConnectionId=${verbindung.finapi_bank_connection_id}, minDate=${minDate}, finapiTransactions.length=${finapiTransactions.length}`, finapiTransactions.length > 0 ? JSON.stringify(finapiTransactions[0]) : '(empty)')

    if (finapiTransactions.length === 0) {
      // Update sync timestamp even if no new transactions
      await supabase
        .from('finapi_verbindungen')
        .update({
          letzter_sync_at: new Date().toISOString(),
          letzter_sync_anzahl: 0,
        })
        .eq('id', id)

      // Log sync history
      await supabase.from('finapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'erfolg',
      })

      return NextResponse.json({
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        gesamt: 0,
        matching_quote: 0,
      })
    }

    // Step 4: Normalize transactions
    const normalized = finapiTransactions.map(normalizeTransaction)

    // Step 5: Check for closed months
    const uniqueMonths = new Set(
      normalized.map(t => {
        const [year, month] = t.datum.split('-')
        return `${year}-${month}`
      })
    )
    const uniqueJahre = [...new Set([...uniqueMonths].map(m => parseInt(m.split('-')[0])))]
    const closedMonths = new Set<string>()

    if (uniqueJahre.length > 0) {
      const { data: abschluesse } = await supabase
        .from('monatsabschluesse')
        .select('jahr, monat')
        .eq('mandant_id', mandantId)
        .eq('status', 'abgeschlossen')
        .in('jahr', uniqueJahre)

      for (const a of (abschluesse ?? [])) {
        closedMonths.add(`${a.jahr}-${String(a.monat).padStart(2, '0')}`)
      }
    }

    // Step 6: Deduplicate via externe_id (FinAPI-to-FinAPI)
    const externeIds = normalized.map(t => t.externe_id)
    const { data: existingByExterneId } = await supabase
      .from('transaktionen')
      .select('externe_id')
      .eq('mandant_id', mandantId)
      .in('externe_id', externeIds)

    const existingExterneIds = new Set(
      (existingByExterneId ?? []).map(t => t.externe_id)
    )

    // Step 6b: Cross-source duplicate check (CSV vs FinAPI) via datum + betrag + buchungsreferenz
    // Catches transactions already imported via CSV that overlap with FinAPI transactions.
    const crossSourceKeys = normalized
      .filter(t => !existingExterneIds.has(t.externe_id) && t.buchungsreferenz)
      .map(t => `${t.datum}__${t.betrag}__${t.buchungsreferenz}`)

    const existingCrossSourceKeys = new Set<string>()

    if (crossSourceKeys.length > 0) {
      // Fetch potential cross-source duplicates: same mandant, no externe_id (CSV-imported)
      const datums = [...new Set(normalized.map(t => t.datum))]
      const { data: csvTransactions } = await supabase
        .from('transaktionen')
        .select('datum, betrag, buchungsreferenz')
        .eq('mandant_id', mandantId)
        .is('externe_id', null)
        .in('datum', datums)

      for (const row of (csvTransactions ?? [])) {
        if (row.buchungsreferenz) {
          existingCrossSourceKeys.add(`${row.datum}__${row.betrag}__${row.buchungsreferenz}`)
        }
      }
    }

    // Step 7: Filter and prepare inserts
    let anzahl_importiert = 0
    let anzahl_duplikate = 0
    let anzahl_gesperrte_monate = 0
    const toInsert = []

    for (const t of normalized) {
      // Duplicate check via externe_id (FinAPI-to-FinAPI)
      if (existingExterneIds.has(t.externe_id)) {
        anzahl_duplikate++
        continue
      }

      // Cross-source duplicate check via datum + betrag + buchungsreferenz (CSV vs FinAPI)
      if (t.buchungsreferenz) {
        const crossKey = `${t.datum}__${t.betrag}__${t.buchungsreferenz}`
        if (existingCrossSourceKeys.has(crossKey)) {
          anzahl_duplikate++
          continue
        }
      }

      // Closed month check
      const [year, month] = t.datum.split('-')
      if (closedMonths.has(`${year}-${month}`)) {
        anzahl_gesperrte_monate++
        continue
      }

      toInsert.push({
        mandant_id: mandantId,
        quelle_id: verbindung.zahlungsquelle_id,
        datum: t.datum,
        betrag: t.betrag,
        beschreibung: t.beschreibung,
        iban_gegenseite: t.iban_gegenseite,
        bic_gegenseite: t.bic_gegenseite,
        buchungsreferenz: t.buchungsreferenz,
        externe_id: t.externe_id,
        import_quelle: 'finapi',
      })

      // Track in-batch duplicates
      existingExterneIds.add(t.externe_id)
    }

    // Step 8: Batch insert
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from('transaktionen')
        .insert(toInsert)

      if (!error) {
        anzahl_importiert = toInsert.length
      } else if (error.code === '23505') {
        // Unique violation (race condition) – insert one by one
        for (const row of toInsert) {
          const { error: rowError } = await supabase.from('transaktionen').insert(row)
          if (!rowError) {
            anzahl_importiert++
          } else if (rowError.code === '23505') {
            anzahl_duplikate++
          }
        }
      } else {
        console.error('[PROJ-20] Batch insert error:', error)
        // Record failure in sync history
        await supabase.from('finapi_sync_historie').insert({
          verbindung_id: id,
          mandant_id: mandantId,
          anzahl_importiert: 0,
          anzahl_duplikate,
          status: 'fehler',
          fehler_meldung: error.message,
        })

        return NextResponse.json(
          { error: `Import fehlgeschlagen: ${error.message}` },
          { status: 500 }
        )
      }
    }

    // Step 9: Update connection sync info
    await supabase
      .from('finapi_verbindungen')
      .update({
        letzter_sync_at: new Date().toISOString(),
        letzter_sync_anzahl: anzahl_importiert,
      })
      .eq('id', id)

    // Step 10: Log sync history
    await supabase.from('finapi_sync_historie').insert({
      verbindung_id: id,
      mandant_id: mandantId,
      anzahl_importiert,
      anzahl_duplikate,
      status: 'erfolg',
    })

    // Step 11: Log import protocol (consistent with CSV import)
    await supabase.from('import_protokolle').insert({
      mandant_id: mandantId,
      quelle_id: verbindung.zahlungsquelle_id,
      dateiname: `FinAPI Sync ${new Date().toISOString().split('T')[0]}`,
      anzahl_importiert,
      anzahl_duplikate,
      anzahl_fehler: 0,
      importiert_von: user.id,
    })

    // Step 12: Run matching engine
    let matching_quote = 0
    if (anzahl_importiert > 0) {
      const stats = await executeMatching(
        supabase,
        mandantId,
        verbindung.zahlungsquelle_id
      ).catch(() => null)
      if (stats && stats.total > 0) {
        matching_quote = Math.round((stats.matched / stats.total) * 100)
      }
    }

    return NextResponse.json({
      anzahl_importiert,
      anzahl_duplikate,
      anzahl_gesperrte_monate,
      gesamt: finapiTransactions.length,
      matching_quote,
    })
  } catch (err) {
    console.error('[PROJ-20] POST /api/finapi/sync/[id] error:', err)

    // Check if SCA is needed (FinAPI returns 403 or specific error)
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
    const isSCAError = message.includes('SCA') || message.includes('consent') || message.includes('403')

    if (isSCAError) {
      // Update status to sca_faellig
      await supabase
        .from('finapi_verbindungen')
        .update({ status: 'sca_faellig' })
        .eq('id', id)

      // Log failed sync
      await supabase.from('finapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'fehler',
        fehler_meldung: 'SCA-Erneuerung notwendig',
      })

      return NextResponse.json(
        { error: 'SCA-Erneuerung notwendig. Bitte erneuern Sie die Bankverbindung.' },
        { status: 403 }
      )
    }

    // Log failed sync (best-effort)
    try {
      await supabase.from('finapi_sync_historie').insert({
        verbindung_id: id,
        mandant_id: mandantId,
        anzahl_importiert: 0,
        anzahl_duplikate: 0,
        status: 'fehler',
        fehler_meldung: message,
      })
    } catch {
      // Ignore – best-effort logging
    }

    return NextResponse.json(
      { error: `Synchronisierung fehlgeschlagen: ${message}` },
      { status: 500 }
    )
  }
}
