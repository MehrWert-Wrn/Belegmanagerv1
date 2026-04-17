/**
 * PROJ-25: EAR-Buchungsnummern & Monatsabschluss-Logik
 *
 * Zentraler Ort fuer die gesamte EAR-spezifische Logik:
 * - Kuerzel-Generierung fuer Zahlungsquellen
 * - Buchungsnummern-Vergabe beim Monatsabschluss
 * - Dateiname-Sanitization fuer Storage-Pfade
 * - Zwei-Phasen-Abschluss (Storage-Rename + DB-Commit)
 * - Zwei-Phasen-Aufhebung (Storage-Revert + DB-Revert)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────

export type ZahlungsquellenTyp = 'kontoauszug' | 'kassa' | 'kreditkarte' | 'paypal' | 'sonstige'

export type Rechnungstyp = 'eingangsrechnung' | 'ausgangsrechnung' | 'gutschrift' | 'eigenbeleg' | null

/** Prefix mapping: rechnungstyp -> Buchungsnummer-Praefix */
const RECHNUNGSTYP_PREFIX: Record<string, string> = {
  eingangsrechnung: 'E',
  ausgangsrechnung: 'A',
  gutschrift: 'G',
  eigenbeleg: 'EB',
}

/** Typ -> Kuerzel prefix mapping */
const TYP_KUERZEL_PREFIX: Record<ZahlungsquellenTyp, string> = {
  kontoauszug: 'B',
  kassa: 'K',
  kreditkarte: 'CC',
  paypal: 'PP',
  sonstige: 'S',
}

interface BelegForRename {
  id: string
  storage_path: string | null
  dateiname: string | null
  rechnungstyp: string | null
}

interface StorageRenameOp {
  beleg_id: string
  old_path: string
  new_path: string
}

interface EarAbschlussResult {
  success: boolean
  error?: string
  buchungsnummern_vergeben: number
  dateien_umbenannt: number
}

interface EarAufhebungResult {
  success: boolean
  error?: string
  buchungsnummern_entfernt: number
  dateien_zurueckbenannt: number
  storage_fehler: string[]
}

// ── Kuerzel Generation ─────────────────────────────────────────────────

/**
 * Generate a kuerzel for a new zahlungsquelle based on its typ
 * and how many sources of that typ already exist for the mandant.
 */
export async function generateKuerzel(
  supabase: SupabaseClient,
  mandantId: string,
  typ: ZahlungsquellenTyp
): Promise<string> {
  const prefix = TYP_KUERZEL_PREFIX[typ] || 'S'

  const { count } = await supabase
    .from('zahlungsquellen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .eq('typ', typ)

  const nextNum = (count ?? 0) + 1
  return `${prefix}${nextNum}`
}

// ── Buchungsnummer ─────────────────────────────────────────────────────

/**
 * Build a buchungsnummer string from its components.
 * Format: {Prefix}_{lfd_nr:04d}_{kuerzel}_{MM}_{YYYY}
 */
export function buildBuchungsnummer(
  rechnungstyp: string | null,
  lfdNr: number,
  kuerzel: string,
  monat: number,
  jahr: number
): string {
  const prefix = (rechnungstyp && RECHNUNGSTYP_PREFIX[rechnungstyp]) || 'S'
  const lfdStr = String(lfdNr).padStart(4, '0')
  const monatStr = String(monat).padStart(2, '0')
  return `${prefix}_${lfdStr}_${kuerzel}_${monatStr}_${jahr}`
}

// ── Filename Sanitization ──────────────────────────────────────────────

/**
 * Sanitize a filename for storage path safety.
 * Replaces spaces, umlauts, and special characters with URL-safe equivalents.
 */
export function sanitizeFilename(filename: string): string {
  const umlautMap: Record<string, string> = {
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
    'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
  }

  let sanitized = filename
  for (const [umlaut, replacement] of Object.entries(umlautMap)) {
    sanitized = sanitized.replaceAll(umlaut, replacement)
  }

  // Replace spaces with underscores
  sanitized = sanitized.replace(/\s+/g, '_')

  // Remove any characters that aren't alphanumeric, dash, underscore, or dot
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '')

  // Collapse multiple underscores/dashes
  sanitized = sanitized.replace(/[_-]{2,}/g, '_')

  return sanitized
}

// ── Zwei-Phasen-Abschluss (EAR) ───────────────────────────────────────

/**
 * Performs the EAR-specific part of a Monatsabschluss:
 * 1. Assigns buchungsnummern to all qualifying transaktionen
 * 2. Renames beleg files in storage
 *
 * Atomicity: Storage renames first, DB commit only if all renames succeed.
 * On storage failure, already-renamed files are rolled back.
 */
