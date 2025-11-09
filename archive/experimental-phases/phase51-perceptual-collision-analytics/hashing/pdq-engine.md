# PDQ Hashing Engine Implementation

## Overview
Implementation of Meta's open-source PDQ (Perceptual Duplicate Detection) algorithm for fast, explainable visual similarity detection. PDQ produces a 256-bit binary hash optimized for finding near-duplicate images under common transformations.

## Dependencies
```json
{
  "dependencies": {
    "@c2/pdq-hash": "^1.0.0",
    "sharp": "^0.32.6",
    "opencv4nodejs": "^5.6.0",
    "buffer": "^6.0.3"
  }
}
```

## Core Implementation

### PDQ Hash Engine Class
```typescript
import { pdqHash } from '@c2/pdq-hash';
import sharp from 'sharp';
import { createHash } from 'crypto';

export interface PDQHash {
  binary: Buffer; // 256-bit binary data
  hex: string;   // Hexadecimal representation
  quality: number; // PDQ quality score 0-100
}

export interface PDQConfig {
  targetSize: number; // Target image size for PDQ (default: 256)
  minQuality: number; // Minimum quality threshold (default: 50)
  enablePreprocessing: boolean; // Enable image preprocessing
}

export class PDQHashEngine {
  private config: PDQConfig;
  private preprocessingPipeline: sharp.Sharp;

  constructor(config: Partial<PDQConfig> = {}) {
    this.config = {
      targetSize: 256,
      minQuality: 50,
      enablePreprocessing: true,
      ...config
    };

    // Initialize preprocessing pipeline
    this.preprocessingPipeline = sharp()
      .resize(this.config.targetSize, this.config.targetSize, {
        fit: 'cover',
        position: 'center'
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .toColorspace('srgb');
  }

  /**
   * Compute PDQ hash from image buffer
   * @param imageBuffer Input image data
   * @returns Promise<PDQHash> Computed PDQ hash with quality score
   */
  async computePDQ(imageBuffer: Buffer): Promise<PDQHash> {
    try {
      // Validate input
      if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error('Input must be a Buffer');
      }

      if (imageBuffer.length === 0) {
        throw new Error('Input buffer is empty');
      }

      // Preprocess image if enabled
      const processedBuffer = this.config.enablePreprocessing
        ? await this.preprocessingPipeline.clone().png().toBuffer()
        : imageBuffer;

      // Compute PDQ hash using Meta's implementation
      const { hash, quality } = await pdqHash(processedBuffer);

      // Validate quality threshold
      if (quality < this.config.minQuality) {
        throw new Error(`Image quality ${quality} below minimum threshold ${this.config.minQuality}`);
      }

      // Convert hash to proper format
      const binaryHash = Buffer.from(hash, 'hex');
      if (binaryHash.length !== 32) { // 256 bits = 32 bytes
        throw new Error(`Invalid PDQ hash length: expected 32 bytes, got ${binaryHash.length}`);
      }

      return {
        binary: binaryHash,
        hex: hash,
        quality
      };
    } catch (error) {
      throw new Error(`PDQ computation failed: ${error.message}`);
    }
  }

  /**
   * Compute PDQ hash from image file path
   * @param imagePath Path to image file
   * @returns Promise<PDQHash> Computed PDQ hash
   */
  async computePDQFromFile(imagePath: string): Promise<PDQHash> {
    try {
      const imageBuffer = await sharp(imagePath)
        .raw()
        .toBuffer();

      return this.computePDQ(imageBuffer);
    } catch (error) {
      throw new Error(`Failed to read image file: ${error.message}`);
    }
  }

  /**
   * Compare two PDQ hashes using Hamming distance
   * @param hash1 First PDQ hash
   * @param hash2 Second PDQ hash
   * @returns number Hamming distance (0-256)
   */
  comparePDQ(hash1: PDQHash, hash2: PDQHash): number {
    if (hash1.binary.length !== 32 || hash2.binary.length !== 32) {
      throw new Error('Both hashes must be 256 bits (32 bytes)');
    }

    let distance = 0;
    for (let i = 0; i < 32; i++) {
      const byte1 = hash1.binary[i];
      const byte2 = hash2.binary[i];
      
      // Count differing bits using XOR
      const xor = byte1 ^ byte2;
      distance += this.countSetBits(xor);
    }

    return distance;
  }

  /**
   * Calculate similarity score from Hamming distance
   * @param hammingDistance Hamming distance between hashes
   * @returns number Similarity score (0-1, where 1 is identical)
   */
  calculateSimilarity(hammingDistance: number): number {
    const maxDistance = 256;
    return Math.max(0, 1 - (hammingDistance / maxDistance));
  }

  /**
   * Batch compute PDQ hashes for multiple images
   * @param imageBuffers Array of image buffers
   * @returns Promise<PDQHash[]> Array of computed hashes
   */
  async batchComputePDQ(imageBuffers: Buffer[]): Promise<PDQHash[]> {
    const results: PDQHash[] = [];
    const errors: Error[] = [];

    // Process in parallel with concurrency limit
    const concurrencyLimit = 10;
    for (let i = 0; i < imageBuffers.length; i += concurrencyLimit) {
      const batch = imageBuffers.slice(i, i + concurrencyLimit);
      
      const batchPromises = batch.map(async (buffer, index) => {
        try {
          const hash = await this.computePDQ(buffer);
          return { index, hash, error: null };
        } catch (error) {
          return { index: i + index, hash: null, error };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(({ index, hash, error }) => {
        if (error) {
          errors.push(error as Error);
        } else {
          results[index] = hash!;
        }
      });
    }

    if (errors.length > 0) {
      console.warn(`${errors.length} PDQ computations failed`);
    }

    return results.filter(Boolean);
  }

  /**
   * Extract hash features for indexing
   * @param pdqHash PDQ hash to extract features from
   * @returns object Extracted features for efficient indexing
   */
  extractHashFeatures(pdqHash: PDQHash) {
    // Divide hash into segments for bucket-based indexing
    const segments = [];
    const segmentSize = 8; // 64 bits per segment
    
    for (let i = 0; i < 32; i += segmentSize) {
      const segment = pdqHash.binary.slice(i, i + segmentSize);
      segments.push(segment.toString('hex'));
    }

    // Compute hash signature for quick filtering
    const signature = createHash('md5').update(pdqHash.binary).digest('hex');

    return {
      segments,
      signature,
      quality: pdqHash.quality,
      hex: pdqHash.hex
    };
  }

  /**
   * Validate PDQ hash format
   * @param hash Hash to validate
   * @returns boolean True if valid
   */
  validatePDQHash(hash: PDQHash): boolean {
    return (
      hash &&
      Buffer.isBuffer(hash.binary) &&
      hash.binary.length === 32 &&
      typeof hash.hex === 'string' &&
      hash.hex.length === 64 && // 256 bits = 64 hex chars
      /^[0-9a-f]{64}$/i.test(hash.hex) &&
      typeof hash.quality === 'number' &&
      hash.quality >= 0 &&
      hash.quality <= 100
    );
  }

  /**
   * Get hash statistics for monitoring
   * @param hashes Array of PDQ hashes
   * @returns object Statistical summary
   */
  getHashStatistics(hashes: PDQHash[]) {
    if (hashes.length === 0) {
      return {
        count: 0,
        avgQuality: 0,
        minQuality: 0,
        maxQuality: 0
      };
    }

    const qualities = hashes.map(h => h.quality);
    const avgQuality = qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
    const minQuality = Math.min(...qualities);
    const maxQuality = Math.max(...qualities);

    return {
      count: hashes.length,
      avgQuality: Math.round(avgQuality * 100) / 100,
      minQuality,
      maxQuality
    };
  }

  /**
   * Helper method to count set bits in a byte
   * @param byte Byte to count bits in
   * @returns number Number of set bits
   */
  private countSetBits(byte: number): number {
    // Brian Kernighan's algorithm
    let count = 0;
    while (byte) {
      byte &= byte - 1;
      count++;
    }
    return count;
  }
}
```

