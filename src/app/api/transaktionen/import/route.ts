import { createClient } from '@/lib/supabase/server'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const transaktionSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum muss im Format JJJJ-MM-TT sein'),
  betrag: z.number(),
  beschreibung: z.string().max(5000).nullable().optional(),
  iban_gegenseite: z.string().max(34).nullable().optional(),
  bic_gegenseite: z.string().max(11).nullable().optional(),
  buchungsreferenz: z.string().max(255).nullable().optional(),
})

const importSchema = z.object({
  quelle_id: z.string().uuid(),
  dateiname: z.string().max(255),
  transaktionen: z.array(transaktionSchema).min(1).max(5000),
})

// POST /api/transaktionen/import – Batch-Import nach CSV-Parsing im Frontend
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) {
    const flat = parsed.error.flatten()
    const fieldMsg = Object.entries(flat.fieldErrors)
      .map(([f, msgs]) => `${f}: ${msgs?.join(', ')}`)
      .join('; ')
    const message = flat.formErrors.join('; ') || fieldMsg || 'Validierungsfehler'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { quelle_id, dateiname, transaktionen } = parsed.data

  const { data: mandant_id } = await supabase.rpc('get_mandant_id')
  if (!mandant_id) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  // quelle_id muss zum Mandanten des Users gehören
  const { data: quelle } = await supabase
    .from('zahlungsquellen')
    .select('id')
    .eq('id', quelle_id)
    .eq('mandant_id', mandant_id)
    .single()
  if (!quelle) return NextResponse.json({ error: 'Zahlungsquelle nicht gefunden' }, { status: 404 })

  let anzahl_importiert = 0
  let anzahl_duplikate = 0
  let anzahl_fehler = 0
  let anzahl_gesperrte_monate = 0

  // Schritt 0: Gesperrte Monate prüfen (Monatsabschluss-Lock)
  const uniqueMonths = new Set(
    transaktionen
      .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.datum))
      .map(t => {
        const [year, month] = t.datum.split('-')
        return `${year}-${month}`
      })
  )
  const closedMonths = new Set<string>()
  if (uniqueMonths.size > 0) {
    const uniqueJahre = [...new Set([...uniqueMonths].map(m => parseInt(m.split('-')[0])))]
    const { data: abschluesse } = await supabase
      .from('monatsabschluesse')
      .select('jahr, monat')
      .eq('mandant_id', mandant_id)
      .eq('status', 'abgeschlossen')
      .in('jahr', uniqueJahre)
    for (const a of (abschluesse ?? [])) {
      closedMonths.add(`${a.jahr}-${String(a.monat).padStart(2, '0')}`)
    }
  }

  // Schritt 1: Bestehende Transaktionen für Duplikat-Check laden
  // Nur den Datumsbereich der CSV abfragen (min–max) für Performance
  const minDatum = transaktionen.reduce(
    (min, t) => t.datum < min ? t.datum : min,
    transaktionen[0].datum
  )
  const maxDatum = transaktionen.reduce(
    (max, t) => t.datum > max ? t.datum : max,
    transaktionen[0].datum
  )

  const { data: existing } = await supabase
    .from('transaktionen')
    .select('datum, betrag, buchungsreferenz, beschreibung')
    .eq('mandant_id', mandant_id)
    .eq('quelle_id', quelle_id)
    .gte('datum', minDatum)
    .lte('datum', maxDatum)

  const existingSet = new Set(
    (existing ?? []).map(t =>
      `${t.datum}|${t.betrag}|${t.buchungsreferenz ?? ''}|${t.beschreibung ?? ''}`
    )
  )

  // Schritt 2: Neue Transaktionen filtern
  const toInsert = []
  for (const t of transaktionen) {
    if (!t.datum || t.betrag === undefined) { anzahl_fehler++; continue }

    // Gesperrten Monat prüfen
    if (/^\d{4}-\d{2}-\d{2}$/.test(t.datum)) {
      const [year, month] = t.datum.split('-')
      const monthKey = `${year}-${month}`
      if (closedMonths.has(monthKey)) { anzahl_gesperrte_monate++; continue }
    }

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

  // Schritt 3: Einzelner Batch-Insert (atomar – entweder alle oder keine)
  // Bei DB-Unique-Verletzung (Race Condition): Fallback auf Zeile-für-Zeile
  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('transaktionen')
      .insert(toInsert)

    if (!error) {
      anzahl_importiert += toInsert.length
    } else if (error.code === '23505') {
      // Unique-Verletzung durch Race Condition (zwei parallele Imports)
      // Zeile-für-Zeile einfügen, um Duplikate exakt zu zählen
      for (const row of toInsert) {
        const { error: rowError } = await supabase.from('transaktionen').insert(row)
        if (!rowError) {
          anzahl_importiert++
        } else if (rowError.code === '23505') {
          anzahl_duplikate++
        } else {
          anzahl_fehler++
        }
      }
    } else {
      anzahl_fehler += toInsert.length
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

  // Schritt 5: Matching ausführen (mit Beleg-Deduplication via executeMatching)
  let matching_quote = 0
  if (anzahl_importiert > 0) {
    const stats = await executeMatching(supabase, mandant_id, quelle_id).catch(() => null)
    if (stats && stats.total > 0) {
      matching_quote = Math.round((stats.matched / stats.total) * 100)
    }
  }

  return NextResponse.json({
    anzahl_importiert,
    anzahl_duplikate,
    anzahl_fehler,
    anzahl_gesperrte_monate,
    gesamt: transaktionen.length,
    matching_quote,
  })
}
