/**
 * ==============================================================
 * CACHE MANAGER
 * ==============================================================
 * Client-side caching system with TTL and automatic invalidation
 * Reduces database queries and improves response times
 * 
 * Features:
 * - In-memory LRU cache
 * - Time-to-live (TTL) support
 * - Automatic cache invalidation
 * - Cache hit/miss tracking
 * - Memory-efficient storage
 * - TypeScript support
 * 
 * @version 1.0.0
 * @date 2025-10-18
 * ==============================================================
 */

// ==============================================================
// TYPES
// ==============================================================

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  hits: number;
  key: string;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
  memoryUsage: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

export interface CacheOptions {
  maxSize?: number;
  defaultTTL?: number;
  cleanupInterval?: number;
  enableLogging?: boolean;
}

// ==============================================================
// CONSTANTS
// ==============================================================

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// ==============================================================
// CACHE MANAGER CLASS
// ==============================================================

export class CacheManager {
  private cache: Map<string, CacheEntry>;
  private hits: number = 0;
  private misses: number = 0;
  private maxSize: number;
  private defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private enableLogging: boolean;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || DEFAULT_MAX_SIZE;
    this.defaultTTL = options.defaultTTL || DEFAULT_TTL;
    this.enableLogging = options.enableLogging || false;

    // Start automatic cleanup
    this.startCleanup(options.cleanupInterval || DEFAULT_CLEANUP_INTERVAL);

    this.log('Cache manager initialized', {
      maxSize: this.maxSize,
      defaultTTL: this.defaultTTL,
    });
  }

  // ==============================================================
  // LOGGING
  // ==============================================================

  private log(message: string, data?: any) {
    if (this.enableLogging) {
      console.log(`[CacheManager] ${message}`, data || '');
    }
  }

  // ==============================================================
  // CORE OPERATIONS
  // ==============================================================

  /**
   * Get value from cache
   */
  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      this.log(`Cache miss: ${key}`);
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      this.log(`Cache expired: ${key}`);
      return null;
    }

    // Update hit count
    entry.hits++;
    this.hits++;
    this.log(`Cache hit: ${key}`, { hits: entry.hits });

    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  set<T = any>(key: string, data: T, ttl?: number): void {
    // Enforce max size (LRU eviction)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0,
      key,
    };

    this.cache.set(key, entry);
    this.log(`Cache set: ${key}`, { ttl: entry.ttl });
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.log(`Cache deleted: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.log('Cache cleared');
  }

  /**
   * Invalidate cache by pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.log(`Invalidated ${count} entries matching pattern: ${pattern}`);
    return count;
  }

  // ==============================================================
  // ASYNC OPERATIONS (with cache-aside pattern)
  // ==============================================================

  /**
   * Get or fetch (cache-aside pattern)
   */
  async getOrFetch<T = any>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try cache first
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    this.log(`Fetching: ${key}`);
    const data = await fetchFn();

    // Store in cache
    this.set(key, data, ttl);

    return data;
  }

  /**
   * Prefetch and cache
   */
  async prefetch<T = any>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<void> {
    try {
      const data = await fetchFn();
      this.set(key, data, ttl);
      this.log(`Prefetched: ${key}`);
    } catch (error) {
      this.log(`Prefetch failed: ${key}`, error);
    }
  }

  // ==============================================================
  // CACHE STRATEGIES
  // ==============================================================

  /**
   * Memoize function calls
   */
  memoize<T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string,
    ttl?: number
  ): T {
    const generateKey = keyGenerator || ((...args: any[]) => JSON.stringify(args));

    return ((...args: Parameters<T>) => {
      const key = `memoized:${fn.name}:${generateKey(...args)}`;
      
      const cached = this.get(key);
      if (cached !== null) {
        return cached;
      }

      const result = fn(...args);

      // Handle promises
      if (result instanceof Promise) {
        return result.then((data) => {
          this.set(key, data, ttl);
          return data;
        });
      }

      this.set(key, result, ttl);
      return result;
    }) as T;
  }

  // ==============================================================
  // HELPER METHODS
  // ==============================================================

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestHits = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Prioritize by hits, then by age
      if (entry.hits < lowestHits || 
          (entry.hits === lowestHits && entry.timestamp < oldestTime)) {
        oldestKey = key;
        oldestTime = entry.timestamp;
        lowestHits = entry.hits;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.log(`Evicted LRU entry: ${oldestKey}`);
    }
  }

  private cleanup(): void {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      this.log(`Cleanup removed ${removed} expired entries`);
    }
  }

  private startCleanup(interval: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, interval);
  }

  // ==============================================================
  // STATISTICS
  // ==============================================================

  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const totalRequests = this.hits + this.misses;

    return {
      totalEntries: this.cache.size,
      totalHits: this.hits,
      totalMisses: this.misses,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
      memoryUsage: this.estimateMemoryUsage(),
      oldestEntry: entries.length > 0 
        ? new Date(Math.min(...entries.map(e => e.timestamp)))
        : undefined,
      newestEntry: entries.length > 0
        ? new Date(Math.max(...entries.map(e => e.timestamp)))
        : undefined,
    };
  }

  private estimateMemoryUsage(): number {
    let size = 0;
    for (const entry of this.cache.values()) {
      size += JSON.stringify(entry.data).length;
    }
    return size;
  }

  printStats(): void {
    const stats = this.getStats();
    console.log('=== Cache Statistics ===');
    console.log(`Total Entries: ${stats.totalEntries}`);
    console.log(`Total Hits: ${stats.totalHits}`);
    console.log(`Total Misses: ${stats.totalMisses}`);
    console.log(`Hit Rate: ${stats.hitRate.toFixed(2)}%`);
    console.log(`Memory Usage: ${(stats.memoryUsage / 1024).toFixed(2)} KB`);
    console.log(`Oldest Entry: ${stats.oldestEntry?.toISOString()}`);
    console.log(`Newest Entry: ${stats.newestEntry?.toISOString()}`);
  }

  // ==============================================================
  // CLEANUP
  // ==============================================================

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
    this.log('Cache manager destroyed');
  }
}

// ==============================================================
// SINGLETON INSTANCE
// ==============================================================

let globalCacheInstance: CacheManager | null = null;

export function getCacheManager(options?: CacheOptions): CacheManager {
  if (!globalCacheInstance) {
    globalCacheInstance = new CacheManager(options);
  }
  return globalCacheInstance;
}

// ==============================================================
// CONVENIENCE FUNCTIONS
// ==============================================================

export const cache = {
  get: <T = any>(key: string) => getCacheManager().get<T>(key),
  set: <T = any>(key: string, data: T, ttl?: number) => getCacheManager().set(key, data, ttl),
  has: (key: string) => getCacheManager().has(key),
  delete: (key: string) => getCacheManager().delete(key),
  clear: () => getCacheManager().clear(),
  invalidatePattern: (pattern: string | RegExp) => getCacheManager().invalidatePattern(pattern),
  getOrFetch: <T = any>(key: string, fetchFn: () => Promise<T>, ttl?: number) =>
    getCacheManager().getOrFetch<T>(key, fetchFn, ttl),
  getStats: () => getCacheManager().getStats(),
};

// ==============================================================
// EXPORT
// ==============================================================

export default CacheManager;
