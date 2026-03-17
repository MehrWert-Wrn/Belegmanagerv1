import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Prüft ob der Monat einer Transaktion abgeschlossen ist.
 * Gibt true zurück wenn gesperrt → API soll mit 403 antworten.
 */
export async function isMonatGesperrt(
  supabase: SupabaseClient,
  mandant_id: string,
  datum: string // ISO date string 'YYYY-MM-DD'
): Promise<boolean> {
  const [year, month] = datum.split('-')
  const { data } = await supabase
    .from('monatsabschluesse')
    .select('status')
    .eq('mandant_id', mandant_id)
    .eq('jahr', parseInt(year))
    .eq('monat', parseInt(month))
    .maybeSingle()

  return data?.status === 'abgeschlossen'
}

/**
 * Prüft ob alle Transaktionen im angegebenen Datumsbereich entsperrt sind.
 * Für Batch-Operationen (z.B. Import).
 */
export async function areAllMonateOffen(
  supabase: SupabaseClient,
  mandant_id: string,
  daten: string[] // Array von ISO date strings
): Promise<{ gesperrt: boolean; gesperrte_monate: string[] }> {
  if (daten.length === 0) return { gesperrt: false, gesperrte_monate: [] }

  // Eindeutige Jahr/Monat-Kombinationen
  const monate = [...new Set(daten.map(d => d.substring(0, 7)))]

  const { data: abschluesse } = await supabase
    .from('monatsabschluesse')
    .select('jahr, monat, status')
    .eq('mandant_id', mandant_id)
    .eq('status', 'abgeschlossen')

  const gesperrteSet = new Set(
    (abschluesse ?? []).map(a => `${a.jahr}-${String(a.monat).padStart(2, '0')}`)
  )

  const gesperrte_monate = monate.filter(m => gesperrteSet.has(m))
  return { gesperrt: gesperrte_monate.length > 0, gesperrte_monate }
}
