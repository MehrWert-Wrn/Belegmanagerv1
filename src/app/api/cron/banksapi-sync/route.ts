/**
 * PROJ-20: Täglicher BanksAPI-Sync (Cron Job)
 * GET /api/cron/banksapi-sync
 *
 * Wird täglich um 03:00 UTC von Vercel Cron aufgerufen.
 * Synchronisiert alle aktiven BanksAPI-Verbindungen aller Mandanten.
 * Authentifizierung via CRON_SECRET (Authorization: Bearer <secret>).
 */

export const maxDuration = 300

import { createAdminClient } from '@/lib/supabase/admin'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import {
  decrypt,
  getTransactions,
  getUserToken,
  normalizeTransaction,
} from '@/lib/banksapi'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: verbindungen, error: loadError } = await supabase
    .from('banksapi_verbindungen')
    .select(
      'id, mandant_id, zahlungsquelle_id, banksapi_username, banksapi_access_id, banksapi_product_id, letzter_sync_at',
    )
    .eq('status', 'aktiv')
    .not('banksapi_access_id', 'is', null)
    .not('banksapi_product_id', 'is', null)
    .not('zahlungsquelle_id', 'is', null)

  if (loadError) {
    console.error('[CRON banksapi-sync] Verbindungen laden fehlgeschlagen:', loadError)
    return NextResponse.json({ error: loadError.message }, { status: 500 })
  }

  type SyncResult = {
    verbindung_id: string
    mandant_id: string
    status: 'success' | 'error' | 'skipped'
    importiert?: number
    duplikate?: number
    fehler?: string
  }

  const results: SyncResult[] = []

  for (const verbindung of verbindungen ?? []) {
    try {
      const { data: lastSession } = await supabase
        .from('banksapi_webform_sessions')
        .select('banksapi_user_password_encrypted')
        .eq('mandant_id', verbindung.mandant_id)
        .eq('banksapi_username', verbindung.banksapi_username)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!lastSession?.banksapi_user_password_encrypted) {
        results.push({
          verbindung_id: verbindung.id,
          mandant_id: verbindung.mandant_id,
          status: 'skipped',
          fehler: 'Keine Credentials',
        })
        continue
      }

      const password = decrypt(lastSession.banksapi_user_password_encrypted)
      const userToken = await getUserToken(verbindung.banksapi_username, password)

      const banksApiTransaktionen = await getTransactions(
        userToken,
        verbindung.banksapi_access_id,
        verbindung.banksapi_product_id,
      )

      if (banksApiTransaktionen.length === 0) {
        await supabase
          .from('banksapi_verbindungen')
          .update({ letzter_sync_at: new Date().toISOString(), letzter_sync_anzahl: 0 })
          .eq('id', verbindung.id)

        await supabase.from('banksapi_sync_historie').insert({
          verbindung_id: verbindung.id,
          mandant_id: verbindung.mandant_id,
          anzahl_importiert: 0,
          anzahl_duplikate: 0,
          status: 'success',
        })

        results.push({
          verbindung_id: verbindung.id,
          mandant_id: verbindung.mandant_id,
          status: 'success',
          importiert: 0,
          duplikate: 0,
        })
        continue
      }

      const normalized = banksApiTransaktionen.map((t) =>
        normalizeTransaction(t, verbindung.zahlungsquelle_id as string, verbindung.mandant_id),
      )

      // Gesperrte Monate ermitteln
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
          .eq('mandant_id', verbindung.mandant_id)
          .eq('status', 'abgeschlossen')
          .in('jahr', uniqueJahre)

        for (const a of abschluesse ?? []) {
          closedMonths.add(`${a.jahr}-${String(a.monat).padStart(2, '0')}`)
        }
      }

      // Duplikate via externe_id
      const externeIds = normalized.map((t) => t.externe_id)
      const { data: existingByExterneId } = await supabase
        .from('transaktionen')
        .select('externe_id')
        .eq('mandant_id', verbindung.mandant_id)
        .in('externe_id', externeIds)

      const existingExterneIds = new Set((existingByExterneId ?? []).map((t) => t.externe_id))

      // Cross-Source-Fallback (CSV-Importe ohne externe_id)
      const datums = [...new Set(normalized.map((t) => t.datum).filter(Boolean))]
      const existingCrossKeys = new Set<string>()

      if (datums.length > 0) {
        const { data: csvTransactions } = await supabase
          .from('transaktionen')
          .select('datum, betrag, beschreibung')
          .eq('mandant_id', verbindung.mandant_id)
          .is('externe_id', null)
          .in('datum', datums)

        for (const row of csvTransactions ?? []) {
          existingCrossKeys.add(`${row.datum}__${row.betrag}__${row.beschreibung ?? ''}`)
        }
      }

      let anzahlImportiert = 0
      let anzahlDuplikate = 0
      const toInsert: Array<(typeof normalized)[number]> = []

      for (const t of normalized) {
        if (!t.datum) continue
        if (existingExterneIds.has(t.externe_id)) { anzahlDuplikate++; continue }
        const crossKey = `${t.datum}__${t.betrag}__${t.beschreibung ?? ''}`
        if (existingCrossKeys.has(crossKey)) { anzahlDuplikate++; continue }
        const [year, month] = t.datum.split('-')
        if (closedMonths.has(`${year}-${month}`)) continue
        toInsert.push(t)
        existingExterneIds.add(t.externe_id)
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase.from('transaktionen').insert(toInsert)
        if (!insertError) {
          anzahlImportiert = toInsert.length
        } else if (insertError.code === '23505') {
          for (const row of toInsert) {
            const { error: rowError } = await supabase.from('transaktionen').insert(row)
            if (!rowError) anzahlImportiert++
            else if (rowError.code === '23505') anzahlDuplikate++
          }
        } else {
          throw new Error(insertError.message)
        }
      }

      await supabase
        .from('banksapi_verbindungen')
        .update({ letzter_sync_at: new Date().toISOString(), letzter_sync_anzahl: anzahlImportiert })
        .eq('id', verbindung.id)

      await supabase.from('banksapi_sync_historie').insert({
        verbindung_id: verbindung.id,
        mandant_id: verbindung.mandant_id,
        anzahl_importiert: anzahlImportiert,
        anzahl_duplikate: anzahlDuplikate,
        status: 'success',
      })

      if (anzahlImportiert > 0) {
        executeMatching(supabase, verbindung.mandant_id, verbindung.zahlungsquelle_id!).catch(() => null)
      }

      results.push({
        verbindung_id: verbindung.id,
        mandant_id: verbindung.mandant_id,
        status: 'success',
        importiert: anzahlImportiert,
        duplikate: anzahlDuplikate,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler'
      const isAuthError =
        message.includes('401') ||
        message.includes('403') ||
        message.toLowerCase().includes('unauthorized')

      if (isAuthError) {
        await supabase
          .from('banksapi_verbindungen')
          .update({ status: 'sca_faellig' })
          .eq('id', verbindung.id)
      }

      try {
        await supabase.from('banksapi_sync_historie').insert({
          verbindung_id: verbindung.id,
          mandant_id: verbindung.mandant_id,
          anzahl_importiert: 0,
          anzahl_duplikate: 0,
          status: 'error',
          fehler_meldung: isAuthError ? 'SCA-Erneuerung notwendig' : message,
        })
      } catch {
        // best-effort
      }

      results.push({
        verbindung_id: verbindung.id,
        mandant_id: verbindung.mandant_id,
        status: 'error',
        fehler: message,
      })
    }
  }

  const gesamt = results.length
  const erfolgreich = results.filter((r) => r.status === 'success').length
  const fehlerhaft = results.filter((r) => r.status === 'error').length
  const uebersprungen = results.filter((r) => r.status === 'skipped').length

  console.log(
    `[CRON banksapi-sync] ${gesamt} Verbindungen | ${erfolgreich} erfolgreich | ${fehlerhaft} Fehler | ${uebersprungen} uebersprungen`,
  )

  return NextResponse.json({ gesamt, erfolgreich, fehlerhaft, uebersprungen, details: results })
}
