// Simple in-memory rate limiter — suitable for single-instance deployments
// For multi-instance, replace store with Redis

interface Bucket {
  count: number
  resetAt: number
}

const store = new Map<string, Bucket>()

const MAX_ATTEMPTS  = 5    // max login attempts
const WINDOW_MS     = 15 * 60 * 1000  // per 15 minutes
const LOCKOUT_MS    = 30 * 60 * 1000  // 30-minute lockout after max attempts

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const bucket = store.get(key)

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= MAX_ATTEMPTS) {
      return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) }
    }
    bucket.count++
    return { allowed: true, retryAfterSec: 0 }
  }

  // new window
  store.set(key, { count: 1, resetAt: now + WINDOW_MS })
  return { allowed: true, retryAfterSec: 0 }
}

export function recordFailedLogin(key: string) {
  const now = Date.now()
  const bucket = store.get(key)
  if (!bucket) return

  if (bucket.count >= MAX_ATTEMPTS) {
    // extend lockout
    bucket.resetAt = now + LOCKOUT_MS
  }
}

export function clearLoginAttempts(key: string) {
  store.delete(key)
}

// Prune expired entries every 10 minutes to avoid memory leak
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of store) {
    if (now >= bucket.resetAt) store.delete(key)
  }
}, 10 * 60 * 1000)
