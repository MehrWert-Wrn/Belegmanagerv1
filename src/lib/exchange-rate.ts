/** In-memory cache for ECB rates (updated once daily) */
let cache: { rates: Record<string, number>; fetchedAt: number } | null = null
const CACHE_TTL_MS = 4 * 60 * 60 * 1000

/**
 * Returns the EUR equivalent for 1 unit of `fromCurrency`.
 * e.g. getEurRate("USD") → 0.921 means 1 USD = 0.921 EUR
 * Uses Frankfurter.app (free, backed by ECB daily data, no API key required).
 * Returns null on network failure.
 */
export async function getEurRate(fromCurrency: string): Promise<number | null> {
  if (fromCurrency === 'EUR') return 1

  const now = Date.now()
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    try {
      const res = await fetch('https://api.frankfurter.app/latest?from=EUR', {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return null
      const data = await res.json() as { rates: Record<string, number> }
      cache = { rates: data.rates, fetchedAt: now }
    } catch {
      return null
    }
  }

  // rates[USD] = "how many USD per 1 EUR"
  const perEur = cache.rates[fromCurrency]
  if (!perEur) return null
  return Math.round((1 / perEur) * 1_000_000) / 1_000_000
}

/** Convert an amount from a foreign currency to EUR. Returns null if rate unavailable. */
export async function convertToEur(
  amount: number,
  fromCurrency: string
): Promise<{ amountEur: number; rate: number } | null> {
  const rate = await getEurRate(fromCurrency)
  if (rate === null) return null
  return {
    amountEur: Math.round(amount * rate * 100) / 100,
    rate,
  }
}
