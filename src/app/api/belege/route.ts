import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAdmin } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { executeMatching } from '@/lib/execute-matching'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const belegSchema = z.object({
  storage_path: z.string(),
  original_filename: z.string(),
  dateityp: z.enum(['pdf', 'jpg', 'jpeg', 'png']),
  file_size: z.number().int().positive().max(MAX_FILE_SIZE, 'Datei darf maximal 10 MB gross sein'),
  lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungsname: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges']).optional(),
  uid_lieferant: z.string().optional(),
  beschreibung: z.string().max(100, 'Beschreibung darf maximal 100 Zeichen lang sein').optional(),
  import_quelle: z.enum(['manuell', 'n8n_import']).optional(),
  bruttobetrag: z.number().nullable().optional(),
  nettobetrag: z.number().nullable().optional(),
  mwst_satz: z.number().nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
})

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Mindestens eine ID erforderlich'),
})

// GET /api/belege – Liste aller Belege (mit optionalen Filtern)
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const lieferant = searchParams.get('lieferant')
  const status = searchParams.get('status')
  const datumVon = searchParams.get('datum_von')
  const datumBis = searchParams.get('datum_bis')
  const betragVon = searchParams.get('betrag_von')
  const betragBis = searchParams.get('betrag_bis')
  const betragNettoVon = searchParams.get('betrag_netto_von')
  const betragNettoBis = searchParams.get('betrag_netto_bis')
  const rechnungsname = searchParams.get('rechnungsname')
  const rechnungstyp = searchParams.get('rechnungstyp')

  let query = supabase
    .from('belege')
    .select('*')
    .is('geloescht_am', null)
    .order('erstellt_am', { ascending: false })

  const esc = (s: string) => s.replace(/%/g, '\\%').replace(/_/g, '\\_')
  if (lieferant) query = query.ilike('lieferant', `%${esc(lieferant)}%`)
  if (rechnungsname) query = query.ilike('rechnungsname', `%${esc(rechnungsname)}%`)
  if (rechnungstyp) query = query.eq('rechnungstyp', rechnungstyp)
  if (status) query = query.eq('zuordnungsstatus', status)
  if (datumVon) query = query.gte('rechnungsdatum', datumVon)
  if (datumBis) query = query.lte('rechnungsdatum', datumBis)
  if (betragVon) query = query.gte('bruttobetrag', parseFloat(betragVon))
  if (betragBis) query = query.lte('bruttobetrag', parseFloat(betragBis))
  if (betragNettoVon) query = query.gte('nettobetrag', parseFloat(betragNettoVon))
  if (betragNettoBis) query = query.lte('nettobetrag', parseFloat(betragNettoBis))

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/belege – Beleg-Metadaten nach Upload speichern
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = belegSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { file_size: _, ...belegData } = parsed.data

  const { data, error } = await supabase
    .from('belege')
    .insert({ ...belegData, mandant_id: mandantId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // BUG-PROJ5-001: Trigger matching after beleg upload (fire-and-forget, errors non-fatal)
  // BUG-PROJ5-R4-005: Log errors so failures are visible in server logs
  executeMatching(supabase, mandantId).catch((err) =>
    console.error('[belege] Post-upload matching failed:', err)
  )

  return NextResponse.json(data, { status: 201 })
}

// DELETE /api/belege – Bulk soft-delete multiple Belege + unlink matched transactions
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const body = await request.json()
  const parsed = bulkDeleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ids } = parsed.data

  // BUG-PROJ3-020: Explicitly scope to mandant_id (defense-in-depth, not just RLS)
  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })

  // Fetch all belege being deleted to check lock status
  const { data: belegeToDelete, error: fetchError } = await supabase
    .from('belege')
    .select('id, zuordnungsstatus')
    .in('id', ids)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })

  if (!belegeToDelete || belegeToDelete.length === 0) {
    return NextResponse.json({ error: 'Keine Belege gefunden' }, { status: 404 })
  }

  // BUG-PROJ3-019: Check Monats-Lock for belege that are linked to transactions
  const zugeordneteBelege = belegeToDelete.filter(b => b.zuordnungsstatus === 'zugeordnet')
  if (zugeordneteBelege.length > 0) {
    const zugeordneteIds = zugeordneteBelege.map(b => b.id)
    const { data: linkedTxs } = await supabase
      .from('transaktionen')
      .select('beleg_id, datum')
      .in('beleg_id', zugeordneteIds)
      .eq('mandant_id', mandantId)

    if (linkedTxs && linkedTxs.length > 0) {
      const gesperrteBelegIds: string[] = []
      for (const tx of linkedTxs) {
        const gesperrt = await isMonatGesperrt(supabase, mandantId, tx.datum)
        if (gesperrt && tx.beleg_id) {
          gesperrteBelegIds.push(tx.beleg_id)
        }
      }
      if (gesperrteBelegIds.length > 0) {
        return NextResponse.json({
          error: `${gesperrteBelegIds.length} Beleg(e) gehoeren zu abgeschlossenen Monaten und koennen nicht geloescht werden.`,
          gesperrte_beleg_ids: gesperrteBelegIds,
        }, { status: 409 })
      }
    }
  }

  const validIds = belegeToDelete.map(b => b.id)

  // Soft-delete all belege by setting geloescht_am
  const { error: deleteError } = await supabase
    .from('belege')
    .update({ geloescht_am: new Date().toISOString() })
    .in('id', validIds)
    .eq('mandant_id', mandantId)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  // Unlink any transactions that reference any of the deleted belege
  const { error: unlinkError } = await supabase
    .from('transaktionen')
    .update({
      beleg_id: null,
      match_status: 'offen',
      match_type: null,
      match_score: 0,
      match_bestaetigt_am: null,
      match_bestaetigt_von: null,
    })
    .in('beleg_id', validIds)
    .eq('mandant_id', mandantId)

  if (unlinkError) {
    // Non-fatal: belege are already soft-deleted, log but don't fail
    console.error('Failed to unlink transactions during bulk delete:', unlinkError.message)
  }

  return NextResponse.json({ success: true, deleted_count: validIds.length })
}
