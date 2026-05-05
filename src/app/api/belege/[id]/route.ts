import { getEffectiveSupabase } from '@/lib/admin-context'
import { requireAdmin } from '@/lib/auth-helpers'
import { isMonatGesperrt } from '@/lib/monat-lock'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  lieferant: z.string().optional(),
  rechnungsempfaenger: z.string().optional(),
  rechnungsnummer: z.string().optional(),
  rechnungsname: z.string().optional(),
  rechnungstyp: z.enum(['eingangsrechnung', 'ausgangsrechnung', 'gutschrift', 'sonstiges', 'eigenbeleg', 'eigenverbrauch', 'tageslosung']).optional(),
  uid_lieferant: z.string().optional(),
  lieferant_iban: z.string().optional(),
  mandatsreferenz: z.string().optional(),
  zahlungsreferenz: z.string().optional(),
  bestellnummer: z.string().optional(),
  beschreibung: z.string().max(100, 'Beschreibung darf maximal 100 Zeichen lang sein').optional(),
  bruttobetrag: z.number().nullable().optional(),
  nettobetrag: z.number().nullable().optional(),
  mwst_satz: z.number().nullable().optional(),
  rechnungsdatum: z.string().nullable().optional(),
  faelligkeitsdatum: z.string().nullable().optional(),
  faelligkeit_bezahlt: z.boolean().optional(),
  steuerzeilen: z.array(z.object({
    nettobetrag: z.number().nullable().optional(),
    mwst_satz: z.number().nullable().optional(),
    bruttobetrag: z.number().nullable().optional(),
  })).optional(),
})

// GET /api/belege/[id] – Einzelnen Beleg laden (für Review-Modus)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId } = ctx

  const { id } = await params

  const { data, error } = await supabase
    .from('belege')
    .select('*')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .is('geloescht_am', null)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  return NextResponse.json(data)
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 200)
}

// PATCH /api/belege/[id] – Metadaten aktualisieren
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId: mandant_id } = ctx

  const { id } = await params
  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  // Monats-Lock-Check
  if (mandant_id) {
    const { data: linkedTx } = await supabase
      .from('transaktionen')
      .select('datum')
      .eq('beleg_id', id)
      .eq('mandant_id', mandant_id)
      .maybeSingle()

    if (linkedTx) {
      const gesperrt = await isMonatGesperrt(supabase, mandant_id, linkedTx.datum)
      if (gesperrt) {
        return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
      }
    }
  }

  // Fetch current beleg to check if file rename is needed
  const { data: currentBeleg } = await supabase
    .from('belege')
    .select('storage_path, dateityp, rechnungsname')
    .eq('id', id)
    .eq('mandant_id', mandant_id)
    .single()

  const dbUpdate: Record<string, unknown> = { ...parsed.data }

  // Rename file in storage when rechnungsname changes and a file exists
  if (
    parsed.data.rechnungsname &&
    currentBeleg?.storage_path &&
    parsed.data.rechnungsname !== currentBeleg.rechnungsname
  ) {
    const ext = currentBeleg.dateityp ?? currentBeleg.storage_path.split('.').pop() ?? 'pdf'
    const safeName = sanitizeFilename(parsed.data.rechnungsname)
    const folder = currentBeleg.storage_path.split('/')[0]
    const newStoragePath = `${folder}/${safeName}.${ext}`

    if (newStoragePath !== currentBeleg.storage_path) {
      const { error: copyError } = await supabase.storage
        .from('belege')
        .copy(currentBeleg.storage_path, newStoragePath)

      if (!copyError) {
        await supabase.storage.from('belege').remove([currentBeleg.storage_path])
        dbUpdate.storage_path = newStoragePath
        dbUpdate.original_filename = `${safeName}.${ext}`
      }
    }
  }

  const { data, error } = await supabase
    .from('belege')
    .update(dbUpdate)
    .eq('id', id)
    .eq('mandant_id', mandant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/belege/[id] – Soft Delete (Datei bleibt in Storage für Audit-Trail)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId: mandant_id } = ctx

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const { id } = await params

  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('zuordnungsstatus')
    .eq('id', id)
    .eq('mandant_id', mandant_id)
    .single()

  if (fetchError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  if (beleg.zuordnungsstatus === 'zugeordnet') {
    const { data: linkedTx } = await supabase
      .from('transaktionen')
      .select('datum')
      .eq('beleg_id', id)
      .eq('mandant_id', mandant_id)
      .maybeSingle()

    if (linkedTx) {
      const gesperrt = await isMonatGesperrt(supabase, mandant_id, linkedTx.datum)
      if (gesperrt) {
        return NextResponse.json({ error: 'Monat ist abgeschlossen' }, { status: 403 })
      }
    }
  }

  const { error } = await supabase
    .from('belege')
    .update({ geloescht_am: new Date().toISOString() })
    .eq('id', id)
    .eq('mandant_id', mandant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Unlink any transaction that references this beleg
  if (beleg.zuordnungsstatus === 'zugeordnet') {
    await supabase
      .from('transaktionen')
      .update({
        beleg_id: null,
        match_status: 'offen',
        match_type: null,
        match_score: 0,
        match_bestaetigt_am: null,
        match_bestaetigt_von: null,
      })
      .eq('beleg_id', id)
      .eq('mandant_id', mandant_id)
  }

  return NextResponse.json({
    success: true,
    was_zugeordnet: beleg.zuordnungsstatus === 'zugeordnet',
  })
}