export async function earMonatsabschluss(
  supabase: SupabaseClient,
  mandantId: string,
  jahr: number,
  monat: number,
  storageBucket: string = 'belege'
): Promise<EarAbschlussResult> {
  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  // 1. Fetch qualifying transaktionen (sorted by datum ASC, erstellt_am ASC)
  const { data: transaktionen, error: txError } = await supabase
    .from('transaktionen')
    .select('id, datum, erstellt_am, quelle_id, match_status, workflow_status, beleg_id')
    .eq('mandant_id', mandantId)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .in('match_status', ['bestaetigt', 'kein_beleg'])
    .or('workflow_status.is.null,workflow_status.neq.privat')
    .order('datum', { ascending: true })
    .order('erstellt_am', { ascending: true })

  if (txError) {
    return { success: false, error: `Fehler beim Laden der Transaktionen: ${txError.message}`, buchungsnummern_vergeben: 0, dateien_umbenannt: 0 }
  }

  if (!transaktionen || transaktionen.length === 0) {
    return { success: true, buchungsnummern_vergeben: 0, dateien_umbenannt: 0 }
  }

  // 2. Fetch zahlungsquellen kuerzel for this mandant
  const quelleIds = [...new Set(transaktionen.map(t => t.quelle_id))]
  const { data: quellen } = await supabase
    .from('zahlungsquellen')
    .select('id, kuerzel')
    .in('id', quelleIds)

  const kuerzelMap = new Map<string, string>()
  for (const q of quellen ?? []) {
    kuerzelMap.set(q.id, q.kuerzel || 'X')
  }

  // 3. Fetch belege for transaktionen that have a beleg_id
  const belegIds = transaktionen.filter(t => t.beleg_id).map(t => t.beleg_id!) as string[]
  const belegMap = new Map<string, BelegForRename>()
  if (belegIds.length > 0) {
    const { data: belege } = await supabase
      .from('belege')
      .select('id, storage_path, dateiname, rechnungstyp')
      .in('id', belegIds)

    for (const b of belege ?? []) {
      belegMap.set(b.id, b)
    }
  }

  // 4. Compute buchungsnummern per quelle_id (lfd_nr resets per quelle, NOT per prefix)
  // Design decision: E_0001, A_0002, E_0003 is correct (single sequential counter per source)
  // This matches the spec: "lfd_nr: pro quelle_id + Monat + Jahr, beginnt bei 0001"
  const lfdCounters = new Map<string, number>()
  const nummernUpdates: { id: string; buchungsnummer: string }[] = []
  const storageOps: StorageRenameOp[] = []
  const belegPathUpdates: { id: string; new_path: string; old_path: string }[] = []

  for (const tx of transaktionen) {
    const kuerzel = kuerzelMap.get(tx.quelle_id) || 'X'
    const counterKey = tx.quelle_id
    const currentCount = (lfdCounters.get(counterKey) ?? 0) + 1
    lfdCounters.set(counterKey, currentCount)

    // Determine rechnungstyp from beleg if available
    const beleg = tx.beleg_id ? belegMap.get(tx.beleg_id) : null
    const rechnungstyp = beleg?.rechnungstyp ?? null

    const buchungsnummer = buildBuchungsnummer(rechnungstyp, currentCount, kuerzel, monat, jahr)
    nummernUpdates.push({ id: tx.id, buchungsnummer })

    // File rename if beleg has a storage_path
    if (beleg && beleg.storage_path) {
      const originalFilename = beleg.dateiname || beleg.storage_path.split('/').pop() || 'beleg'
      const sanitizedOriginal = sanitizeFilename(originalFilename)
      const newFilename = `${buchungsnummer}_${sanitizedOriginal}`

      // Construct new path: same directory, new filename
      const pathParts = beleg.storage_path.split('/')
      pathParts[pathParts.length - 1] = newFilename
      const newPath = pathParts.join('/')

      storageOps.push({
        beleg_id: beleg.id,
        old_path: beleg.storage_path,
        new_path: newPath,
      })
      belegPathUpdates.push({
        id: beleg.id,
        new_path: newPath,
        old_path: beleg.storage_path,
      })
    }
  }

  // ── Phase 1: Storage Renames ──
  const completedOps: StorageRenameOp[] = []
  for (const op of storageOps) {
    const { error: copyError } = await supabase.storage
      .from(storageBucket)
      .copy(op.old_path, op.new_path)

    if (copyError) {
      // Rollback already completed renames
      await rollbackStorageOps(supabase, storageBucket, completedOps)
      return {
        success: false,
        error: `Storage-Fehler bei Datei "${op.old_path}": ${copyError.message}. Alle Umbenennungen wurden zurueckgesetzt.`,
        buchungsnummern_vergeben: 0,
        dateien_umbenannt: 0,
      }
    }

    const { error: removeError } = await supabase.storage
      .from(storageBucket)
      .remove([op.old_path])

    if (removeError) {
      // Remove the copy we just made, then rollback
      await supabase.storage.from(storageBucket).remove([op.new_path])
      await rollbackStorageOps(supabase, storageBucket, completedOps)
      return {
        success: false,
        error: `Storage-Fehler beim Loeschen von "${op.old_path}": ${removeError.message}. Alle Umbenennungen wurden zurueckgesetzt.`,
        buchungsnummern_vergeben: 0,
        dateien_umbenannt: 0,
      }
    }

    completedOps.push(op)
  }

  // ── Phase 2: DB Commit ──
  // Update buchungsnummern on transaktionen
  for (const update of nummernUpdates) {
    const { error } = await supabase
      .from('transaktionen')
      .update({ buchungsnummer: update.buchungsnummer })
      .eq('id', update.id)

    if (error) {
      // BUG-PROJ25-003: Rollback storage on DB failure (true atomicity)
      console.error(`DB-Fehler bei Buchungsnummer-Update fuer Transaktion ${update.id}: ${error.message}`)
      await rollbackStorageOps(supabase, storageBucket, completedOps)
      return {
        success: false,
        error: `DB-Fehler bei Buchungsnummer-Vergabe: ${error.message}. Alle Dateiumbenenennungen wurden zurueckgesetzt.`,
        buchungsnummern_vergeben: 0,
        dateien_umbenannt: 0,
      }
    }
  }

  // Update belege paths
  for (const update of belegPathUpdates) {
    const { error } = await supabase
      .from('belege')
      .update({
        storage_path_original: update.old_path,
        storage_path: update.new_path,
      })
      .eq('id', update.id)

    if (error) {
      // DB error on beleg path update - rollback everything
      console.error(`DB-Fehler bei Beleg-Pfad-Update fuer Beleg ${update.id}: ${error.message}`)
      await rollbackStorageOps(supabase, storageBucket, completedOps)
      return {
        success: false,
        error: `DB-Fehler beim Speichern der Beleg-Pfade: ${error.message}. Alle Dateiumbenenennungen wurden zurueckgesetzt.`,
        buchungsnummern_vergeben: 0,
        dateien_umbenannt: 0,
      }
    }
  }

  return {
    success: true,
    buchungsnummern_vergeben: nummernUpdates.length,
    dateien_umbenannt: completedOps.length,
  }
}

