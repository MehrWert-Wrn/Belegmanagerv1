/**
 * GET /api/kassabuch/archiv – Liste aller archivierten Monats-PDFs.
 * Joined erstellt_von_name aus profiles.email.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMandantId } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) return NextResponse.json({ error: 'Kein Mandant' }, { status: 404 })

  const { data, error } = await supabase
    .from('kassabuch_archiv')
    .select('id, monat, storage_path, erstellt_am, erstellt_von')
    .eq('mandant_id', mandantId)
    .order('monat', { ascending: false })
    .limit(120)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ersteller-Namen via profiles laden
  const userIds = Array.from(new Set(
    (data ?? []).map(a => a.erstellt_von).filter(Boolean) as string[]
  ))
  const nameMap = new Map<string, string>()
  if (userIds.length > 0) {
    try {
      const admin = createAdminClient()
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
      for (const p of profiles ?? []) nameMap.set(p.id, p.email ?? '—')
    } catch {
      // Ohne Ersteller-Name weiterliefern
    }
  }

  const archiv = (data ?? []).map(a => ({
    id: a.id,
    monat: a.monat,
    storage_path: a.storage_path,
    erstellt_am: a.erstellt_am,
    erstellt_von_name: a.erstellt_von ? (nameMap.get(a.erstellt_von) ?? null) : null,
  }))

  return NextResponse.json({ archiv })
}
