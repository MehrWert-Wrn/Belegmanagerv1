import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ jahr: string; monat: string }> }

// GET /api/monatsabschluss/[jahr]/[monat] – Status + Vollständigkeitsprüfung
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { jahr: jahrStr, monat: monatStr } = await params
  const jahr = parseInt(jahrStr)
  const monat = parseInt(monatStr)
  if (isNaN(jahr) || isNaN(monat)) return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })

  const { data: mandant } = await supabase
    .from('mandanten').select('id').eq('owner_id', user.id).single()
  if (!mandant) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const mandant_id = mandant.id

  // Monatsabschluss-Record (lazy – kann noch nicht existieren)
  const { data: abschluss } = await supabase
    .from('monatsabschluesse')
    .select('*')
    .eq('mandant_id', mandant_id)
    .eq('jahr', jahr)
    .eq('monat', monat)
    .maybeSingle()

  // Datumsbereich für den Monat
  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0] // letzter Tag des Monats

  // Transaktionen dieses Monats
  const { data: transaktionen } = await supabase
    .from('transaktionen')
    .select('id, match_status, quelle_id')
    .eq('mandant_id', mandant_id)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)

  // Aktive Zahlungsquellen
  const { data: quellen } = await supabase
    .from('zahlungsquellen')
    .select('id, name, typ')
    .eq('mandant_id', mandant_id)
    .eq('aktiv', true)

  // Vollständigkeitsprüfung
  const quellenMitTransaktionen = new Set((transaktionen ?? []).map(t => t.quelle_id))
  const offeneTransaktionen = (transaktionen ?? []).filter(t => t.match_status === 'offen')

  const quellenPruefung = (quellen ?? []).map(q => ({
    quelle_id: q.id,
    quelle_name: q.name,
    typ: q.typ,
    hat_transaktionen: quellenMitTransaktionen.has(q.id),
  }))

  const alleQuellenHabenImport = quellenPruefung.every(q => q.hat_transaktionen)
  const anzahlOffen = offeneTransaktionen.length

  // Ampelstatus der Prüfung
  let pruefung_ampel: 'gruen' | 'gelb' | 'rot'
  if (alleQuellenHabenImport && anzahlOffen === 0) pruefung_ampel = 'gruen'
  else if (!alleQuellenHabenImport) pruefung_ampel = 'rot'
  else pruefung_ampel = 'gelb'

  return NextResponse.json({
    abschluss: abschluss ?? {
      status: 'offen',
      jahr,
      monat,
      mandant_id,
    },
    pruefung: {
      ampel: pruefung_ampel,
      quellen: quellenPruefung,
      anzahl_offen: anzahlOffen,
      anzahl_transaktionen: (transaktionen ?? []).length,
      alle_quellen_haben_import: alleQuellenHabenImport,
    },
  })
}