## Performance Optimizations

### Memory Pool for Hash Computation
```typescript
class PDQHashPool {
  private pool: PDQHashEngine[] = [];
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  async acquire(): Promise<PDQHashEngine> {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return new PDQHashEngine();
  }

  release(engine: PDQHashEngine): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(engine);
    }
  }
}
```

### GPU Acceleration Support
```typescript
export class GPUAcceleratedPDQEngine extends PDQHashEngine {
  private gpuEnabled: boolean;

  constructor(config: Partial<PDQConfig> = {}) {
    super(config);
    this.gpuEnabled = this.detectGPU();
  }

  private detectGPU(): boolean {
    // Check for CUDA/OpenCL availability
    try {
      // Implementation would check for GPU compute capabilities
      return process.env.GPU_ENABLED === 'true';
    } catch {
      return false;
    }
  }

  async computePDQ(imageBuffer: Buffer): Promise<PDQHash> {
    if (this.gpuEnabled) {
      return this.computePDQGPU(imageBuffer);
    }
    return super.computePDQ(imageBuffer);
  }

  private async computePDQGPU(imageBuffer: Buffer): Promise<PDQHash> {
    // GPU-accelerated implementation
    // Would use CUDA kernels or WebGPU for parallel processing
    throw new Error('GPU implementation not yet available');
  }
}
```

