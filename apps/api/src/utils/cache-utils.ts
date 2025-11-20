/**
 * Cache Utils - Compatible wrapper for lru-cache
 * 
 * Provides backward compatibility for services that expect
 * array-returning .values() and .entries() methods
 */

import { LRUCacheFactory, LRUCache } from '@credlink/cache';

export class CompatibleLRUCache<K extends {}, V extends {}> {
  private cache: LRUCache<K, V>;

  constructor(options: {
    max: number;
    ttl: number;
    allowStale?: boolean;
    updateAgeOnGet?: boolean;
    dispose?: (key: K, value: V) => void;
  }) {
    this.cache = LRUCacheFactory.createPermissionCache({ 
      maxSize: options.max, 
      ttlMs: options.ttl 
    }) as unknown as LRUCache<K, V>;
  }

  get(key: K): V | undefined {
    const result = this.cache.get(key);
    return result || undefined;
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  // Compatible methods that return arrays (not iterators)
  values(): V[] {
    return Array.from(this.cache.values());
  }

  entries(): Array<[K, V]> {
    return Array.from(this.cache.entries());
  }
}

// Factory functions matching the old LRUCacheFactory
export class CacheFactory {
  static createCertificateCache(options?: {
    maxSize?: number;
    ttlMs?: number;
  }): CompatibleLRUCache<string, any> {
    return new CompatibleLRUCache({
      max: options?.maxSize || 1000,
      ttl: options?.ttlMs || 3600000, // 1 hour
      allowStale: false,
      updateAgeOnGet: true,
      dispose: (key, value) => {
        console.debug(`Certificate cache evicted: ${key}`);
      }
    });
  }

  static createApiKeyCache(options?: {
    maxSize?: number;
    ttlMs?: number;
  }): CompatibleLRUCache<string, any> {
    return new CompatibleLRUCache({
      max: options?.maxSize || 10000,
      ttl: options?.ttlMs || 1800000, // 30 minutes
      allowStale: false,
      updateAgeOnGet: true,
      dispose: (key, value) => {
        console.debug(`API key cache evicted: ${key}`);
      }
    });
  }

  static createDeduplicationCache(options?: {
    maxSize?: number;
    ttlMs?: number;
  }): CompatibleLRUCache<string, any> {
    return new CompatibleLRUCache({
      max: options?.maxSize || 20000,
      ttl: options?.ttlMs || 1800000, // 30 minutes
      allowStale: false,
      updateAgeOnGet: true,
      dispose: (key, value) => {
        console.debug(`Deduplication cache evicted: ${key}`);
      }
    });
  }

  static createProofCache(options?: {
    maxSize?: number;
    ttlMs?: number;
  }): CompatibleLRUCache<string, any> {
    return new CompatibleLRUCache({
      max: options?.maxSize || 5000,
      ttl: options?.ttlMs || 7200000, // 2 hours
      allowStale: false,
      updateAgeOnGet: true,
      dispose: (key, value) => {
        console.debug(`Proof cache evicted: ${key}`);
      }
    });
  }
}
