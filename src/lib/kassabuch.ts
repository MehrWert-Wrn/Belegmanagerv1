import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Gibt die Kassa-Zahlungsquelle zurück oder legt sie an.
 * Lazy creation: erste Verwendung erzeugt die Quelle automatisch.
 */
export async function getOrCreateKasseQuelle(
  supabase: SupabaseClient,
  mandant_id: string
): Promise<{ id: string; anfangssaldo: number } | null> {
  const { data, error } = await supabase
    .rpc('ensure_kassa_quelle', { p_mandant_id: mandant_id })

  if (error || !data) return null

  const { data: quelle } = await supabase
    .from('zahlungsquellen')
    .select('id, anfangssaldo')
    .eq('id', data)
    .single()

  return quelle
}
