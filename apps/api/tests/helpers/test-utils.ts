import sharp from 'sharp';

/**
 * Test Utilities
 * 
 * Helper functions for testing
 */

/**
 * Generate test image
 */
export async function generateTestImage(options: {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
} = {}): Promise<Buffer> {
  const {
    width = 1920,
    height = 1080,
    format = 'jpeg',
    quality = 85
  } = options;

  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 128, b: 128 }
    }
  });

  switch (format) {
    case 'jpeg':
      return await image.jpeg({ quality }).toBuffer();
    case 'png':
      return await image.png().toBuffer();
    case 'webp':
      return await image.webp({ quality }).toBuffer();
    default:
      return await image.jpeg({ quality }).toBuffer();
  }
}

/**
 * Generate multiple test images
 */
export async function generateTestImages(count: number): Promise<Buffer[]> {
  const images: Buffer[] = [];
  const sizes = [
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
    { width: 1080, height: 1920 },
    { width: 1200, height: 630 },
    { width: 800, height: 600 }
  ];

  for (let i = 0; i < count; i++) {
    const size = sizes[i % sizes.length];
    const image = await generateTestImage(size);
    images.push(image);
  }

  return images;
}

/**
 * Measure execution time
 */
export async function measureTime<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;
  return { result, duration };
}

/**
 * Wait for condition
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

/**
 * Retry operation
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Create mock data
 */
export function createMockManifest() {
  return {
    '@context': 'https://c2pa.org/specifications/c2pa/v1.0',
    claim_generator: {
      name: 'CredLink',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    },
    assertions: []
  };
}

/**
 * Create mock signature
 */
export function createMockSignature(): string {
  return Buffer.from('mock-signature-' + Date.now()).toString('base64');
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Random string generator
 */
export function randomString(length: number = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Random number in range
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Assert eventually
 */
export async function assertEventually(
  assertion: () => void | Promise<void>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();
  let lastError: Error | undefined;

  while (Date.now() - startTime < timeout) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }

  throw lastError || new Error('Assertion failed');
}

/**
 * Batch operations
 */
export async function batch<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batchItems = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batchItems.map(fn));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Parallel operations with limit
 */
export async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result);
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }

  await Promise.all(executing);
  return results;
}
