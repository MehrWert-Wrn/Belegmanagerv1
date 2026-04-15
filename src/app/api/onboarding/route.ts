import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const onboardingSchema = z.object({
  firmenname: z.string().min(1, 'Firmenname ist erforderlich').max(255),
  rechtsform: z.string().min(1, 'Rechtsform ist erforderlich').max(100),
  buchfuehrungsart: z.enum(['DOPPELT', 'EAR']).nullable().optional(),
  firmenbuchnummer: z.string().max(50).optional().nullable(),
  uid_nummer: z
    .string()
    .regex(/^(ATU\d{8})?$/, 'Format: ATU gefolgt von 8 Ziffern')
    .optional()
    .nullable(),
  strasse: z.string().max(255).optional().nullable(),
  plz: z.string().max(10).optional().nullable(),
  ort: z.string().max(100).optional().nullable(),
  telefonnummer: z.string().min(1, 'Telefonnummer ist erforderlich').max(50),
  geschaeftsjahr_beginn: z.number().int().min(1).max(12),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = onboardingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Eingabe', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const d = parsed.data

  const { data: mandant, error: mandantError } = await supabase
    .from('mandanten')
    .upsert({
      owner_id: user.id,
      firmenname: d.firmenname,
      rechtsform: d.rechtsform || null,
      buchfuehrungsart: d.buchfuehrungsart || null,
      firmenbuchnummer: d.firmenbuchnummer || null,
      uid_nummer: d.uid_nummer || null,
      strasse: d.strasse || null,
      plz: d.plz || null,
      ort: d.ort || null,
      telefonnummer: d.telefonnummer,
      land: 'AT',
      geschaeftsjahr_beginn: d.geschaeftsjahr_beginn,
      onboarding_abgeschlossen: true,
    }, { onConflict: 'owner_id' })
    .select('id')
    .single()

  if (mandantError || !mandant) {
    return NextResponse.json({ error: 'Fehler beim Speichern des Mandanten' }, { status: 500 })
  }

  const { error: userError } = await supabase
    .from('mandant_users')
    .upsert({
      mandant_id: mandant.id,
      user_id: user.id,
      email: user.email ?? '',
      rolle: 'admin',
      aktiv: true,
    }, { onConflict: 'mandant_id,user_id' })

  if (userError) {
    return NextResponse.json({ error: 'Fehler beim Anlegen des Admin-Benutzers' }, { status: 500 })
  }

  // PROJ-3: Create the belege import staging table for this mandant (via service role)
  try {
    const adminClient = createAdminClient()
    const { error: stagingError } = await adminClient.rpc('create_belege_import_table', {
      p_mandant_id: mandant.id,
      p_firmenname: d.firmenname,
    })
    if (stagingError) {
      console.error('Failed to create belege import staging table:', stagingError.message)
      // Non-fatal: mandant is created, staging table can be created manually later
    }
  } catch (err) {
    console.error('Error creating belege import staging table:', err)
    // Non-fatal: don't block onboarding
  }

  // PROJ-21: Create the onboarding progress row (opt-in mechanism).
  // Only new mandanten (via this POST) get a row -> existing mandanten will not see the checklist.
  const { error: progressError } = await supabase
    .from('onboarding_progress')
    .insert({ mandant_id: mandant.id })

  if (progressError && progressError.code !== '23505') {
    // 23505 = unique_violation -> Eintrag existiert bereits (z.B. Re-Submit), das ist OK
    console.error('Failed to create onboarding_progress row:', progressError.message)
    // Non-fatal: mandant is created, checklist just won't be shown
  }

  return NextResponse.json({ mandant_id: mandant.id })
}
