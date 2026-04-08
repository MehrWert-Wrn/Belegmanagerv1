import { createClient } from '@/lib/supabase/server'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const BUCHUNGSTYPEN = ['EINNAHME', 'AUSGABE', 'EINLAGE', 'ENTNAHME'] as const
type Buchungstyp = typeof BUCHUNGSTYPEN[number]

const schema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  betrag: z.number().refine(v => v !== 0, 'Betrag darf nicht 0 sein'),
  beschreibung: z.string().optional(),
  beleg_id: z.string().uuid().optional(),
  mwst_satz: z.number().nullable().optional(),
  mwst_betrag: z.number().nullable().optional(),
  kassa_buchungstyp: z.enum(BUCHUNGSTYPEN).optional(),
})

// GET /api/kassabuch/eintraege – alle Kassaeintraege
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const kasse = await getOrCreateKasseQuelle(supabase, mandantId)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle konnte nicht angelegt werden' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')

  let query = supabase
    .from('transaktionen')
    .select(`
      id, datum, betrag, beschreibung, match_status, match_score, match_type,
      beleg_id, erstellt_am, mwst_satz, mwst_betrag,
      lfd_nr_kassa, kassa_buchungstyp, storno_zu_id, storno_grund,
      belege ( lieferant, rechnungsnummer, bruttobetrag )
    `)
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)
    .order('lfd_nr_kassa', { ascending: false })
    .limit(1000)

  if (datumVon) query = query.gte('datum', datumVon)
  if (datumBis) query = query.lte('datum', datumBis)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Eintraege die bereits storniert wurden markieren
  // (ein anderer Eintrag hat storno_zu_id = diese id)
  const stornierteIds = new Set(
    (data ?? [])
      .filter(e => e.storno_zu_id !== null)
      .map(e => e.storno_zu_id as string)
  )

  const eintraege = (data ?? []).map(e => ({
    ...e,
    ist_storniert: stornierteIds.has(e.id),
  }))

  return NextResponse.json({ eintraege, anfangssaldo: kasse.anfangssaldo })
}

// POST /api/kassabuch/eintraege – neuer Kassaeintrag
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  if (await isMonatGesperrt(supabase, mandantId, parsed.data.datum)) {
    return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
  }

  const kasse = await getOrCreateKasseQuelle(supabase, mandantId)
  if (!kasse) return NextResponse.json({ error: 'Kassaquelle nicht gefunden' }, { status: 500 })

  // BAO §131: Kassastand darf nie negativ werden
  const { data: sumData } = await supabase
    .from('transaktionen')
    .select('betrag')
    .eq('quelle_id', kasse.id)
    .is('geloescht_am', null)

  const currentSumme = (sumData ?? []).reduce((acc, t) => acc + t.betrag, 0)
  const neuerSaldo = kasse.anfangssaldo + currentSumme + parsed.data.betrag
  if (neuerSaldo < 0) {
    return NextResponse.json(
      { error: `Kassenstand wuerde negativ werden (${neuerSaldo.toFixed(2)} EUR). Buchung abgelehnt.` },
      { status: 400 }
    )
  }

  // Buchungstyp aus betrag ableiten wenn nicht explizit gesetzt
  const buchungstyp: Buchungstyp = parsed.data.kassa_buchungstyp ?? (parsed.data.betrag > 0 ? 'EINNAHME' : 'AUSGABE')

  const { beleg_id, kassa_buchungstyp: _bt, ...rest } = parsed.data

  const insert: Record<string, unknown> = {
    ...rest,
    mandant_id: mandantId,
    quelle_id: kasse.id,
    kassa_buchungstyp: buchungstyp,
  }

  if (beleg_id) {
    insert.beleg_id = beleg_id
    insert.match_status = 'bestaetigt'
    insert.match_type = 'MANUAL'
    insert.match_score = 100
    insert.match_bestaetigt_am = new Date().toISOString()
    insert.match_bestaetigt_von = user.id
  }

  const { data, error } = await supabase
    .from('transaktionen')
    .insert(insert)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (beleg_id) {
    await supabase.from('belege').update({ zuordnungsstatus: 'zugeordnet' }).eq('id', beleg_id)
  }

  return NextResponse.json(data, { status: 201 })
}
