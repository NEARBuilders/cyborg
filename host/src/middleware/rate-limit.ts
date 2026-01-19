/**
 * Rate Limiting Middleware
 *
 * Provides configurable rate limiting for Hono routes.
 * Keys are based on authenticated user ID (preferred) or IP address (fallback).
 */

import type { Context, Next } from "hono";
import { rateLimiter, RATE_LIMITS, type RateLimitType } from "../lib/rate-limit";

export function rateLimit(type: RateLimitType, keyFn?: (c: Context) => string) {
  const config = RATE_LIMITS[type];

  return async (c: Context, next: Next) => {
    let key: string;

    if (keyFn) {
      // Custom key function provided
      key = keyFn(c);
    } else {
      // Default: use authenticated user ID or fall back to IP
      const session = c.get("session");
      const userId = session?.user?.id;
      const ip = c.req.header("x-forwarded-for")?.split(",")[0] ||
                c.req.header("x-real-ip") ||
                "unknown";
      key = userId || `ip:${ip}`;
    }

    const fullKey = `${type}:${key}`;
    const result = rateLimiter.check(fullKey, config);

    // Add rate limit headers to response
    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.allowed) {
      c.header("Retry-After", String(Math.ceil((result.resetAt - Date.now()) / 1000)));
      return c.json(
        {
          error: "RATE_LIMITED",
          message: "Too many requests. Please slow down.",
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
        429
      );
    }

    // Global rate limit check (protects against total system overload)
    const globalResult = rateLimiter.check("global:all", RATE_LIMITS.global);
    if (!globalResult.allowed) {
      return c.json(
        {
          error: "RATE_LIMITED",
          message: "Service is experiencing high load. Please try again shortly.",
          retryAfter: Math.ceil((globalResult.resetAt - Date.now()) / 1000),
        },
        429
      );
    }

    await next();
  };
}

// Pre-configured middleware for common endpoints
export const rateLimitChat = rateLimit("chat");
export const rateLimitKV = rateLimit("kv");
export const rateLimitAuth = rateLimit("auth", (c) => {
  // For auth, always key by IP (user isn't authenticated yet)
  const ip = c.req.header("x-forwarded-for")?.split(",")[0] ||
            c.req.header("x-real-ip") ||
            "unknown";
  return `ip:${ip}`;
});
