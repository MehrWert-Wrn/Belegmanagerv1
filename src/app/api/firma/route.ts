import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const firmaSchema = z.object({
  firmenname: z.string().min(1, 'Firmenname ist erforderlich').max(255),
  rechtsform: z.string().max(100).optional().nullable(),
  uid_nummer: z
    .string()
    .regex(/^(ATU\d{8})?$/, 'Format: ATU gefolgt von 8 Ziffern')
    .optional()
    .nullable(),
  strasse: z.string().max(255).optional().nullable(),
  plz: z.string().max(10).optional().nullable(),
  ort: z.string().max(100).optional().nullable(),
  geschaeftsjahr_beginn: z.number().int().min(1).max(12),
  beraternummer: z
    .string()
    .regex(/^\d{5,7}$/, 'Beraternummer: 5–7 Ziffern')
    .optional()
    .nullable(),
  mandantennummer: z
    .string()
    .regex(/^\d{1,5}$/, 'Mandantennummer: 1–5 Ziffern')
    .optional()
    .nullable(),
})

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await requireAdmin(supabase)
  if (admin.error) return admin.error

  const body = await request.json()
  const parsed = firmaSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Eingabe', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const d = parsed.data
  const { error } = await supabase
    .from('mandanten')
    .update({
      firmenname: d.firmenname,
      rechtsform: d.rechtsform || null,
      uid_nummer: d.uid_nummer || null,
      strasse: d.strasse || null,
      plz: d.plz || null,
      ort: d.ort || null,
      geschaeftsjahr_beginn: d.geschaeftsjahr_beginn,
      beraternummer: d.beraternummer || null,
      mandantennummer: d.mandantennummer || null,
    })
    .eq('owner_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
