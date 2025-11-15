/**
 * Sharp Optimizer
 * 
 * P-1: Image Processing Optimizations
 * - Sequential read for large files (2x memory reduction)
 * - Optimal Sharp configuration
 * - Cache management
 * - Memory-efficient operations
 */

import sharp from 'sharp';
import { logger } from './logger';

// File size threshold for sequential read (10MB)
const SEQUENTIAL_READ_THRESHOLD = 10 * 1024 * 1024;

// Configure Sharp cache (default 50MB, tune based on workload)
// In production, set to higher value based on available memory
const SHARP_CACHE_MB = parseInt(process.env.SHARP_CACHE_MB || '50', 10);
const SHARP_CONCURRENCY = parseInt(process.env.SHARP_CONCURRENCY || '4', 10);

// Initialize Sharp configuration
export function initializeSharp(): void {
  // Configure cache size
  sharp.cache({
    memory: SHARP_CACHE_MB, // MB of memory to use for caching
    files: 20, // Max number of files to cache
    items: 100 // Max number of operations to cache
  });

  // Set concurrency limit to prevent CPU saturation
  sharp.concurrency(SHARP_CONCURRENCY);

  // Set max listeners to prevent warnings under high concurrency
  // Sharp creates many event emitters internally
  process.setMaxListeners(100);

  logger.info('Sharp optimizer initialized', {
    cacheMemory: `${SHARP_CACHE_MB}MB`,
    concurrency: SHARP_CONCURRENCY,
    maxListeners: 100
  });
}

/**
 * Create optimized Sharp instance based on image size
 */
export function createOptimizedSharp(
  input: Buffer | string,
  options?: {
    sequentialRead?: boolean;
    failOnError?: boolean;
    density?: number;
    limitInputPixels?: number | boolean;
  }
): sharp.Sharp {
  const size = Buffer.isBuffer(input) ? input.length : 0;
  const useSequential = options?.sequentialRead ?? (size > SEQUENTIAL_READ_THRESHOLD);

  const sharpOptions: sharp.SharpOptions = {
    // Sequential read reduces memory usage by ~2x for large files
    sequentialRead: useSequential,
    
    // Don't fail on minor errors (corrupted EXIF etc.)
    failOnError: options?.failOnError ?? false,
    
    // Limit input pixels to prevent DoS (default 268 megapixels)
    limitInputPixels: options?.limitInputPixels ?? 268402689,
    
    // Density for vector formats (PDF, SVG)
    density: options?.density
  };

  if (useSequential && size > 0) {
    logger.debug('Using sequential read for large image', {
      size: `${(size / 1024 / 1024).toFixed(2)}MB`
    });
  }

  return sharp(input, sharpOptions);
}

/**
 * Process image with optimal settings
 */
export async function processImage(
  input: Buffer,
  operations: (instance: sharp.Sharp) => sharp.Sharp
): Promise<Buffer> {
  const instance = createOptimizedSharp(input);
  
  try {
    const processed = operations(instance);
    return await processed.toBuffer();
  } catch (error: any) {
    logger.error('Sharp processing failed', {
      error: error.message,
      inputSize: input.length
    });
    throw error;
  }
}

/**
 * Stream-based processing for very large files
 * Reduces memory usage by avoiding full buffering
 */
export function createProcessingStream(
  operations: (instance: sharp.Sharp) => sharp.Sharp
): NodeJS.ReadWriteStream {
  const instance = sharp({
    sequentialRead: true,
    failOnError: false
  });
  
  return operations(instance) as unknown as NodeJS.ReadWriteStream;
}

/**
 * Get Sharp statistics for monitoring
 */
export function getSharpStats(): {
  cache: any;
  concurrency: number;
  counters: any;
} {
  return {
    cache: sharp.cache(),
    concurrency: sharp.concurrency(),
    counters: sharp.counters()
  };
}

/**
 * Reset Sharp cache (useful for testing or low-memory situations)
 */
export function resetSharpCache(): void {
  sharp.cache(false);
  sharp.cache({
    memory: SHARP_CACHE_MB,
    files: 20,
    items: 100
  });
  logger.info('Sharp cache reset');
}

/**
 * Estimate memory usage for image processing
 */
export function estimateMemoryUsage(
  width: number,
  height: number,
  channels: number = 4
): number {
  // Each pixel uses 'channels' bytes (RGBA = 4, RGB = 3)
  // Sharp uses additional memory for processing
  const baseMemory = width * height * channels;
  const processingOverhead = baseMemory * 1.5; // 50% overhead estimate
  return Math.ceil(baseMemory + processingOverhead);
}

/**
 * Check if image is too large for current memory limits
 */
export function isImageTooLarge(
  width: number,
  height: number,
  maxMemoryMB: number = 512
): boolean {
  const estimatedMemory = estimateMemoryUsage(width, height);
  const maxMemoryBytes = maxMemoryMB * 1024 * 1024;
  return estimatedMemory > maxMemoryBytes;
}