// ── Zwei-Phasen-Aufhebung (EAR) ───────────────────────────────────────

/**
 * Reverts the EAR-specific part of a Monatsabschluss:
 * 1. Restores original file names in storage
 * 2. Clears buchungsnummern from transaktionen
 *
 * Storage errors are tolerated (logged but not blocking) since files
 * may have been manually deleted.
 */
export async function earMonatsaufhebung(
  supabase: SupabaseClient,
  mandantId: string,
  jahr: number,
  monat: number,
  storageBucket: string = 'belege'
): Promise<EarAufhebungResult> {
  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  const storageFehler: string[] = []

  // 1. Fetch transaktionen with buchungsnummer in this month
  const { data: transaktionen } = await supabase
    .from('transaktionen')
    .select('id, beleg_id, buchungsnummer')
    .eq('mandant_id', mandantId)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .not('buchungsnummer', 'is', null)

  if (!transaktionen || transaktionen.length === 0) {
    return { success: true, buchungsnummern_entfernt: 0, dateien_zurueckbenannt: 0, storage_fehler: [] }
  }

  // 2. Fetch belege with storage_path_original != null
  const belegIds = transaktionen.filter(t => t.beleg_id).map(t => t.beleg_id!) as string[]
  const belegeToRevert: { id: string; storage_path: string; storage_path_original: string }[] = []

  if (belegIds.length > 0) {
    const { data: belege } = await supabase
      .from('belege')
      .select('id, storage_path, storage_path_original')
      .in('id', belegIds)
      .not('storage_path_original', 'is', null)

    if (belege) {
      for (const b of belege) {
        if (b.storage_path && b.storage_path_original) {
          belegeToRevert.push({
            id: b.id,
            storage_path: b.storage_path,
            storage_path_original: b.storage_path_original,
          })
        }
      }
    }
  }

  // ── Phase 1: Storage Revert (fehler-tolerant) ──
  let dateien_zurueckbenannt = 0
  for (const beleg of belegeToRevert) {
    try {
      const { error: copyError } = await supabase.storage
        .from(storageBucket)
        .copy(beleg.storage_path, beleg.storage_path_original)

      if (copyError) {
        storageFehler.push(`Copy-Fehler bei Beleg ${beleg.id}: ${copyError.message}`)
        continue
      }

      const { error: removeError } = await supabase.storage
        .from(storageBucket)
        .remove([beleg.storage_path])

      if (removeError) {
        storageFehler.push(`Remove-Fehler bei Beleg ${beleg.id}: ${removeError.message}`)
        // File was copied, so continue with DB update anyway
      }

      dateien_zurueckbenannt++
    } catch (err) {
      storageFehler.push(`Unerwarteter Storage-Fehler bei Beleg ${beleg.id}: ${String(err)}`)
    }
  }

  // ── Phase 2: DB Revert ──
  // Clear buchungsnummern
  const txIds = transaktionen.map(t => t.id)
  const { error: txError } = await supabase
    .from('transaktionen')
    .update({ buchungsnummer: null })
    .in('id', txIds)

  if (txError) {
    return {
      success: false,
      error: `DB-Fehler beim Entfernen der Buchungsnummern: ${txError.message}`,
      buchungsnummern_entfernt: 0,
      dateien_zurueckbenannt,
      storage_fehler: storageFehler,
    }
  }

  // Restore beleg paths
  for (const beleg of belegeToRevert) {
    const { error } = await supabase
      .from('belege')
      .update({
        storage_path: beleg.storage_path_original,
        storage_path_original: null,
      })
      .eq('id', beleg.id)

    if (error) {
      console.error(`DB-Fehler beim Zuruecksetzen des Beleg-Pfads fuer ${beleg.id}: ${error.message}`)
    }
  }

  return {
    success: true,
    buchungsnummern_entfernt: txIds.length,
    dateien_zurueckbenannt,
    storage_fehler: storageFehler,
  }
}

