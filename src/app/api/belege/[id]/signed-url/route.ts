import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/belege/[id]/signed-url – Temporäre URL für Vorschau (60 Min.)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: beleg, error: fetchError } = await supabase
    .from('belege')
    .select('storage_path')
    .eq('id', id)
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
