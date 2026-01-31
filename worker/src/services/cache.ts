/**
 * KV Cache Service
 * Handles caching with TTL for API responses
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class CacheService {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  /**
   * Get cached data
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.kv.get<CacheEntry<T>>(key, "json");
      if (!cached) return null;

      // Check if expired
      const now = Date.now();
      if (now - cached.timestamp > cached.ttl) {
        await this.kv.delete(key);
        return null;
      }

      return cached.data;
    } catch {
      return null;
    }
  }

  /**
   * Set cached data with TTL
   */
  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl: ttlSeconds * 1000,
      };
      await this.kv.put(key, JSON.stringify(entry), {
        expirationTtl: ttlSeconds,
      });
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch {
      // Ignore cache errors
    }
  }

  /**
   * Helper to fetch with cache
   */
  async fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    await this.set(key, data, ttlSeconds);

    return data;
  }

  /**
   * Cache builders data
   */
  async getBuilders(page: number, limit: number): Promise<any | null> {
    return this.get(`builders:${page}:${limit}`);
  }

  async setBuilders(page: number, limit: number, data: any, ttlSeconds: number = 300): Promise<void> {
    return this.set(`builders:${page}:${limit}`, data, ttlSeconds);
  }

  /**
   * Cache NEAR Social profile
   */
  async getProfile(accountId: string): Promise<any | null> {
    return this.get(`profile:${accountId}`);
  }

  async setProfile(accountId: string, data: any, ttlSeconds: number = 600): Promise<void> {
    return this.set(`profile:${accountId}`, data, ttlSeconds);
  }

  /**
   * Cache multiple profiles at once
   */
  async getProfiles(accountIds: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();

    // Get all profiles from cache in parallel
    await Promise.all(
      accountIds.map(async (accountId) => {
        const profile = await this.getProfile(accountId);
        if (profile) {
          results.set(accountId, profile);
        }
      })
    );

    return results;
  }

  /**
   * Set multiple profiles at once
   */
  async setProfiles(profiles: Record<string, any>, ttlSeconds: number = 600): Promise<void> {
    await Promise.all(
      Object.entries(profiles).map(([accountId, data]) =>
        this.setProfile(accountId, data, ttlSeconds)
      )
    );
  }

  /**
   * Invalidate cache for a pattern (useful for cache busting)
   */
  async invalidatePattern(prefix: string): Promise<void> {
    try {
      // KV doesn't support pattern matching, so we use a list method
      // This is a no-op for now - would need to use a different approach
      // like keeping a list of cached keys
    } catch {
      // Ignore
    }
  }
}
