import Anthropic from '@anthropic-ai/sdk'

/**
 * OCR result returned by Claude Haiku Vision.
 * All fields are optional — OCR may not detect every field.
 */
export interface OcrResult {
  lieferant: string | null
  rechnungsnummer: string | null
  rechnungsdatum: string | null
  bruttobetrag: number | null
  nettobetrag: number | null
  mwst_satz: number | null
  steuerzeilen?: Array<{nettobetrag: number | null, mwst_satz: number | null, bruttobetrag: number | null}>
  confidence: number
  error?: string
}

const EMPTY_RESULT: OcrResult = {
  lieferant: null,
  rechnungsnummer: null,
  rechnungsdatum: null,
  bruttobetrag: null,
  nettobetrag: null,
  mwst_satz: null,
  confidence: 0,
}

/** Supported media types for Claude Vision */
type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
type DocumentMediaType = 'application/pdf'
type SupportedMediaType = ImageMediaType | DocumentMediaType

const MEDIA_TYPE_MAP: Record<string, SupportedMediaType> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
}

/** Maximum file size: 5 MB */
export const OCR_MAX_FILE_SIZE = 5 * 1024 * 1024

/** OCR timeout in milliseconds */
const OCR_TIMEOUT_MS = 30_000

const OCR_PROMPT = `Du bist ein OCR-Experte für österreichische Rechnungen. Analysiere das Dokument und extrahiere:

- lieferant: Name des Rechnungsstellers
- rechnungsnummer: Rechnungsnummer (z.B. RE-2024-001)
- rechnungsdatum: Rechnungsdatum im Format YYYY-MM-DD
- bruttobetrag: Gesamtbruttobetrag (inkl. MwSt) als Zahl
- nettobetrag: Gesamtnettobetrag (ohne MwSt) als Zahl
- mwst_satz: Hauptsteuersatz in Prozent (z.B. 20)
- steuerzeilen: Array mit einer Zeile PRO Steuersatz. Jede Zeile: {"nettobetrag": Zahl, "mwst_satz": Zahl, "bruttobetrag": Zahl}
  - Bei nur einem Steuersatz: ein Eintrag im Array
  - Bei mehreren Steuersätzen (z.B. 0% und 20%): je ein Eintrag pro Satz
- confidence: Gesamtzuversicht (0.0 bis 1.0)

Antworte NUR mit einem JSON-Objekt. Null für unbekannte Felder.
Beträge: Punkt als Dezimaltrennzeichen (z.B. 1234.56).

Beispiel mit 2 Steuersätzen:
{"lieferant":"AKM","rechnungsnummer":"17329012","rechnungsdatum":"2026-01-01","bruttobetrag":451.70,"nettobetrag":379.43,"mwst_satz":20,"steuerzeilen":[{"nettobetrag":18.07,"mwst_satz":0,"bruttobetrag":18.07},{"nettobetrag":361.36,"mwst_satz":20,"bruttobetrag":433.63}],"confidence":0.92}`

/**
 * Perform OCR on a document using Claude Haiku Vision.
 * Returns extracted invoice fields or empty result on failure.
 */
export async function performOcr(
  fileBuffer: Buffer,
  mimeType: string
): Promise<OcrResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[OCR] ANTHROPIC_API_KEY not configured')
    return { ...EMPTY_RESULT, error: 'ANTHROPIC_API_KEY fehlt' }
  }

  const mediaType = MEDIA_TYPE_MAP[mimeType]
  if (!mediaType) {
    console.error(`[OCR] Unsupported MIME type: ${mimeType}`)
    return { ...EMPTY_RESULT, error: `Dateityp nicht unterstuetzt: ${mimeType}` }
  }

  if (fileBuffer.length > OCR_MAX_FILE_SIZE) {
    console.error(`[OCR] File too large: ${fileBuffer.length} bytes (max ${OCR_MAX_FILE_SIZE})`)
    return { ...EMPTY_RESULT, error: 'Datei zu gross' }
  }

  const base64Data = fileBuffer.toString('base64')

  const client = new Anthropic({ apiKey })

  // Build the content block based on file type
  const contentBlock: Anthropic.ContentBlockParam = mediaType === 'application/pdf'
    ? {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType,
          data: base64Data,
        },
      }
    : {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: mediaType as ImageMediaType,
          data: base64Data,
        },
      }

  try {
    const response = await Promise.race([
      client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: OCR_PROMPT },
            ],
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS)
      ),
    ])

    // Extract text from response
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )
    if (!textBlock) {
      console.error('[OCR] No text block in response')
      return EMPTY_RESULT
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonText = textBlock.text.trim()
    const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonText = jsonMatch[1].trim()
    }

    const parsed = JSON.parse(jsonText)

    // Validate steuerzeilen
    let steuerzeilen: OcrResult['steuerzeilen'] = undefined
    if (Array.isArray(parsed.steuerzeilen) && parsed.steuerzeilen.length > 0) {
      steuerzeilen = parsed.steuerzeilen.map((z: Record<string, unknown>) => ({
        nettobetrag: validateNumber(z.nettobetrag),
        mwst_satz: validateMwstSatz(z.mwst_satz),
        bruttobetrag: validateNumber(z.bruttobetrag),
      }))
    }

    // Validate and sanitize the result
    return {
      lieferant: typeof parsed.lieferant === 'string' ? parsed.lieferant : null,
      rechnungsnummer: typeof parsed.rechnungsnummer === 'string' ? parsed.rechnungsnummer : null,
      rechnungsdatum: validateDate(parsed.rechnungsdatum),
      bruttobetrag: validateNumber(parsed.bruttobetrag),
      nettobetrag: validateNumber(parsed.nettobetrag),
      mwst_satz: validateMwstSatz(parsed.mwst_satz),
      steuerzeilen,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = (error && typeof error === 'object' && 'status' in error)
      ? ` (HTTP ${(error as {status: number}).status})`
      : ''
    console.error(`[OCR] Failed: ${message}${status}`)
    return { ...EMPTY_RESULT, error: `${message}${status}` }
  }
}

/** Validate a date string is in YYYY-MM-DD format */
function validateDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/)
  if (!match) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  return value
}

/** Validate a numeric amount */
function validateNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (typeof num !== 'number' || isNaN(num)) return null
  // Round to 2 decimal places
  return Math.round(num * 100) / 100
}

/** Validate MwSt-Satz (common Austrian rates: 0, 10, 13, 20) */
function validateMwstSatz(value: unknown): number | null {
  const num = validateNumber(value)
  if (num === null) return null
  if (num < 0 || num > 100) return null
  return num
}
