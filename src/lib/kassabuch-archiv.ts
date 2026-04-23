import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadKassabuchMonatData } from '@/lib/kassabuch-export'
import { renderKassabuchPdf } from '@/lib/kassabuch-pdf'

export interface ArchivResult {
  success: boolean
  already_archived?: boolean
  storage_path?: string
  error?: string
}

/**
 * Generiert das Kassabuch-Archiv-PDF für einen abgeschlossenen Monat,
 * lädt es in Storage hoch und legt einen kassabuch_archiv-Eintrag an.
 * Idempotent: Falls bereits ein Eintrag existiert, wird nichts überschrieben.
 */
export async function generiereKassabuchArchiv(
  supabase: SupabaseClient,
  mandantId: string,
  monat: string,
  userId: string,
  gesperrtAm: Date,
): Promise<ArchivResult> {
  const { data: existing } = await supabase
    .from('kassabuch_archiv')
    .select('id, storage_path')
    .eq('mandant_id', mandantId)
    .eq('monat', monat)
    .maybeSingle()

  if (existing) {
    return { success: true, already_archived: true, storage_path: existing.storage_path }
  }

  try {
    const data = await loadKassabuchMonatData(supabase, mandantId, monat)
    const [y, m] = monat.split('-').map(Number)
    const monatsName = new Date(y, m - 1, 1).toLocaleDateString('de-AT', { month: 'long' })
    const anfangssaldoDatum = `${monat}-01`
    const endsaldoDatum = new Date(y, m, 0).toISOString().split('T')[0]

    const pdfBuffer = await renderKassabuchPdf({
      mandantName: data.mandantName,
      zeitraumLabel: `${monatsName} ${y}`,
      anfangssaldo: data.anfangssaldoMonat,
      anfangssaldoDatum,
      endsaldo: data.endsaldoMonat,
      endsaldoDatum,
      summeEinnahmen: data.summeEinnahmen,
      summeAusgaben: data.summeAusgaben,
      buchungen: data.buchungenPdf,
      erstelltAm: new Date(),
      gesperrtAm,
    })

    const storagePath = `${mandantId}/${monat}.pdf`
    const admin = createAdminClient()

    const { error: uploadErr } = await admin.storage
      .from('kassabuch-archive')
      .upload(storagePath, new Uint8Array(pdfBuffer), {
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadErr && !/already exists|duplicate/i.test(uploadErr.message)) {
      return { success: false, error: uploadErr.message }
    }

    const { error: insertErr } = await supabase
      .from('kassabuch_archiv')
      .insert({ mandant_id: mandantId, monat, storage_path: storagePath, erstellt_von: userId })

    if (insertErr) {
      if (insertErr.code === '23505') {
        return { success: true, already_archived: true, storage_path: storagePath }
      }
      return { success: false, error: insertErr.message }
    }

    return { success: true, storage_path: storagePath }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Archivierung fehlgeschlagen' }
  }
}
