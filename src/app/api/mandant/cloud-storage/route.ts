import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveContext } from '@/lib/admin-context'

const schema = z.object({
  cloud_storage_url: z.string().url('Ungültige URL').max(2048).nullable(),
})

export async function GET() {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('mandanten')
    .select('cloud_storage_url')
    .eq('id', ctx.mandantId)
    .single()

  if (error) return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 })
  return NextResponse.json({ cloud_storage_url: data.cloud_storage_url ?? null })
}

export async function PATCH(request: Request) {
  const ctx = await getEffectiveContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Ungültiger Body' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('mandanten')
    .update({ cloud_storage_url: parsed.data.cloud_storage_url })
    .eq('id', ctx.mandantId)

  if (error) return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
