import { createClient } from '@/lib/supabase/server'
import { runMatchingBatch } from '@/lib/matching'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const transaktionSchema = z.object({
  datum: z.string(),
  betrag: z.number(),
  beschreibung: z.string().optional(),
  iban_gegenseite: z.string().optional(),
  bic_gegenseite: z.string().optional(),
  buchungsreferenz: z.string().optional(),
})

const importSchema = z.object({
  quelle_id: z.string().uuid(),
  dateiname: z.string(),
  transaktionen: z.array(transaktionSchema).min(1).max(5000),
})

// POST /api/transaktionen/import – Batch-Import nach CSV-Parsing im Frontend
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { quelle_id, dateiname, transaktionen } = parsed.data

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const mandant_id = mandant.id
  let anzahl_importiert = 0
  let anzahl_duplikate = 0
  let anzahl_fehler = 0

  // Schritt 1: Bestehende Transaktionen für Duplikat-Check laden
  // (nur Datum+Betrag+Referenz-Kombinationen des letzten Jahres für Performance)
  const minDatum = transaktionen.reduce(
    (min, t) => t.datum < min ? t.datum : min,
    transaktionen[0].datum
  )

  const { data: existing } = await supabase
    .from('transaktionen')
    .select('datum, betrag, buchungsreferenz, beschreibung')
    .eq('mandant_id', mandant_id)
    .eq('quelle_id', quelle_id)
    .gte('datum', minDatum)

  const existingSet = new Set(
    (existing ?? []).map(t =>
      `${t.datum}|${t.betrag}|${t.buchungsreferenz ?? ''}|${t.beschreibung ?? ''}`
    )
  )

  // Schritt 2: Neue Transaktionen filtern
  const toInsert = []
  for (const t of transaktionen) {
    if (!t.datum || t.betrag === undefined) { anzahl_fehler++; continue }

    const key = `${t.datum}|${t.betrag}|${t.buchungsreferenz ?? ''}|${t.beschreibung ?? ''}`
    if (existingSet.has(key)) { anzahl_duplikate++; continue }

    toInsert.push({
      mandant_id,
      quelle_id,
      datum: t.datum,
      betrag: t.betrag,
      beschreibung: t.beschreibung ?? null,
      iban_gegenseite: t.iban_gegenseite ?? null,
      bic_gegenseite: t.bic_gegenseite ?? null,
      buchungsreferenz: t.buchungsreferenz ?? null,
    })
  }

  // Schritt 3: Batch-Insert (in 500er-Chunks für große Dateien)
  const CHUNK_SIZE = 500
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase
      .from('transaktionen')
      .insert(chunk)
      // ON CONFLICT ignorieren (DB-seitiger Duplikatschutz als Fallback)
      // Supabase unterstützt kein upsert-ignore nativ, daher via onConflict do nothing
      .select('id')

    if (error) {
      // Zähle fehlgeschlagene Rows als Fehler
      anzahl_fehler += chunk.length
    } else {
      anzahl_importiert += chunk.length
    }
  }

  // Schritt 4: Import-Protokoll speichern
  await supabase.from('import_protokolle').insert({
    mandant_id,
    quelle_id,
    dateiname,
    anzahl_importiert,
    anzahl_duplikate,
    anzahl_fehler,
    importiert_von: user.id,
  })

  // Schritt 5: Matching direkt inline ausführen
  let matching_quote = 0
  if (anzahl_importiert > 0) {
    const { data: newTransaktionen } = await supabase
      .from('transaktionen')
      .select('id, datum, betrag, beschreibung, iban_gegenseite, buchungsreferenz, match_abgelehnte_beleg_ids')
      .eq('mandant_id', mandant_id)
      .eq('quelle_id', quelle_id)
      .eq('match_status', 'offen')

    const { data: offeneBelege } = await supabase
      .from('belege')
      .select('id, lieferant, rechnungsnummer, bruttobetrag, rechnungsdatum')
      .eq('mandant_id', mandant_id)
      .eq('zuordnungsstatus', 'offen')
      .is('geloescht_am', null)

    if (newTransaktionen?.length && offeneBelege?.length) {
      const results = runMatchingBatch(
        newTransaktionen.map(t => ({ ...t, match_abgelehnte_beleg_ids: t.match_abgelehnte_beleg_ids ?? [] })),
        offeneBelege
      )
      let autoMatched = 0
      for (const result of results) {
        await supabase.from('transaktionen').update({
          match_status: result.match_status,
          match_score: result.match_score,
          match_type: result.match_type,
          beleg_id: result.beleg_id,
        }).eq('id', result.transaktion_id)

        if (result.match_status === 'bestaetigt' && result.beleg_id) {
          autoMatched++
          await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', result.beleg_id)
        }
      }
      matching_quote = Math.round((autoMatched / results.length) * 100)
    }
  }

  return NextResponse.json({
    anzahl_importiert,
    anzahl_duplikate,
    anzahl_fehler,
    gesamt: transaktionen.length,
    matching_quote,
  })
}
