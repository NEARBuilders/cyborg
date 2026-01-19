/**
 * In-Memory Rate Limiter
 *
 * Provides simple rate limiting for API endpoints.
 * For production multi-instance deployments, replace with Redis-backed implementation.
 */

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  check(
    key: string,
    config: RateLimitConfig
  ): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or expired - create new window
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + config.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: config.maxRequests - 1, resetAt };
    }

    // Rate limit exceeded
    if (entry.count >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    // Increment counter
    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Rate limit configurations by endpoint type
 *
 * Production note: Adjust these based on your expected traffic patterns
 * and NEAR AI Cloud API limits.
 */
export const RATE_LIMITS = {
  chat: { windowMs: 60_000, maxRequests: 20 }, // 20 chat requests per minute
  kv: { windowMs: 60_000, maxRequests: 100 }, // 100 KV operations per minute
  auth: { windowMs: 60_000, maxRequests: 100 }, // 100 auth attempts per minute
  global: { windowMs: 60_000, maxRequests: 1000 }, // 1000 total requests per minute
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;
