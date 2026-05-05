import Anthropic from '@anthropic-ai/sdk'

/**
 * OCR result returned by Claude Haiku Vision.
 * All fields are optional — OCR may not detect every field.
 */
export interface OcrResult {
  lieferant: string | null
  rechnungsempfaenger: string | null
  rechnungsnummer: string | null
  rechnungsdatum: string | null
  waehrung: string
  bruttobetrag: number | null
  nettobetrag: number | null
  mwst_satz: number | null
  steuerzeilen?: Array<{nettobetrag: number | null, mwst_satz: number | null, bruttobetrag: number | null}>
  confidence: number
  error?: string
}

const EMPTY_RESULT: OcrResult = {
  lieferant: null,
  rechnungsempfaenger: null,
  rechnungsnummer: null,
  rechnungsdatum: null,
  waehrung: 'EUR',
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

export const TAGESLOSUNG_OCR_PROMPT = `Du bist ein OCR-Experte für österreichische Kassaabschluss-Dokumente (Z-Bon, Tagesabschluss, Kassaabschluss, Tageslosung).
Analysiere das Dokument und extrahiere NUR folgende Informationen:

- lieferant: Name des Geschäfts/Unternehmens (steht meist oben im Header oder Briefkopf)
- rechnungsnummer: Abschluss-Nummer, Z-Bon-Nummer oder Bon-Nummer (z.B. "Z-1234", "1234", "Abschluss-Nr. 42")
- rechnungsdatum: Datum des Abschlusses im Format YYYY-MM-DD
- bruttobetrag: NUR die BAR-Einnahmen (Bargeld-Umsatz) als Zahl in EUR.
  Suche nach Bezeichnungen wie: "Bar", "Bargeld", "Cash", "Barverkauf", "Bargeldumsatz", "Barumsatz", "Barzahlung".
  IGNORIERE VOLLSTÄNDIG: Kreditkarte, EC-Karte, Bankomat, Debit, Maestro, Visa, Mastercard, PayPal, Gutschein, Voucher, Sonstige, Andere, Überweisung sowie die GESAMTSUMME.
  Der bruttobetrag ist der Bar-Teilbetrag, NICHT der Gesamtumsatz!
- nettobetrag: Netto-Anteil der Bar-Einnahmen (ohne MwSt), falls aus dem Dokument ableitbar. Sonst null.
- mwst_satz: Hauptsteuersatz der Barumsätze in Prozent (z.B. 10, 20). Sonst null.
- confidence: Gesamtzuversicht (0.0 bis 1.0)

WICHTIG:
- bruttobetrag = NUR BAR-Einnahmen, NIEMALS der Gesamtumsatz aller Zahlungsarten
- Wenn kein eindeutiger Bar-Betrag erkennbar ist: bruttobetrag = null, confidence niedrig setzen
- rechnungsempfaenger: immer null (Kassaabschlüsse haben keinen Empfänger)
- waehrung: immer "EUR"

Antworte NUR mit einem JSON-Objekt. Null für unbekannte Felder. Beträge: Punkt als Dezimaltrennzeichen.

Beispiele:

Z-Bon mit gemischten Zahlungsarten:
"Bar: € 2.847,50 | EC/Kreditkarte: € 5.123,80 | Gutschein: € 150,00 | Gesamt: € 8.121,30"
→ {"lieferant":"Muster GmbH","rechnungsnummer":"Z-1234","rechnungsdatum":"2026-05-05","bruttobetrag":2847.50,"nettobetrag":null,"mwst_satz":null,"confidence":0.95}

Z-Bon nur Barzahlungen:
"Bargeld: € 1.450,00 | Gesamt: € 1.450,00"
→ {"lieferant":"Bäckerei Huber","rechnungsnummer":"42","rechnungsdatum":"2026-05-05","bruttobetrag":1450.00,"nettobetrag":null,"mwst_satz":null,"confidence":0.97}`

const OCR_PROMPT = `Du bist ein OCR-Experte für österreichische Rechnungen und Kassenbons. Analysiere das Dokument und extrahiere:

- lieferant: Name des Rechnungsstellers (Absender, steht meist im Briefkopf oben)
- rechnungsempfaenger: Name des Rechnungsempfängers – die Firma oder Person, AN DIE die Rechnung adressiert ist. Steht typischerweise im Adressblock (Empfängerfeld) im oberen Bereich des Dokuments, meist links unter dem Briefkopf oder im Fensterbereich. Null wenn nicht erkennbar oder wenn es sich um einen einfachen Kassenbon handelt.
- rechnungsnummer: Rechnungsnummer (z.B. RE-2024-001, Beleg-Nr., Bon-Nr.)
- rechnungsdatum: Rechnungsdatum im Format YYYY-MM-DD
- währung: ISO-4217-Währungscode der Rechnung (z.B. "EUR", "USD", "GBP", "CHF"). Standard: "EUR"
- bruttobetrag: Gesamtbruttobetrag (inkl. MwSt) als Zahl in der Originalwährung — die GESAMTSUMME inkl. aller Positionen und Trinkgeld
- nettobetrag: Gesamtnettobetrag (ohne MwSt) als Zahl in der Originalwährung — die GESAMTSUMME netto
- mwst_satz: Hauptsteuersatz in Prozent (der häufigste oder höchste Steuersatz)
- steuerzeilen: KRITISCH — suche nach der MwSt-Aufschlüsselungstabelle. Diese erscheint am Ende der Rechnung in verschiedenen Formaten:
  FORMAT A (Standard-Rechnung): Spalten "Netto / MwSt% / MwSt-Betrag / Brutto"
  FORMAT B (Österr. Kassenbon/POS): Spalten "Satz / Netto / MwSt / Summe" — dabei bedeutet "EUR 10" = Steuersatz 10%, "EUR 20" = Steuersatz 20% usw.
  FORMAT C (Supermarkt AT): Zeilen wie "A 10% xxx.xx" oder "B 20% xxx.xx"
  FORMAT D (Österr. Kassenbon/POS kompakt): Nur USt-Betrag ausgewiesen, z.B. "davon 10% USt.: 2,05" und "davon 20% USt.: 4,20" — dabei: Netto = USt-Betrag ÷ (Satz/100), Brutto = Netto + USt-Betrag. Beispiel: "davon 10% USt.: 2,05" → nettobetrag=20.50, mwst_satz=10, bruttobetrag=22.55
  Extrahiere JEDE Steuersatz-Zeile separat:
  - Format pro Zeile: {"nettobetrag": Zahl, "mwst_satz": Zahl (z.B. 0, 10, 13, 20), "bruttobetrag": Zahl}
  - Bei nur einem Steuersatz: genau ein Eintrag
  - Bei mehreren Steuersätzen: je ein Eintrag PRO Steuersatz-Zeile
  - Trinkgeld / Tip ohne MwSt: als separate Zeile mit mwst_satz=0 erfassen
  - NICHT die Summenzeile / Gesamtsumme aufnehmen — nur die Steuergruppen-Zeilen
  - Österreichische Steuersätze: 0%, 10%, 13%, 20%
- confidence: Gesamtzuversicht (0.0 bis 1.0)

Antworte NUR mit einem JSON-Objekt. Null für unbekannte Felder.
Beträge: Punkt als Dezimaltrennzeichen (z.B. 1234.56). Beträge immer in der Originalwährung der Rechnung.

Beispiel österr. Restaurant-Kassenbon (FORMAT B) mit 10%, 20% und Trinkgeld:
Bon zeigt: "Satz Netto MwSt Summe / EUR 10  31,54  3,16  34,70 / EUR 20  14,50  2,90  17,40 / Summe: 52,10 / + Tip: 1,90 / Visa PayWave: 54,00"
→ {"lieferant":"Kulisse","rechnungsnummer":"001144","rechnungsdatum":"2026-01-16","bruttobetrag":54.00,"nettobetrag":47.94,"mwst_satz":10,"steuerzeilen":[{"nettobetrag":31.54,"mwst_satz":10,"bruttobetrag":34.70},{"nettobetrag":14.50,"mwst_satz":20,"bruttobetrag":17.40},{"nettobetrag":1.90,"mwst_satz":0,"bruttobetrag":1.90}],"confidence":0.93}

Beispiel mit 3 Steuersätzen (Lebensmitteleinzelhandel AT wie SPAR, Billa, Hofer):
{"lieferant":"SPAR","rechnungsnummer":"4729103","rechnungsdatum":"2026-03-15","bruttobetrag":912.06,"nettobetrag":796.87,"mwst_satz":20,"steuerzeilen":[{"nettobetrag":38.50,"mwst_satz":0,"bruttobetrag":38.50},{"nettobetrag":364.82,"mwst_satz":10,"bruttobetrag":401.30},{"nettobetrag":393.55,"mwst_satz":20,"bruttobetrag":472.26}],"confidence":0.91}

Beispiel mit 2 Steuersätzen:
{"lieferant":"AKM","rechnungsnummer":"17329012","rechnungsdatum":"2026-01-01","bruttobetrag":451.70,"nettobetrag":379.43,"mwst_satz":20,"steuerzeilen":[{"nettobetrag":18.07,"mwst_satz":0,"bruttobetrag":18.07},{"nettobetrag":361.36,"mwst_satz":20,"bruttobetrag":433.63}],"confidence":0.92}

Beispiel FORMAT D (kompakter österr. Kassenbon — nur USt-Beträge ausgewiesen):
Bon zeigt: "Gesamt: 47,80 / davon 10% USt.: 2,05 / davon 20% USt.: 4,20"
→ Berechnung: 10%-Zeile: Netto=2.05/0.10=20.50, Brutto=22.55 | 20%-Zeile: Netto=4.20/0.20=21.00, Brutto=25.20
{"lieferant":"Novecento","rechnungsnummer":"RG2026/6666","rechnungsdatum":"2026-04-08","bruttobetrag":47.80,"nettobetrag":41.50,"mwst_satz":20,"steuerzeilen":[{"nettobetrag":20.50,"mwst_satz":10,"bruttobetrag":22.55},{"nettobetrag":21.00,"mwst_satz":20,"bruttobetrag":25.20}],"confidence":0.95}`

/**
 * Perform OCR on a document using Claude Vision.
 * Pass an optional custom prompt; defaults to the general invoice prompt.
 * For Tagesabschluss/Z-Bon documents use TAGESLOSUNG_OCR_PROMPT.
 */
export async function performOcr(
  fileBuffer: Buffer,
  mimeType: string,
  prompt: string = OCR_PROMPT
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
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: prompt },
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

    const waehrung = validateCurrencyCode(parsed.waehrung ?? parsed.währung)

    // Validate and sanitize the result
    return {
      lieferant: typeof parsed.lieferant === 'string' ? parsed.lieferant : null,
      rechnungsempfaenger: typeof parsed.rechnungsempfaenger === 'string' ? parsed.rechnungsempfaenger : null,
      rechnungsnummer: typeof parsed.rechnungsnummer === 'string' ? parsed.rechnungsnummer : null,
      rechnungsdatum: validateDate(parsed.rechnungsdatum),
      waehrung,
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
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value
  const num = typeof normalized === 'string' ? parseFloat(normalized) : normalized
  if (typeof num !== 'number' || isNaN(num)) return null
  return Math.round(num * 100) / 100
}

/** Validate MwSt-Satz (common Austrian rates: 0, 10, 13, 20) */
function validateMwstSatz(value: unknown): number | null {
  const num = validateNumber(value)
  if (num === null) return null
  if (num < 0 || num > 100) return null
  return num
}

/** Validate and normalize an ISO 4217 currency code. Defaults to EUR. */
function validateCurrencyCode(value: unknown): string {
  if (typeof value !== 'string') return 'EUR'
  const code = value.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(code)) return code
  return 'EUR'
}
