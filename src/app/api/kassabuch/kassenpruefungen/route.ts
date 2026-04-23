/**
 * GET /api/kassabuch/kassenpruefungen
 * Liste aller Kassenprüfungen des Mandanten (neueste zuerst), inkl. Prüfer-Namen.
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
    .from('kassa_pruefungen')
    .select(`
      id, geprueft_am, geprueft_von, buchbestand, istbestand, differenz,
      begruendung, differenz_transaktion_id
    `)
    .eq('mandant_id', mandantId)
    .order('geprueft_am', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Prüfer-Namen via Admin-API aus auth.users beziehen (Profile-Tabelle hat nur email)
  const userIds = Array.from(new Set(
    (data ?? []).map(p => p.geprueft_von).filter(Boolean) as string[]
  ))

  const nameMap = new Map<string, string>()

  if (userIds.length > 0) {
    try {
      const admin = createAdminClient()
      // Profile-Email als Anzeigename
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email')
        .in('id', userIds)

      for (const p of profiles ?? []) {
        nameMap.set(p.id, p.email ?? '—')
      }
    } catch {
      // Falls Admin-Client nicht verfügbar: Namen werden null
    }
  }

  const pruefungen = (data ?? []).map(p => ({
    ...p,
    geprueft_von_name: p.geprueft_von ? (nameMap.get(p.geprueft_von) ?? null) : null,
  }))

  return NextResponse.json({ pruefungen })
}
