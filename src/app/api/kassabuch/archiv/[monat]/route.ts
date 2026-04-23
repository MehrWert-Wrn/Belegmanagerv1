/**
 * GET /api/kassabuch/archiv/[monat]
 * Streamt die archivierte Kassabuch-PDF-Datei direkt als Download.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

type Params = { params: Promise<{ monat: string }> }

export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { monat } = await params
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monat)) {
    return NextResponse.json({ error: 'monat muss Format YYYY-MM haben' }, { status: 400 })
  }

  // Archiv-Eintrag lesen (RLS sichert Mandanten-Scope)
  const { data: archiv, error: archivErr } = await supabase
    .from('kassabuch_archiv')
    .select('storage_path')
    .eq('mandant_id', mandantId)
    .eq('monat', monat)
    .maybeSingle()

  if (archivErr) return NextResponse.json({ error: archivErr.message }, { status: 500 })
  if (!archiv) return NextResponse.json({ error: 'Archiv-Eintrag nicht gefunden' }, { status: 404 })

  // PDF via Service-Role aus Storage laden (Bucket ist privat)
  const admin = createAdminClient()
  const { data: file, error: fileErr } = await admin.storage
    .from('kassabuch-archive')
    .download(archiv.storage_path)

  if (fileErr || !file) {
    return NextResponse.json({ error: 'Archiv-PDF konnte nicht geladen werden' }, { status: 500 })
  }

  const arrayBuffer = await file.arrayBuffer()

  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="kassabuch-${monat}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}
