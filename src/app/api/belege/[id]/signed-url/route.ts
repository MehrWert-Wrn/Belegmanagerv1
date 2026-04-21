import { getEffectiveSupabase } from '@/lib/admin-context'
import { NextResponse } from 'next/server'

// GET /api/belege/[id]/signed-url – Temporäre URL für Vorschau (60 Min.)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getEffectiveSupabase()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db: supabase, mandantId } = ctx

  const { id } = await params

  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('storage_path')
    .eq('id', id)
    .eq('mandant_id', mandantId)
    .single()

  if (fetchError || !beleg) {
    return NextResponse.json({ error: 'Beleg nicht gefunden' }, { status: 404 })
  }

  const { data, error } = await supabase.storage
    .from('belege')
    .createSignedUrl(beleg.storage_path, 3600) // 60 Minuten

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: data.signedUrl })
}
