/**
 * Cache Manager for Multi-User Scalability
 * 
 * Implements client-side caching to reduce database queries
 * and improve performance in high-traffic scenarios.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  staleWhileRevalidate?: boolean; // Return stale data while fetching fresh
}

const DEFAULT_TTL = 30000; // 30 seconds
const MAX_CACHE_SIZE = 100; // Maximum number of cache entries

class CacheManager {
  private cache: Map<string, CacheEntry<any>>;
  private pendingRequests: Map<string, Promise<any>>;

  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * Get data from cache or fetch if not available
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const ttl = options.ttl || DEFAULT_TTL;
    const now = Date.now();

    // Check if we have a valid cache entry
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now) {
      console.log(`✅ Cache hit: ${key}`);
      return cached.data;
    }

    // Check for stale data
    if (cached && options.staleWhileRevalidate) {
      console.log(`♻️ Returning stale data while revalidating: ${key}`);
      // Return stale data immediately
      const staleData = cached.data;
      
      // Fetch fresh data in background
      this.revalidate(key, fetchFn, ttl).catch(error => {
        console.error(`❌ Background revalidation failed for ${key}:`, error);
      });
      
      return staleData;
    }

    // Check if there's already a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) {
      console.log(`⏳ Waiting for pending request: ${key}`);
      return pending;
    }

    // Fetch fresh data
    console.log(`🔄 Cache miss, fetching: ${key}`);
    const promise = this.fetch(key, fetchFn, ttl);
    this.pendingRequests.set(key, promise);

    try {
      const data = await promise;
      return data;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Fetch and cache data
   */
  private async fetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    try {
      const data = await fetchFn();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      console.error(`❌ Failed to fetch data for ${key}:`, error);
      
      // If fetch fails, try to return stale cache if available
      const cached = this.cache.get(key);
      if (cached) {
        console.warn(`⚠️ Returning expired cache for ${key} due to fetch error`);
        return cached.data;
      }
      
      throw error;
    }
  }

  /**
   * Revalidate cache entry in background
   */
  private async revalidate<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
  ): Promise<void> {
    try {
      const data = await fetchFn();
      this.set(key, data, ttl);
      console.log(`✅ Revalidated cache: ${key}`);
    } catch (error) {
      console.error(`❌ Revalidation failed for ${key}:`, error);
    }
  }

  /**
   * Set cache entry
   */
  set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    // Implement simple LRU by removing oldest entries when cache is full
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      console.log(`🧹 Evicted oldest cache entry: ${oldestKey}`);
    }

    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
    console.log(`💾 Cached data: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): void {
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`🗑️ Invalidated cache: ${key}`);
    }
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    console.log(`🗑️ Invalidated ${count} cache entries matching pattern: ${pattern}`);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.pendingRequests.clear();
    console.log(`🗑️ Cleared all cache (${size} entries)`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      pendingRequests: this.pendingRequests.size,
      maxSize: MAX_CACHE_SIZE,
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired cache entries`);
    }
  }
}

// Create singleton instance
const cacheManager = new CacheManager();

// Cleanup expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    cacheManager.cleanup();
  }, 5 * 60 * 1000);
}

export default cacheManager;

/**
 * Cache keys builder for consistency
 */
export const CacheKeys = {
  game: (gameId: string) => `game:${gameId}`,
  gameState: (gameId: string) => `game:${gameId}:state`,
  gameParticipants: (gameId: string) => `game:${gameId}:participants`,
  gameTeams: (gameId: string) => `game:${gameId}:teams`,
  gameLeaderboard: (gameId: string) => `game:${gameId}:leaderboard`,
  
  yearGameSession: (gameId: string) => `year-game:${gameId}:session`,
  yearGameResults: (sessionId: string) => `year-game:${sessionId}:results`,
  yearGameTeamResults: (sessionId: string, teamId: string) => 
    `year-game:${sessionId}:team:${teamId}:results`,
  
  scoreStealSession: (gameId: string) => `score-steal:${gameId}:session`,
  scoreStealQuestions: (gameId: string) => `score-steal:${gameId}:questions`,
  
  relayQuizSession: (gameId: string) => `relay-quiz:${gameId}:session`,
  relayQuizQuestions: (gameId: string) => `relay-quiz:${gameId}:questions`,
  relayQuizProgress: (sessionId: string, teamId: string) => 
    `relay-quiz:${sessionId}:team:${teamId}:progress`,
};

/**
 * Hook to use cache manager in React components
 */
export function useCachedData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        const result = await cacheManager.get(key, fetchFn, options);
        if (mounted) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [key]);

  const invalidate = React.useCallback(() => {
    cacheManager.invalidate(key);
  }, [key]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      cacheManager.invalidate(key);
      const result = await cacheManager.get(key, fetchFn, options);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [key, fetchFn, options]);

  return { data, loading, error, invalidate, refresh };
}

// Import React for the hook
import React from 'react';
