/**
 * LRU Cache Implementation for Memory Leak Prevention
 * STEP 9: CRED-009 - Memory Leak Fixes with LRU Caching
 */

export interface LRUCacheOptions<K = string, V = any> {
    maxSize: number;
    ttlMs?: number;
    cleanupIntervalMs?: number;
    onEvict?: (key: K, value: V) => void;
}

export interface CacheNode<K, V> {
    key: K;
    value: V;
    timestamp: number;
    prev: CacheNode<K, V> | null;
    next: CacheNode<K, V> | null;
}

/**
 * Thread-safe LRU Cache with TTL support
 * Prevents memory exhaustion by enforcing size limits and automatic cleanup
 */
export class LRUCache<K = string, V = any> {
    private maxSize: number;
    private ttlMs?: number;
    private onEvict?: (key: K, value: V) => void;
    
    private cache: Map<K, CacheNode<K, V>> = new Map();
    private head: CacheNode<K, V> | null = null;
    private tail: CacheNode<K, V> | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(options: LRUCacheOptions<K, V>) {
        this.maxSize = options.maxSize;
        this.ttlMs = options.ttlMs;
        this.onEvict = options.onEvict;

        if (this.ttlMs) {
            // 🔥 CRITICAL FIX: Skip cleanup intervals in test environment
            if (process.env.NODE_ENV !== 'test') {
                // Cleanup expired entries at configurable interval
                const cleanupInterval = options.cleanupIntervalMs || 60000; // Default 1 minute
                this.cleanupInterval = setInterval(() => {
                    this.cleanupExpired();
                }, cleanupInterval);
            }
        }
    }

    /**
     * Get value from cache, returns null if not found or expired
     */
    get(key: K): V | null {
        const node = this.cache.get(key);
        
        if (!node) {
            return null;
        }

        // Check TTL expiration
        if (this.ttlMs && Date.now() - node.timestamp > this.ttlMs) {
            this.delete(key);
            return null;
        }

        // Move to front (most recently used)
        this.moveToFront(node);
        return node.value;
    }

    /**
     * Set value in cache, evicts oldest if at capacity
     */
    set(key: K, value: V): void {
        const existingNode = this.cache.get(key);
        
        if (existingNode) {
            // Update existing node
            existingNode.value = value;
            existingNode.timestamp = Date.now();
            this.moveToFront(existingNode);
            return;
        }

        // Create new node
        const newNode: CacheNode<K, V> = {
            key,
            value,
            timestamp: Date.now(),
            prev: null,
            next: null
        };

        // Add to front
        this.addToFront(newNode);
        this.cache.set(key, newNode);

        // Evict oldest if at capacity
        if (this.cache.size > this.maxSize) {
            this.evictOldest();
        }
    }

    /**
     * Delete specific key from cache
     */
    delete(key: K): boolean {
        const node = this.cache.get(key);
        if (!node) {
            return false;
        }

        this.removeNode(node);
        this.cache.delete(key);
        
        if (this.onEvict) {
            this.onEvict(node.key, node.value);
        }
        
        return true;
    }

    /**
     * Check if key exists and is not expired
     */
    has(key: K): boolean {
        const node = this.cache.get(key);
        if (!node) {
            return false;
        }

        if (this.ttlMs && Date.now() - node.timestamp > this.ttlMs) {
            this.delete(key);
            return false;
        }

        return true;
    }

    /**
     * Clear all entries from cache
     */
    clear(): void {
        if (this.onEvict) {
            for (const node of this.cache.values()) {
                this.onEvict(node.key, node.value);
            }
        }
        
        this.cache.clear();
        this.head = null;
        this.tail = null;
    }

    /**
     * Get current cache size
     */
    get size(): number {
        return this.cache.size;
    }

    /**
     * Get all keys (for debugging/monitoring)
     */
    keys(): K[] {
        return Array.from(this.cache.keys());
    }

    /**
     * Get all values (for deduplication service compatibility)
     */
    values(): V[] {
        return Array.from(this.cache.values()).map(node => node.value);
    }

    /**
     * Get all entries (for proof-storage compatibility)
     */
    entries(): Array<[K, V]> {
        return Array.from(this.cache.entries()).map(([key, node]) => [key, node.value]);
    }