## Integration Points

### With Ingest Pipeline
```typescript
export class PDQIngestProcessor {
  private pdqEngine: PDQHashEngine;

  constructor() {
    this.pdqEngine = new PDQHashEngine({
      targetSize: 256,
      minQuality: 50,
      enablePreprocessing: true
    });
  }

  async processAsset(asset: SignedAsset): Promise<HashRecord> {
    const pdqHash = await this.pdqEngine.computePDQ(asset.imageData);
    const features = this.pdqEngine.extractHashFeatures(pdqHash);

    return {
      tenant_id: asset.tenantId,
      asset_id: asset.id,
      manifest_lineage: asset.manifest.lineage,
      pdq_hash: pdqHash,
      created_at: new Date(),
      updated_at: new Date()
    };
  }
}
```

### With Query System
```typescript
export class PDQQueryEngine {
  private pdqEngine: PDQHashEngine;

  async findSimilarAssets(
    queryHash: PDQHash,
    threshold: number,
    limit: number
  ): Promise<Candidate[]> {
    // Convert threshold to maximum Hamming distance
    const maxDistance = Math.floor(threshold * 256);

    // Query index for candidates
    const candidates = await this.index.queryPDQ(
      queryHash,
      maxDistance,
      limit
    );

    // Calculate similarity scores
    return candidates.map(candidate => ({
      ...candidate,
      similarity: this.pdqEngine.calculateSimilarity(
        this.pdqEngine.comparePDQ(queryHash, candidate.pdq_hash)
      )
    }));
  }
}
```

## Error Handling & Monitoring

### Error Types
```typescript
export class PDQError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PDQError';
  }
}

export const PDQ_ERROR_CODES = {
  INVALID_INPUT: 'INVALID_INPUT',
  LOW_QUALITY: 'LOW_QUALITY',
  COMPUTATION_FAILED: 'COMPUTATION_FAILED',
  INVALID_HASH: 'INVALID_HASH'
} as const;
```

### Metrics Collection
```typescript
export class PDQMetrics {
  private metrics: Map<string, number> = new Map();

  recordHashComputation(duration: number, success: boolean): void {
    const key = success ? 'hash_computation_success' : 'hash_computation_failure';
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
    this.metrics.set('hash_computation_duration', duration);
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }
}
```

## Testing Suite

### Unit Tests
```typescript
describe('PDQHashEngine', () => {
  let engine: PDQHashEngine;

  beforeEach(() => {
    engine = new PDQHashEngine();
  });

  test('should compute valid PDQ hash', async () => {
    const testImage = Buffer.from('fake-image-data');
    const result = await engine.computePDQ(testImage);
    
    expect(engine.validatePDQHash(result)).toBe(true);
    expect(result.binary.length).toBe(32);
    expect(result.hex.length).toBe(64);
  });

  test('should calculate correct Hamming distance', () => {
    const hash1: PDQHash = { binary: Buffer.alloc(32, 0x00), hex: '0'.repeat(64), quality: 100 };
    const hash2: PDQHash = { binary: Buffer.alloc(32, 0xFF), hex: 'f'.repeat(64), quality: 100 };
    
    const distance = engine.comparePDQ(hash1, hash2);
    expect(distance).toBe(256); // All bits differ
  });
});
```

### Performance Benchmarks
```typescript
describe('PDQ Performance', () => {
  test('should compute hash within latency target', async () => {
    const engine = new PDQHashEngine();
    const testImage = Buffer.from('large-test-image');
    
    const start = performance.now();
    await engine.computePDQ(testImage);
    const duration = performance.now() - start;
    
    expect(duration).toBeLessThan(50); // 50ms target
  });
});
```
