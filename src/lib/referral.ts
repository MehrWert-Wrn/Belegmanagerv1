/**
 * PROJ-31: Helper-Funktionen fuer das Weiterempfehlungssystem
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const REFERRAL_CODE_PREFIX = 'BM-'
export const REFERRAL_CODE_REGEX = /^BM-[A-Z0-9]{6}$/
export const REFERRAL_REWARD_AMOUNT_CENTS = 5000 // 50,00 EUR
export const REFERRAL_HOLDING_DAYS = 14

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

/**
 * Erzeugt einen kryptografisch zufaelligen Code im Format BM-XXXXXX.
 */
export function generateReferralCode(): string {
  let code = REFERRAL_CODE_PREFIX
  // Verwende crypto.getRandomValues fuer hochwertige Entropie
  const buf = new Uint32Array(6)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 0xffffffff)
  }
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[buf[i] % ALPHABET.length]
  }
  return code
}

/**
 * Findet oder erzeugt den eindeutigen Referral-Code eines Mandanten.
 * Erwartet einen admin- oder authentifizierten Supabase-Client.
 * Nutzt UNIQUE-Constraint auf mandant_id, um Race-Conditions abzufangen.
 *
 * Bei Code-Kollision (UNIQUE auf code) werden bis zu 3 neue Codes versucht.
 */
export async function getOrCreateReferralCode(
  supabase: SupabaseClient,
  mandantId: string,
): Promise<{ id: string; code: string; total_clicks: number } | null> {
  // 1) Existiert bereits ein Code?
  const { data: existing, error: selectError } = await supabase
    .from('referral_codes')
    .select('id, code, total_clicks')
    .eq('mandant_id', mandantId)
    .maybeSingle()

  if (selectError) {
    console.error('[referral] select existing code failed:', selectError)
    return null
  }

  if (existing) return existing

  // 2) Neuen Code generieren – max. 3 Versuche bei Code-Kollision
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode()
    const { data: inserted, error: insertError } = await supabase
      .from('referral_codes')
      .insert({ mandant_id: mandantId, code })
      .select('id, code, total_clicks')
      .maybeSingle()

    if (!insertError && inserted) return inserted

    // 23505 = unique_violation – kann mandant_id ODER code sein
    if (insertError?.code === '23505') {
      // Falls mandant_id schon belegt ist (Race-Condition), Eintrag holen
      const { data: raceWinner } = await supabase
        .from('referral_codes')
        .select('id, code, total_clicks')
        .eq('mandant_id', mandantId)
        .maybeSingle()
      if (raceWinner) return raceWinner
      // Sonst war es eine Code-Kollision -> neuen Code versuchen
      continue
    }

    console.error('[referral] insert code failed:', insertError)
    return null
  }

  console.error('[referral] could not generate unique code after 3 attempts')
  return null
}

/**
 * Maskiert eine E-Mail-Adresse fuer die UI-Anzeige.
 * "max@firma.at" -> "m***@firma.at"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local.slice(0, 1)}***@${domain}`
}

/**
 * Liefert true, wenn beide E-Mail-Adressen die gleiche Domain teilen.
 */
export function sameEmailDomain(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const da = a.split('@')[1]?.toLowerCase()
  const db = b.split('@')[1]?.toLowerCase()
  if (!da || !db) return false
  return da === db
}

/**
 * Konvertiert Cent in Euro (z.B. fuer Frontend-Anzeige).
 */
export function centsToEuro(cents: number): number {
  return Math.round((cents / 100) * 100) / 100
}

/**
 * Anzahl gesparter Monate aus rewarded-Anzahl. Aktuell 1:1 (1 Reward = 1 Monat).
 */
export function rewardedToMonths(rewardedCount: number): number {
  return rewardedCount
}

/**
 * Anzahl gesparter Euro aus rewarded-Anzahl.
 */
export function rewardedToEuros(rewardedCount: number): number {
  return centsToEuro(rewardedCount * REFERRAL_REWARD_AMOUNT_CENTS)
}
