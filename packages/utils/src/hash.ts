/**
 * MurmurHash3 (32-bit) implementation for deterministic route bucketing
 * Based on the original MurmurHash3 algorithm by Austin Appleby
 * SECURITY: Non-cryptographic hash - NOT for security-sensitive operations
 * PERFORMANCE: Optimized for high-throughput experiment routing
 */

// Constants for MurmurHash3 - mathematically optimal values
const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;
const R1 = 15;
const R2 = 13;
const M = 5;
const N = 0xe6546b64;

// SECURITY: Maximum input length to prevent DoS attacks
const MAX_INPUT_LENGTH = 2048;

// PERFORMANCE: Cache for frequently hashed paths
const hashCache = new Map<string, number>();
const MAX_CACHE_SIZE = 1000;

/**
 * SECURITY: Multi-layer input validation for hashing
 */
function validateHashInput(data: string): string {
  // Type validation
  if (typeof data !== 'string') {
    throw new Error('Input must be a string');
  }
  
  // SECURITY: Prevent null byte injection
  if (data.includes('\0')) {
    throw new Error('Null bytes not allowed in hash input');
  }
  
  // SECURITY: Prevent path traversal attempts
  if (data.includes('../') || data.includes('..\\')) {
    throw new Error('Path traversal sequences not allowed');
  }
  
  // SECURITY: Enforce length limits
  if (data.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`);
  }
  
  // SECURITY: Prevent control characters
  if (/[\x00-\x1F\x7F]/.test(data)) {
    throw new Error('Control characters not allowed in hash input');
  }
  
  // PERFORMANCE: Normalize path to prevent canonicalization attacks
  const normalized = data.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  
  return normalized;
}

/**
 * PERFORMANCE: Optimized 32-bit left rotation with bounds checking
 */
function rotl32(x: number, r: number): number {
    // PERFORMANCE: Ensure 32-bit unsigned operation
    x = x >>> 0;
    r = r >>> 0;
    return ((x << r) | (x >>> (32 - r))) >>> 0;
}

/**
 * PERFORMANCE: Cached MurmurHash3 with input validation
 */
export function murmur3_x86_32(data: string, seed: number = 0): number {
    // SECURITY: Validate and sanitize input
    const sanitizedData = validateHashInput(data);
    
    // SECURITY: Validate seed parameter
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new Error('Seed must be a non-negative 32-bit integer');
    }
    
    // PERFORMANCE: Check cache first
    const cacheKey = `${sanitizedData}:${seed}`;
    if (hashCache.has(cacheKey)) {
        return hashCache.get(cacheKey)!;
    }
    
    // Convert string to bytes (UTF-8)
    const bytes = new TextEncoder().encode(sanitizedData);
    const length = bytes.length;
    const blocks = Math.floor(length / 4);
    
    // PERFORMANCE: Use local variables for optimization
    let h1 = seed >>> 0;
    
    // Process blocks
    for (let i = 0; i < blocks; i++) {
        const offset = i * 4;
        
        // Little-endian conversion with bounds checking
        let k1 = (bytes[offset] || 0) |
                 ((bytes[offset + 1] || 0) << 8) |
                 ((bytes[offset + 2] || 0) << 16) |
                 ((bytes[offset + 3] || 0) << 24);
        
        k1 = multiply32(k1, C1);
        k1 = rotl32(k1, R1);
        k1 = multiply32(k1, C2);
        
        h1 ^= k1;
        h1 = rotl32(h1, R2);
        h1 = multiply32(h1, M) + N;
        h1 >>>= 0; // Ensure 32-bit unsigned
    }
    
    // Tail processing with bounds checking
    const tailOffset = blocks * 4;
    let k1 = 0;
    
    switch (length & 3) {
        case 3:
            k1 ^= (bytes[tailOffset + 2] || 0) << 16;
        case 2:
            k1 ^= (bytes[tailOffset + 1] || 0) << 8;
        case 1:
            k1 ^= bytes[tailOffset] || 0;
            k1 = multiply32(k1, C1);
            k1 = rotl32(k1, R1);
            k1 = multiply32(k1, C2);
            h1 ^= k1;
    }
    
    // Finalization
    h1 ^= length;
    h1 = fmix32(h1);
    
    // PERFORMANCE: Cache result (LRU eviction if needed)
    if (hashCache.size >= MAX_CACHE_SIZE) {
        const firstKey = hashCache.keys().next().value;
        hashCache.delete(firstKey);
    }
    hashCache.set(cacheKey, h1);
    
    return h1;
}

/**
 * PERFORMANCE: Optimized 32-bit multiplication with overflow handling
 */
function multiply32(a: number, b: number): number {
    a = a >>> 0;
    b = b >>> 0;
    return ((a & 0xffff) * (b & 0xffff) + 
            (((a >>> 16) * (b & 0xffff) + ((a & 0xffff) * (b >>> 16))) << 16)) >>> 0;
}

/**
 * PERFORMANCE: Optimized finalization mix - force avalanche
 */
function fmix32(h: number): number {
    h = h >>> 0;
    h ^= h >>> 16;
    h = multiply32(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = multiply32(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
}

/**
 * PERFORMANCE: Deterministic route bucketing with caching
 * SECURITY: Returns 0-99 bucket number for consistent assignment
 * WARNING: Not cryptographically secure - for experiment assignment only
 */
export function bucketRoute(pathname: string, seed: number = 0): number {
    const hash = murmur3_x86_32(pathname, seed);
    return hash % 100;
}

/**
 * PERFORMANCE: Optimized experiment arm assignment
 * SECURITY: @param pathname - URL path to bucket (must be valid path)
 * SECURITY: @param seed - Optional seed for reproducibility (must be valid 32-bit integer)
 * @returns 'A_EMBED' or 'B_REMOTE'
 */
export function assignExperimentArm(pathname: string, seed: number = 0): 'A_EMBED' | 'B_REMOTE' {
    const bucket = bucketRoute(pathname, seed);
    return bucket < 50 ? 'A_EMBED' : 'B_REMOTE';
}

/**
 * PERFORMANCE: Clear hash cache for memory management
 */
export function clearHashCache(): void {
    hashCache.clear();
}

/**
 * PERFORMANCE: Get cache statistics for monitoring
 */
export function getHashCacheStats(): { size: number; maxSize: number } {
    return {
        size: hashCache.size,
        maxSize: MAX_CACHE_SIZE
    };
}
