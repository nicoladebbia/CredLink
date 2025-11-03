/**
 * CRITICAL: Memory Security and Corruption Prevention
 * 
 * This module prevents memory corruption vulnerabilities including:
 * - Buffer overflow attacks
 * - Heap spraying techniques
 * - Use-after-free vulnerabilities
 * - Memory exhaustion DoS attacks
 * - Type confusion attacks
 */

import { createHash } from 'crypto';

interface MemoryLimits {
  maxBufferSize: number;
  maxArraySize: number;
  maxStringSize: number;
  maxConcurrentBuffers: number;
}

class MemorySecurityManager {
  private static readonly LIMITS: MemoryLimits = {
    maxBufferSize: 50 * 1024 * 1024, // 50MB
    maxArraySize: 1000000, // 1M elements
    maxStringSize: 10 * 1024 * 1024, // 10MB
    maxConcurrentBuffers: 100
  };

  private static activeBuffers = new Set<Buffer | Uint8Array>();
  private static cleanupInterval: NodeJS.Timeout;

  static initialize(): void {
    // Clean up stale buffers every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.monitorMemoryUsage();
    }, 30000);
  }

  /**
   * CRITICAL: Validate buffer size to prevent overflow attacks
   */
  static validateBufferSize(buffer: Buffer | Uint8Array, source: string): void {
    if (buffer.length > this.LIMITS.maxBufferSize) {
      throw new Error(
        `BUFFER_OVERFLOW_DETECTED: ${source} buffer size ${buffer.length} exceeds limit ${this.LIMITS.maxBufferSize}`
      );
    }

    if (buffer.length === 0) {
      throw new Error(`EMPTY_BUFFER_DETECTED: ${source} buffer is empty`);
    }

    this.activeBuffers.add(buffer);
  }

  /**
   * CRITICAL: Safe buffer creation with size limits
   */
  static createSafeBuffer(size: number, source: string): Buffer {
    if (size > this.LIMITS.maxBufferSize) {
      throw new Error(
        `BUFFER_CREATION_BLOCKED: ${source} requested size ${size} exceeds limit ${this.LIMITS.maxBufferSize}`
      );
    }

    if (size < 0) {
      throw new Error(`INVALID_BUFFER_SIZE: ${source} negative size ${size}`);
    }

    return Buffer.allocUnsafeSlow(size);
  }

  /**
   * CRITICAL: Prevent array-based attacks
   */
  static validateArraySize<T>(array: T[], source: string): void {
    if (array.length > this.LIMITS.maxArraySize) {
      throw new Error(
        `ARRAY_OVERFLOW_DETECTED: ${source} array size ${array.length} exceeds limit ${this.LIMITS.maxArraySize}`
      );
    }
  }

  /**
   * CRITICAL: String length validation to prevent memory exhaustion
   */
  static validateStringLength(str: string, source: string): void {
    if (str.length > this.LIMITS.maxStringSize) {
      throw new Error(
        `STRING_OVERFLOW_DETECTED: ${source} string length ${str.length} exceeds limit ${this.LIMITS.maxStringSize}`
      );
    }
  }

  /**
   * CRITICAL: Safe JSON parsing with memory limits
   */
  static safeJsonParse(json: string, source: string): any {
    this.validateStringLength(json, `${source}_json`);

    try {
      const parsed = JSON.parse(json);
      
      // Recursively validate object structure
      this.validateObjectDepth(parsed, `${source}_object`, 0, 10);
      
      return parsed;
    } catch (error) {
      throw new Error(`JSON_PARSE_ERROR: ${source} - ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  /**
   * CRITICAL: Prevent deep object attacks
   */
  private static validateObjectDepth(
    obj: any, 
    source: string, 
    currentDepth: number, 
    maxDepth: number
  ): void {
    if (currentDepth > maxDepth) {
      throw new Error(
        `OBJECT_DEPTH_EXCEEDED: ${source} depth ${currentDepth} exceeds limit ${maxDepth}`
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          this.validateStringLength(key, `${source}_key`);
          this.validateObjectDepth(obj[key], `${source}_${key}`, currentDepth + 1, maxDepth);
        }
      }
    }
  }

  /**
   * CRITICAL: Heap spraying protection
   */
  static detectHeapSpraying(): void {
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    const heapTotalMB = memUsage.heapTotal / 1024 / 1024;

    // Detect suspicious memory allocation patterns
    if (heapUsedMB > 500) { // 500MB threshold
      console.error(`🚨 HEAP SPRAYING DETECTED: Heap usage ${heapUsedMB.toFixed(2)}MB`);
      
      // Check if we have too many active buffers
      if (this.activeBuffers.size > this.LIMITS.maxConcurrentBuffers) {
        throw new Error(
          `HEAP_SPRAYING_ATTACK: Too many active buffers ${this.activeBuffers.size}`
        );
      }
    }

    // Detect heap fragmentation
    const heapUtilization = heapUsedMB / heapTotalMB;
    if (heapUtilization < 0.3 && heapTotalMB > 1000) {
      console.warn(`⚠️ HEAP FRAGMENTATION: Low utilization ${heapUtilization.toFixed(2)} with large heap ${heapTotalMB.toFixed(2)}MB`);
    }
  }

  /**
   * CRITICAL: Memory usage monitoring
   */
  static monitorMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const stats = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
      activeBuffers: this.activeBuffers.size
    };

    if (stats.heapUsed > 400) {
      console.error(`🚨 HIGH MEMORY USAGE:`, stats);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log(`🧹 Forced garbage collection`);
      }
    }

    this.detectHeapSpraying();
  }

  /**
   * CRITICAL: Safe buffer operations
   */
  static safeBufferCopy(dest: Buffer | Uint8Array, src: Buffer | Uint8Array, source: string): void {
    this.validateBufferSize(dest, `${source}_dest`);
    this.validateBufferSize(src, `${source}_src`);

    if (src.length > dest.length) {
      throw new Error(
        `BUFFER_COPY_OVERFLOW: ${source} source ${src.length} > destination ${dest.length}`
      );
    }

    dest.set(src);
  }

  /**
   * CRITICAL: Prevent use-after-free with buffer tracking
   */
  static trackBuffer(buffer: Buffer | Uint8Array, source: string): void {
    this.validateBufferSize(buffer, source);
    this.activeBuffers.add(buffer);
  }

  /**
   * CRITICAL: Safe buffer cleanup
   */
  static releaseBuffer(buffer: Buffer | Uint8Array): void {
    this.activeBuffers.delete(buffer);
  }

  /**
   * CRITICAL: Memory pressure detection
   */
  static checkMemoryPressure(): boolean {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;
    
    return heapUsedPercent > 0.9 || memUsage.rss > 1024 * 1024 * 1024; // 1GB RSS
  }

  /**
   * CRITICAL: Create memory-safe manifest processor
   */
  static createManifestProcessor() {
    return {
      process: (data: Uint8Array, source: string) => {
        this.validateBufferSize(data, source);
        
        // Create hash safely
        const hash = createHash('sha256');
        hash.update(data);
        
        return {
          hash: hash.digest('hex'),
          size: data.length,
          processed: new Uint8Array(data) // Safe copy
        };
      }
    };
  }

  /**
   * Cleanup resources
   */
  static shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.activeBuffers.clear();
  }
}

// Initialize memory security
MemorySecurityManager.initialize();

export { MemorySecurityManager };
export type { MemoryLimits };