// ── EAR Preview Data ───────────────────────────────────────────────────

/**
 * Get EAR-specific preview data for the Monatsabschluss dialog.
 */
export async function getEarPreviewData(
  supabase: SupabaseClient,
  mandantId: string,
  jahr: number,
  monat: number
): Promise<{
  ear_zu_nummerieren: number
  ear_privat: number
  ear_quellen_ohne_kuerzel: string[]
}> {
  const vonDatum = `${jahr}-${String(monat).padStart(2, '0')}-01`
  const bisDatum = new Date(jahr, monat, 0).toISOString().split('T')[0]

  // Count qualifying transaktionen (will receive buchungsnummer)
  const { count: zuNummerieren } = await supabase
    .from('transaktionen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .in('match_status', ['bestaetigt', 'kein_beleg'])
    .or('workflow_status.is.null,workflow_status.neq.privat')

  // Count privat transaktionen
  const { count: privatCount } = await supabase
    .from('transaktionen')
    .select('id', { count: 'exact', head: true })
    .eq('mandant_id', mandantId)
    .gte('datum', vonDatum)
    .lte('datum', bisDatum)
    .eq('workflow_status', 'privat')

  // Check for quellen without kuerzel that have transaktionen in this month
  const { data: quellenOhneKuerzel } = await supabase
    .from('zahlungsquellen')
    .select('id, name, kuerzel')
    .eq('mandant_id', mandantId)
    .eq('aktiv', true)
    .is('kuerzel', null)

  // Filter to only those that have transaktionen in this month
  const quellenNamen: string[] = []
  if (quellenOhneKuerzel && quellenOhneKuerzel.length > 0) {
    for (const q of quellenOhneKuerzel) {
      const { count } = await supabase
        .from('transaktionen')
        .select('id', { count: 'exact', head: true })
        .eq('quelle_id', q.id)
        .gte('datum', vonDatum)
        .lte('datum', bisDatum)

      if ((count ?? 0) > 0) {
        quellenNamen.push(q.name)
      }
    }
  }

  return {
    ear_zu_nummerieren: zuNummerieren ?? 0,
    ear_privat: privatCount ?? 0,
    ear_quellen_ohne_kuerzel: quellenNamen,
  }
}

// ── Internal Helpers ───────────────────────────────────────────────────

/**
 * Rollback completed storage operations (copy back old_path from new_path, remove new_path)
 */
async function rollbackStorageOps(
  supabase: SupabaseClient,
  bucket: string,
  completedOps: StorageRenameOp[]
): Promise<void> {
  for (const op of completedOps) {
    try {
      await supabase.storage.from(bucket).copy(op.new_path, op.old_path)
      await supabase.storage.from(bucket).remove([op.new_path])
    } catch (err) {
      console.error(`Rollback-Fehler fuer "${op.old_path}": ${String(err)}`)
    }
  }
}
