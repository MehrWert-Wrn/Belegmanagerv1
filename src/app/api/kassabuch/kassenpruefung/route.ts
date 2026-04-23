/**
 * POST /api/kassabuch/kassenpruefung
 * Body: { istbestand: number (>= 0), begruendung?: string }
 *
 * - Berechnet Buchbestand (Anfangssaldo + Summe aller nicht-gelöschten Buchungen)
 * - Ruft kassa_pruefung_atomic RPC auf – beide INSERTs in einer DB-Transaktion
 *   (verhindert lfd_nr-Lücken bei Rollback, § 131 BAO)
 * - Bei Differenz ≠ 0: DIFFERENZ-Transaktion + Pflicht-Begründung (min 5 Zeichen)
 * - Bei Differenz = 0: nur Protokoll, keine Buchung
 */
import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  istbestand: z.number().min(0, 'Bargeld kann nicht negativ sein').max(99999999.99, 'Betrag zu hoch'),
  begruendung: z.string().trim().min(5, 'Mindestens 5 Zeichen').max(500).optional().nullable(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { istbestand, begruendung } = parsed.data

  const kasse = await getOrCreateKasseQuelle(supabase, mandantId)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle nicht gefunden' }, { status: 500 })

  const heute = new Date().toISOString().split('T')[0]
  if (await isMonatGesperrt(supabase, mandantId, heute)) {
    return NextResponse.json(
      { error: 'Der aktuelle Monat ist bereits abgeschlossen – keine Kassenprüfung möglich.' },
      { status: 403 }
    )
  }

  // Buchbestand ermitteln
  const { data: sumData, error: sumErr } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)

  if (sumErr) return NextResponse.json({ error: sumErr.message }, { status: 500 })

  const summe = (sumData ?? []).reduce((acc, t) => acc + Number(t.betrag), 0)
  const buchbestand = Number(kasse.anfangssaldo ?? 0) + summe
  const differenz = Math.round((istbestand - buchbestand) * 100) / 100

  // istbestand >= 0 ist bereits durch Zod validiert → neuer Kassastand nach Prüfung = istbestand >= 0 (§ 131 BAO)

  if (differenz !== 0) {
    if (!begruendung || begruendung.length < 5) {
      return NextResponse.json(
        { error: 'Begründung ist bei einer Kassadifferenz Pflicht (min. 5 Zeichen).' },
        { status: 400 }
      )
    }
  }

  // Atomic RPC: DIFFERENZ-Transaktion + kassa_pruefungen in einer DB-Transaktion
  const { data: pruefung, error: rpcErr } = await supabase.rpc('kassa_pruefung_atomic', {
    p_mandant_id:    mandantId,
    p_quelle_id:     kasse.id,
    p_geprueft_von:  user.id,
    p_istbestand:    istbestand,
    p_buchbestand:   buchbestand,
    p_differenz:     differenz,
    p_begruendung:   begruendung ?? null,
    p_datum:         heute,
  })

  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    pruefung,
    differenz,
    differenz_transaktion_id: (pruefung as { differenz_transaktion_id?: string })?.differenz_transaktion_id ?? null,
  }, { status: 201 })
}
