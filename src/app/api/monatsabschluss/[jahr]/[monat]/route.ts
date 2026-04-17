import { createClient } from '@/lib/supabase/server'
import { getMandantId } from '@/lib/auth-helpers'
import { getOrCreateKasseQuelle } from '@/lib/kassabuch'
import { getEarPreviewData } from '@/lib/ear-buchungsnummern'
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
  if (isNaN(jahr) || isNaN(monat) || monat < 1 || monat > 12 || jahr < 2000 || jahr > 2100) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }

  const mandant_id = await getMandantId(supabase)
  if (!mandant_id) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

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
    .select('id, match_status, quelle_id, workflow_status')
    .eq('mandant_id', mandant_id)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)

  // Aktive Zahlungsquellen
  const { data: quellen } = await supabase
    .from('zahlungsquellen')
    .select('id, name, typ, kuerzel')
    .eq('mandant_id', mandant_id)
    .eq('aktiv', true)

  // Vollständigkeitsprüfung
  const quellenMitTransaktionen = new Set((transaktionen ?? []).map(t => t.quelle_id))
  // PROJ-25: Exclude privat transactions from "offen" count
  const offeneTransaktionen = (transaktionen ?? []).filter(
    t => t.match_status === 'offen' && t.workflow_status !== 'privat'
  )

  // BUG-PROJ8-002 fix: anzahl_offen pro Zahlungsquelle
  const quellenPruefung = (quellen ?? []).map(q => ({
    quelle_id: q.id,
    quelle_name: q.name,
    typ: q.typ,
    kuerzel: q.kuerzel,
    hat_transaktionen: quellenMitTransaktionen.has(q.id),
    anzahl_offen: (transaktionen ?? []).filter(
      t => t.quelle_id === q.id && t.match_status === 'offen' && t.workflow_status !== 'privat'
    ).length,
  }))

  const alleQuellenHabenImport = quellenPruefung.every(q => q.hat_transaktionen)
  const anzahlOffen = offeneTransaktionen.length

  // BUG-PROJ8-001 fix: Kassabuch-Saldo am Monatsende prüfen
  let kassa_saldo: number | null = null
  let kassa_saldo_positiv: boolean | null = null
  const kasse = await getOrCreateKasseQuelle(supabase, mandant_id)
  if (kasse) {
    const { data: kassaEintraege } = await supabase
      .from('transaktionen')
      .select('betrag')
      .eq('quelle_id', kasse.id)
      .lte('datum', bisDatum)
      .is('geloescht_am', null)

    if (kassaEintraege) {
      kassa_saldo = kasse.anfangssaldo + kassaEintraege.reduce((acc, t) => acc + t.betrag, 0)
      kassa_saldo_positiv = kassa_saldo >= 0
    }
  }

  // Ampelstatus der Prüfung
  let pruefung_ampel: 'gruen' | 'gelb' | 'rot'
  if (alleQuellenHabenImport && anzahlOffen === 0 && kassa_saldo_positiv !== false) pruefung_ampel = 'gruen'
  else if (!alleQuellenHabenImport) pruefung_ampel = 'rot'
  else pruefung_ampel = 'gelb'

  // PROJ-25: EAR-specific preview data
  const { data: mandant } = await supabase
    .from('mandanten')
    .select('buchfuehrungsart')
    .eq('id', mandant_id)
    .single()

  const isEar = mandant?.buchfuehrungsart === 'EAR'
  let earPreview = null

  if (isEar) {
    earPreview = await getEarPreviewData(supabase, mandant_id, jahr, monat)
  }

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
      kassa_saldo,
      kassa_saldo_positiv,
    },
    ...(isEar && earPreview ? {
      ear: earPreview,
      buchfuehrungsart: 'EAR',
    } : {
      buchfuehrungsart: mandant?.buchfuehrungsart || 'DOPPELT',
    }),
  })
}