    /**
     * Cleanup expired entries
     */
    private cleanupExpired(): void {
        if (!this.ttlMs) {
            return;
        }

        const now = Date.now();
        const expiredKeys: K[] = [];

        for (const [key, node] of this.cache.entries()) {
            if (now - node.timestamp > this.ttlMs) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            this.delete(key);
        }
    }

    /**
     * Move node to front of linked list
     */
    private moveToFront(node: CacheNode<K, V>): void {
        this.removeNode(node);
        this.addToFront(node);
    }

    /**
     * Add node to front of linked list
     */
    private addToFront(node: CacheNode<K, V>): void {
        node.prev = null;
        node.next = this.head;

        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;

        if (!this.tail) {
            this.tail = node;
        }
    }

    /**
     * Remove node from linked list
     */
    private removeNode(node: CacheNode<K, V>): void {
        if (node.prev) {
            node.prev.next = node.next;
        } else {
            this.head = node.next;
        }

        if (node.next) {
            node.next.prev = node.prev;
        } else {
            this.tail = node.prev;
        }
    }

    /**
     * Evict oldest (least recently used) entry
     */
    private evictOldest(): void {
        if (!this.tail) {
            return;
        }

        const oldestKey = this.tail.key;
        this.delete(oldestKey);
    }

    /**
     * Cleanup resources
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        // 🔥 CRITICAL FIX: Clear cache to prevent memory leak
        this.clear();
    }
}

/**
 * Factory for creating pre-configured LRU caches
 */
export class LRUCacheFactory {
    static createCertificateCache(options?: {
        maxSize?: number;
        ttlMs?: number;
        cleanupIntervalMs?: number;
    }): LRUCache<string, any> {
        return new LRUCache({
            maxSize: options?.maxSize || 1000, // Max 1000 certificates
            ttlMs: options?.ttlMs || 3600000, // 1 hour TTL
            cleanupIntervalMs: options?.cleanupIntervalMs || 60000, // 1 minute cleanup
            onEvict: (key, value) => {
                console.debug(`Certificate cache evicted: ${key}`);
            }
        });
    }

    static createApiKeyCache(options?: {
        maxSize?: number;
        ttlMs?: number;
        cleanupIntervalMs?: number;
    }): LRUCache<string, any> {
        return new LRUCache({
            maxSize: options?.maxSize || 10000, // Max 10k API keys
            ttlMs: options?.ttlMs || 1800000, // 30 minutes TTL
            cleanupIntervalMs: options?.cleanupIntervalMs || 60000, // 1 minute cleanup
            onEvict: (key, value) => {
                console.debug(`API key cache evicted: ${key}`);
            }
        });
    }

    static createPermissionCache(options?: {
        maxSize?: number;
        ttlMs?: number;
        cleanupIntervalMs?: number;
    }): LRUCache<string, any> {
        return new LRUCache({
            maxSize: options?.maxSize || 50000, // Max 50k permission checks
            ttlMs: options?.ttlMs || 300000, // 5 minutes TTL
            cleanupIntervalMs: options?.cleanupIntervalMs || 60000, // 1 minute cleanup
            onEvict: (key, value) => {
                console.debug(`Permission cache evicted: ${key}`);
            }
        });
    }

    static createProofCache(options?: {
        maxSize?: number;
        ttlMs?: number;
        cleanupIntervalMs?: number;
    }): LRUCache<string, any> {
        return new LRUCache({
            maxSize: options?.maxSize || 5000, // Max 5k proofs
            ttlMs: options?.ttlMs || 7200000, // 2 hours TTL
            cleanupIntervalMs: options?.cleanupIntervalMs || 60000, // 1 minute cleanup
            onEvict: (key, value) => {
                console.debug(`Proof cache evicted: ${key}`);
            }
        });
    }

    static createDeduplicationCache(options?: {
        maxSize?: number;
        ttlMs?: number;
        cleanupIntervalMs?: number;
    }): LRUCache<string, any> {
        return new LRUCache({
            maxSize: options?.maxSize || 20000, // Max 20k hashes
            ttlMs: options?.ttlMs || 1800000, // 30 minutes TTL
            cleanupIntervalMs: options?.cleanupIntervalMs || 60000, // 1 minute cleanup
            onEvict: (key, value) => {
                console.debug(`Deduplication cache evicted: ${key}`);
            }
        });
    }
}
