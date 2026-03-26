/**
 * Simple in-memory rate limiter using a sliding window.
 * NOT suitable for multi-instance deployments — use Redis for that.
 * Sufficient for single Vercel instance / serverless with limited concurrency.
 */

interface RateLimitEntry {
  timestamps: number[]
}

const store = new Map<string, RateLimitEntry>()

/** Clean up expired entries every 5 minutes */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now

  const cutoff = now - windowMs
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff)
    if (entry.timestamps.length === 0) {
      store.delete(key)
    }
  }
}

/**
 * Check if a request is within the rate limit.
 * @param key - Unique identifier (e.g., user ID)
 * @param maxRequests - Maximum number of requests in the window
 * @param windowMs - Time window in milliseconds
 * @returns Object with `allowed` boolean and `retryAfterMs` if blocked
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  cleanup(windowMs)

  const now = Date.now()
  const cutoff = now - windowMs

  let entry = store.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    store.set(key, entry)
  }

  // Remove expired timestamps
  entry.timestamps = entry.timestamps.filter(t => t > cutoff)

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfterMs = oldestInWindow + windowMs - now
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
  }

  entry.timestamps.push(now)
  return { allowed: true }
}
