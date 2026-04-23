import { NextResponse } from 'next/server'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getMandantId, requireAuth } from '@/lib/auth-helpers'

// -----------------------------------------------------------------------------
// PROJ-21: Onboarding-Checkliste API
// GET   /api/onboarding/progress   -> aktuellen Fortschritt laden
// PATCH /api/onboarding/progress   -> Schritt abhaken ODER Checkliste schliessen
// -----------------------------------------------------------------------------

const STEP_KEYS = [
  // Pre-divider: Testphase-Tour (Schritte 1–8)
  'email_address_done',
  'belege_hochladen_done',
  'mobile_app_done',
  'email_test_done',
  'transactions_done',
  'matching_done',
  'kassabuch_done',
  'monatsabschluss_done',
  'appointment_done',
  // Post-divider: Aktives bezahltes Konto
  'email_connection_done',
  'whatsapp_done',
  'portal_connections_done',
] as const

type StepKey = (typeof STEP_KEYS)[number]

const patchSchema = z.union([
  z.object({
    step_key: z.enum(STEP_KEYS),
  }),
  z.object({
    action: z.literal('dismiss'),
  }),
])

const SELECT_COLUMNS =
  'email_address_done, belege_hochladen_done, mobile_app_done, email_test_done, transactions_done, matching_done, kassabuch_done, monatsabschluss_done, appointment_done, email_connection_done, whatsapp_done, portal_connections_done, dismissed_at'

// -----------------------------------------------------------------------------
// GET
// -----------------------------------------------------------------------------

export async function GET() {
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  const { data, error } = await supabase
    .from('onboarding_progress')
    .select(SELECT_COLUMNS)
    .eq('mandant_id', mandantId)
    .maybeSingle()

  if (error) {
    console.error('onboarding_progress GET error:', error.message)
    return NextResponse.json({ error: 'Fehler beim Laden des Onboarding-Fortschritts' }, { status: 500 })
  }

  if (!data) {
    // Opt-in: Bestands-Mandanten ohne Eintrag sehen die Checkliste nicht
    return NextResponse.json({ error: 'Kein Onboarding-Fortschritt gefunden' }, { status: 404 })
  }

  return NextResponse.json(data)
}

// -----------------------------------------------------------------------------
// PATCH
// -----------------------------------------------------------------------------

export async function PATCH(request: Request) {
  const supabase = await createClient()

  const { user, error: authError } = await requireAuth(supabase)
  if (authError) return authError
  if (!user) return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })

  const mandantId = await getMandantId(supabase)
  if (!mandantId) {
    return NextResponse.json({ error: 'Kein Mandant gefunden' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiges JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Ungültige Eingabe', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Aktuellen Eintrag laden (MUSS existieren, sonst 404 -> Opt-in)
  const { data: existing, error: loadError } = await supabase
    .from('onboarding_progress')
    .select(SELECT_COLUMNS)
    .eq('mandant_id', mandantId)
    .maybeSingle()

  if (loadError) {
    console.error('onboarding_progress PATCH load error:', loadError.message)
    return NextResponse.json({ error: 'Fehler beim Laden des Onboarding-Fortschritts' }, { status: 500 })
  }

  if (!existing) {
    return NextResponse.json({ error: 'Kein Onboarding-Fortschritt gefunden' }, { status: 404 })
  }

  // Bereits dismissed -> keine weiteren Aenderungen zulassen
  if (existing.dismissed_at) {
    return NextResponse.json({ error: 'Checkliste ist bereits geschlossen' }, { status: 409 })
  }

  let updatePayload: Record<string, unknown> = {}

  if ('action' in parsed.data) {
    // Dismiss -> nur erlaubt wenn alle Schritte erledigt
    const allDone = STEP_KEYS.every((k) => existing[k as StepKey] === true)
    if (!allDone) {
      return NextResponse.json(
        { error: 'Checkliste kann erst geschlossen werden, wenn alle Schritte erledigt sind' },
        { status: 400 }
      )
    }
    updatePayload = { dismissed_at: new Date().toISOString() }
  } else {
    // Einzel-Schritt abhaken (kein Rueckgaengigmachen)
    const stepKey = parsed.data.step_key
    if (existing[stepKey] === true) {
      return NextResponse.json(existing)
    }
    updatePayload = { [stepKey]: true }
  }

  const { data: updated, error: updateError } = await supabase
    .from('onboarding_progress')
    .update(updatePayload)
    .eq('mandant_id', mandantId)
    .select(SELECT_COLUMNS)
    .single()

  if (updateError || !updated) {
    console.error('onboarding_progress PATCH update error:', updateError?.message)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
