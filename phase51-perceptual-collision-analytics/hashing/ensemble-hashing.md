# Ensemble Hashing Implementation

## Overview
Implementation of classic perceptual hashing algorithms (aHash, dHash, pHash) to add diversity against edge cases and reduce single-algorithm brittleness through ensemble voting.

## Dependencies
```json
{
  "dependencies": {
    "sharp": "^0.32.6",
    "image-hash": "^4.1.0",
    "jimp": "^0.22.10"
  }
}
```

## Core Implementation

### Ensemble Hash Types
```typescript
export interface AverageHash {
  type: 'ahash';
  binary: Buffer; // 64-bit binary hash
  hex: string;    // 16-character hex string
  size: number;   // Hash size (default: 8x8 = 64 bits)
}

export interface DifferenceHash {
  type: 'dhash';
  binary: Buffer; // 64-bit binary hash
  hex: string;    // 16-character hex string
  size: number;   // Hash size (default: 9x8 = 64 bits)
}

export interface PerceptualHash {
  type: 'phash';
  binary: Buffer; // 64-bit binary hash
  hex: string;    // 16-character hex string
  size: number;   // Hash size (default: 32x32 = 64 bits)
}

export interface EnsembleHashes {
  ahash?: AverageHash;
  dhash?: DifferenceHash;
  phash?: PerceptualHash;
  computed_at: Date;
}

export interface EnsembleConfig {
  enableAHash: boolean;
  enableDHash: boolean;
  enablePHash: boolean;
  aHashSize: number;    // Default: 8 (8x8 = 64 bits)
  dHashSize: number;    // Default: 9 (9x8 = 64 bits)
  pHashSize: number;    // Default: 32 (32x32 DCT -> 64 bits)
  targetImageSize: number; // For preprocessing
}
```

### Ensemble Hash Engine
```typescript
import sharp from 'sharp';
import { createHash } from 'crypto';

export class EnsembleHashEngine {
  private config: EnsembleConfig;

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.config = {
      enableAHash: true,
      enableDHash: true,
      enablePHash: true,
      aHashSize: 8,
      dHashSize: 9,
      pHashSize: 32,
      targetImageSize: 64,
      ...config
    };
  }

  /**
   * Compute all enabled ensemble hashes for an image
   * @param imageBuffer Input image data
   * @returns Promise<EnsembleHashes> Computed hashes
   */
  async computeEnsembleHashes(imageBuffer: Buffer): Promise<EnsembleHashes> {
    const result: EnsembleHashes = {
      computed_at: new Date()
    };

    // Preprocess image once
    const processedImage = await this.preprocessImage(imageBuffer);

    // Compute enabled hashes in parallel
    const hashPromises: Promise<void>[] = [];

    if (this.config.enableAHash) {
      hashPromises.push(
        this.computeAHash(processedImage).then(hash => {
          result.ahash = hash;
        })
      );
    }

    if (this.config.enableDHash) {
      hashPromises.push(
        this.computeDHash(processedImage).then(hash => {
          result.dhash = hash;
        })
      );
    }

    if (this.config.enablePHash) {
      hashPromises.push(
        this.computePHash(processedImage).then(hash => {
          result.phash = hash;
        })
      );
    }

    await Promise.all(hashPromises);
    return result;
  }

  /**
   * Compute Average Hash (aHash)
   * Simple grayscale average-based hash
   */
  private async computeAHash(imageBuffer: Buffer): Promise<AverageHash> {
    try {
      // Resize to target size and convert to grayscale
      const { data, info } = await sharp(imageBuffer)
        .resize(this.config.aHashSize, this.config.aHashSize, {
          fit: 'fill'
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Calculate average pixel value
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        sum += data[i];
      }
      const average = sum / data.length;

      // Generate hash: 1 if pixel >= average, 0 otherwise
      const hashBits = new Array(data.length).fill(0);
      for (let i = 0; i < data.length; i++) {
        hashBits[i] = data[i] >= average ? 1 : 0;
      }

      return this.bitsToHash(hashBits, 'ahash', this.config.aHashSize * this.config.aHashSize);
    } catch (error) {
      throw new Error(`aHash computation failed: ${error.message}`);
    }
  }

  /**
   * Compute Difference Hash (dHash)
   * Based on gradient differences between adjacent pixels
   */
  private async computeDHash(imageBuffer: Buffer): Promise<DifferenceHash> {
    try {
      // Resize to target size and convert to grayscale
      const { data, info } = await sharp(imageBuffer)
        .resize(this.config.dHashSize + 1, this.config.dHashSize, {
          fit: 'fill'
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Compute horizontal gradients
      const hashBits = new Array(this.config.dHashSize * this.config.dHashSize).fill(0);
      let bitIndex = 0;

      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width - 1; x++) {
          const currentPixel = data[y * info.width + x];
          const nextPixel = data[y * info.width + x + 1];
          hashBits[bitIndex++] = currentPixel < nextPixel ? 1 : 0;
        }
      }

      return this.bitsToHash(hashBits, 'dhash', this.config.dHashSize * this.config.dHashSize);
    } catch (error) {
      throw new Error(`dHash computation failed: ${error.message}`);
    }
  }

  /**
   * Compute Perceptual Hash (pHash)
   * Based on DCT (Discrete Cosine Transform) frequency analysis
   */
  private async computePHash(imageBuffer: Buffer): Promise<PerceptualHash> {
    try {
      // Resize to target size and convert to grayscale
      const { data, info } = await sharp(imageBuffer)
        .resize(this.config.pHashSize, this.config.pHashSize, {
          fit: 'fill'
        })
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Convert to float array for DCT
      const floatData = new Float64Array(data.length);
      for (let i = 0; i < data.length; i++) {
        floatData[i] = data[i];
      }

      // Apply 2D DCT
      const dctCoefficients = this.computeDCT2D(floatData, this.config.pHashSize, this.config.pHashSize);

      // Extract low-frequency components (top-left 8x8)
      const lowFreqSize = 8;
      const lowFreqCoefficients = new Array(lowFreqSize * lowFreqSize);
      
      for (let y = 0; y < lowFreqSize; y++) {
        for (let x = 0; x < lowFreqSize; x++) {
          lowFreqCoefficients[y * lowFreqSize + x] = dctCoefficients[y * this.config.pHashSize + x];
        }
      }

      // Calculate DCT mean (excluding DC component)
      const dcComponent = lowFreqCoefficients[0];
      let sum = 0;
      for (let i = 1; i < lowFreqCoefficients.length; i++) {
        sum += lowFreqCoefficients[i];
      }
      const mean = sum / (lowFreqCoefficients.length - 1);

      // Generate hash based on comparison to mean
      const hashBits = new Array(lowFreqSize * lowFreqSize).fill(0);
      for (let i = 0; i < lowFreqCoefficients.length; i++) {
        hashBits[i] = lowFreqCoefficients[i] > mean ? 1 : 0;
      }

      return this.bitsToHash(hashBits, 'phash', lowFreqSize * lowFreqSize);
    } catch (error) {
      throw new Error(`pHash computation failed: ${error.message}`);
    }
  }

  /**
   * Compare two hashes of the same type using Hamming distance
   */
  compareHashes<T extends AverageHash | DifferenceHash | PerceptualHash>(
    hash1: T,
    hash2: T
  ): number {
    if (hash1.type !== hash2.type) {
      throw new Error('Cannot compare hashes of different types');
    }

    if (hash1.binary.length !== hash2.binary.length) {
      throw new Error('Hashes must be the same length');
    }

    let distance = 0;
    for (let i = 0; i < hash1.binary.length; i++) {
      const byte1 = hash1.binary[i];
      const byte2 = hash2.binary[i];
      
      // Count differing bits using XOR
      const xor = byte1 ^ byte2;
      distance += this.countSetBits(xor);
    }

    return distance;
  }

  /**
   * Ensemble voting to determine similarity
   * Combines multiple hash algorithms for robust decision
   */
  ensembleSimilarity(
    hashes1: EnsembleHashes,
    hashes2: EnsembleHashes,
    weights: { ahash?: number; dhash?: number; phash?: number } = {}
  ): number {
    const defaultWeights = { ahash: 0.33, dhash: 0.33, phash: 0.34 };
    const finalWeights = { ...defaultWeights, ...weights };

    const similarities: number[] = [];

    if (hashes1.ahash && hashes2.ahash) {
      const distance = this.compareHashes(hashes1.ahash, hashes2.ahash);
      const similarity = 1 - (distance / (hashes1.ahash.size * 8));
      similarities.push(similarity * finalWeights.ahash!);
    }

    if (hashes1.dhash && hashes2.dhash) {
      const distance = this.compareHashes(hashes1.dhash, hashes2.dhash);
      const similarity = 1 - (distance / (hashes1.dhash.size * 8));
      similarities.push(similarity * finalWeights.dhash!);
    }

    if (hashes1.phash && hashes2.phash) {
      const distance = this.compareHashes(hashes1.phash, hashes2.phash);
      const similarity = 1 - (distance / (hashes1.phash.size * 8));
      similarities.push(similarity * finalWeights.phash!);
    }

    if (similarities.length === 0) {
      throw new Error('No common hashes found for comparison');
    }

    // Return weighted average similarity
    return similarities.reduce((sum, sim) => sum + sim, 0);
  }

  /**
   * Determine if images are similar using ensemble voting
   */
  isSimilar(
    hashes1: EnsembleHashes,
    hashes2: EnsembleHashes,
    threshold: number = 0.85,
    consensusThreshold: number = 0.5
  ): boolean {
    const similarities: boolean[] = [];

    if (hashes1.ahash && hashes2.ahash) {
      const distance = this.compareHashes(hashes1.ahash, hashes2.ahash);
      const similarity = 1 - (distance / (hashes1.ahash.size * 8));
      similarities.push(similarity >= threshold);
    }

    if (hashes1.dhash && hashes2.dhash) {
      const distance = this.compareHashes(hashes1.dhash, hashes2.dhash);
      const similarity = 1 - (distance / (hashes1.dhash.size * 8));
      similarities.push(similarity >= threshold);
    }

    if (hashes1.phash && hashes2.phash) {
      const distance = this.compareHashes(hashes1.phash, hashes2.phash);
      const similarity = 1 - (distance / (hashes1.phash.size * 8));
      similarities.push(similarity >= threshold);
    }

    if (similarities.length === 0) {
      return false;
    }

    // Require consensus threshold proportion of algorithms to agree
    const positiveVotes = similarities.filter(Boolean).length;
    return (positiveVotes / similarities.length) >= consensusThreshold;
  }

  /**
   * Preprocess image for hash computation
   */
  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    return await sharp(imageBuffer)
      .resize(this.config.targetImageSize, this.config.targetImageSize, {
        fit: 'cover',
        position: 'center'
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .removeAlpha()
      .toColorspace('srgb')
      .png()
      .toBuffer();
  }

  /**
   * Convert bit array to hash object
   */
  private bitsToHash(
    bits: number[],
    type: 'ahash' | 'dhash' | 'phash',
    size: number
  ): AverageHash | DifferenceHash | PerceptualHash {
    // Pack bits into bytes
    const byteCount = Math.ceil(size / 8);
    const binary = Buffer.alloc(byteCount);
    
    for (let i = 0; i < bits.length; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      
      if (bits[i] === 1) {
        binary[byteIndex] |= (1 << bitIndex);
      }
    }

    // Convert to hex string
    const hex = binary.toString('hex').padStart(byteCount * 2, '0');

    const baseHash = {
      binary,
      hex,
      size
    };

    switch (type) {
      case 'ahash':
        return { ...baseHash, type: 'ahash' };
      case 'dhash':
        return { ...baseHash, type: 'dhash' };
      case 'phash':
        return { ...baseHash, type: 'phash' };
    }
  }

  /**
   * Compute 2D Discrete Cosine Transform
   * Simplified implementation for pHash
   */
  private computeDCT2D(data: Float64Array, width: number, height: number): Float64Array {
    const size = width * height;
    const result = new Float64Array(size);
    const sqrtN = Math.sqrt(size);

    for (let u = 0; u < height; u++) {
      for (let v = 0; v < width; v++) {
        let sum = 0;
        
        for (let x = 0; x < height; x++) {
          for (let y = 0; y < width; y++) {
            const pixel = data[x * width + y];
            const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
            const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
            
            sum += pixel * cu * cv * 
              Math.cos(((2 * x + 1) * u * Math.PI) / (2 * height)) *
              Math.cos(((2 * y + 1) * v * Math.PI) / (2 * width));
          }
        }
        
        result[u * width + v] = (2 / sqrtN) * sum;
      }
    }

    return result;
  }

  /**
   * Count set bits in a byte (Brian Kernighan's algorithm)
   */
  private countSetBits(byte: number): number {
    let count = 0;
    while (byte) {
      byte &= byte - 1;
      count++;
    }
    return count;
  }

  /**
   * Validate hash format
   */
  validateHash<T extends AverageHash | DifferenceHash | PerceptualHash>(hash: T): boolean {
    return (
      hash &&
      typeof hash.type === 'string' &&
      ['ahash', 'dhash', 'phash'].includes(hash.type) &&
      Buffer.isBuffer(hash.binary) &&
      typeof hash.hex === 'string' &&
      typeof hash.size === 'number' &&
      hash.size > 0
    );
  }

  /**
   * Get hash statistics for monitoring
   */
  getEnsembleStatistics(hashes: EnsembleHashes[]): {
    totalHashes: number;
    aHashCount: number;
    dHashCount: number;
    pHashCount: number;
    avgHashSize: number;
  } {
    const stats = {
      totalHashes: hashes.length,
      aHashCount: 0,
      dHashCount: 0,
      pHashCount: 0,
      avgHashSize: 0
    };

    let totalSize = 0;
    hashes.forEach(hash => {
      if (hash.ahash) {
        stats.aHashCount++;
        totalSize += hash.ahash.size;
      }
      if (hash.dhash) {
        stats.dHashCount++;
        totalSize += hash.dhash.size;
      }
      if (hash.phash) {
        stats.pHashCount++;
        totalSize += hash.phash.size;
      }
    });

    const totalHashCount = stats.aHashCount + stats.dHashCount + stats.pHashCount;
    stats.avgHashSize = totalHashCount > 0 ? totalSize / totalHashCount : 0;

    return stats;
  }
}
```

## Ensemble Strategy Implementation

### Adaptive Weighting
```typescript
export class AdaptiveEnsembleEngine extends EnsembleHashEngine {
  private algorithmPerformance: Map<string, number> = new Map();

  constructor(config: Partial<EnsembleConfig> = {}) {
    super(config);
    this.initializePerformanceMetrics();
  }

  private initializePerformanceMetrics(): void {
    // Initialize with equal weights, will be updated based on performance
    this.algorithmPerformance.set('ahash', 0.33);
    this.algorithmPerformance.set('dhash', 0.33);
    this.algorithmPerformance.set('phash', 0.34);
  }

  /**
   * Update algorithm weights based on feedback
   */
  updateWeights(feedback: {
    algorithm: string;
    accuracy: number;
    falsePositiveRate: number;
  }): void {
    const currentWeight = this.algorithmPerformance.get(feedback.algorithm) || 0;
    const performanceScore = feedback.accuracy * (1 - feedback.falsePositiveRate);
    
    // Exponential moving average for weight updates
    const alpha = 0.1;
    const newWeight = alpha * performanceScore + (1 - alpha) * currentWeight;
    
    this.algorithmPerformance.set(feedback.algorithm, newWeight);
    this.normalizeWeights();
  }

  private normalizeWeights(): void {
    const total = Array.from(this.algorithmPerformance.values())
      .reduce((sum, weight) => sum + weight, 0);
    
    if (total > 0) {
      for (const [algorithm, weight] of this.algorithmPerformance.entries()) {
        this.algorithmPerformance.set(algorithm, weight / total);
      }
    }
  }

  /**
   * Get adaptive weights for ensemble voting
   */
  getAdaptiveWeights(): { ahash?: number; dhash?: number; phash?: number } {
    return {
      ahash: this.algorithmPerformance.get('ahash'),
      dhash: this.algorithmPerformance.get('dhash'),
      phash: this.algorithmPerformance.get('phash')
    };
  }

  /**
   * Ensemble similarity with adaptive weights
   */
  adaptiveEnsembleSimilarity(
    hashes1: EnsembleHashes,
    hashes2: EnsembleHashes
  ): number {
    const adaptiveWeights = this.getAdaptiveWeights();
    return this.ensembleSimilarity(hashes1, hashes2, adaptiveWeights);
  }
}
```

### Ensemble Evaluation Metrics
```typescript
export class EnsembleMetrics {
  /**
   * Calculate ensemble precision and recall
   */
  calculateEnsembleMetrics(
    predictions: Array<{ similar: boolean; confidence: number }>,
    groundTruth: boolean[]
  ): {
    precision: number;
    recall: number;
    f1Score: number;
    accuracy: number;
  } {
    if (predictions.length !== groundTruth.length) {
      throw new Error('Predictions and ground truth must have same length');
    }

    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    predictions.forEach((pred, i) => {
      if (pred.similar && groundTruth[i]) {
        truePositives++;
      } else if (pred.similar && !groundTruth[i]) {
        falsePositives++;
      } else if (!pred.similar && !groundTruth[i]) {
        trueNegatives++;
      } else {
        falseNegatives++;
      }
    });

    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const accuracy = (truePositives + trueNegatives) / predictions.length;
    const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

    return { precision, recall, f1Score, accuracy };
  }

  /**
   * Compare individual algorithm performance
   */
  compareAlgorithmPerformance(
    ensembleHashes: EnsembleHashes[],
    groundTruth: boolean[][]
  ): {
    ahash: { precision: number; recall: number; f1Score: number };
    dhash: { precision: number; recall: number; f1Score: number };
    phash: { precision: number; recall: number; f1Score: number };
    ensemble: { precision: number; recall: number; f1Score: number };
  } {
    const engine = new EnsembleHashEngine();
    const results: any = {};

    // Calculate metrics for each algorithm
    ['ahash', 'dhash', 'phash'].forEach(algorithm => {
      const predictions = ensembleHashes.map((hash1, i) => {
        const hash2 = ensembleHashes[(i + 1) % ensembleHashes.length];
        const hash1Key = algorithm as keyof EnsembleHashes;
        const hash2Key = algorithm as keyof EnsembleHashes;
        
        if (hash1[hash1Key] && hash2[hash2Key]) {
          const distance = engine.compareHashes(
            hash1[hash1Key] as any,
            hash2[hash2Key] as any
          );
          const similarity = 1 - (distance / 64);
          return { similar: similarity >= 0.85, confidence: similarity };
        }
        return { similar: false, confidence: 0 };
      });

      results[algorithm] = this.calculateEnsembleMetrics(predictions, groundTruth[0]);
    });

    // Calculate ensemble metrics
    const ensemblePredictions = ensembleHashes.map((hash1, i) => {
      const hash2 = ensembleHashes[(i + 1) % ensembleHashes.length];
      const similarity = engine.ensembleSimilarity(hash1, hash2);
      return { similar: similarity >= 0.85, confidence: similarity };
    });

    results.ensemble = this.calculateEnsembleMetrics(ensemblePredictions, groundTruth[0]);

    return results;
  }
}
```

## Integration with Collision Detection

### Ensemble-Aware Collision Detector
```typescript
export class EnsembleCollisionDetector {
  private ensembleEngine: EnsembleHashEngine;
  private adaptiveEngine: AdaptiveEnsembleEngine;

  constructor(config: Partial<EnsembleConfig> = {}) {
    this.ensembleEngine = new EnsembleHashEngine(config);
    this.adaptiveEngine = new AdaptiveEnsembleEngine(config);
  }

  /**
   * Detect collisions using ensemble hashing
   */
  async detectCollisions(
    queryHashes: EnsembleHashes,
    candidateHashes: EnsembleHashes[],
    threshold: number = 0.85,
    useAdaptive: boolean = true
  ): Promise<Array<{
    candidate: EnsembleHashes;
    similarity: number;
    confidence: number;
    algorithmBreakdown: {
      ahash?: { similarity: number; voted: boolean };
      dhash?: { similarity: number; voted: boolean };
      phash?: { similarity: number; voted: boolean };
    };
  }>> {
    const collisions = [];

    for (const candidate of candidateHashes) {
      const algorithmBreakdown: any = {};
      const similarities: number[] = [];

      // Compare each algorithm
      if (queryHashes.ahash && candidate.ahash) {
        const distance = this.ensembleEngine.compareHashes(queryHashes.ahash, candidate.ahash);
        const similarity = 1 - (distance / 64);
        algorithmBreakdown.ahash = { similarity, voted: similarity >= threshold };
        similarities.push(similarity);
      }

      if (queryHashes.dhash && candidate.dhash) {
        const distance = this.ensembleEngine.compareHashes(queryHashes.dhash, candidate.dhash);
        const similarity = 1 - (distance / 64);
        algorithmBreakdown.dhash = { similarity, voted: similarity >= threshold };
        similarities.push(similarity);
      }

      if (queryHashes.phash && candidate.phash) {
        const distance = this.ensembleEngine.compareHashes(queryHashes.phash, candidate.phash);
        const similarity = 1 - (distance / 64);
        algorithmBreakdown.phash = { similarity, voted: similarity >= threshold };
        similarities.push(similarity);
      }

      // Calculate ensemble similarity
      const ensembleSimilarity = useAdaptive
        ? this.adaptiveEngine.adaptiveEnsembleSimilarity(queryHashes, candidate)
        : this.ensembleEngine.ensembleSimilarity(queryHashes, candidate);

      // Check if ensemble votes for collision
      const votedAlgorithms = Object.values(algorithmBreakdown).filter((alg: any) => alg.voted).length;
      const consensusThreshold = 0.5; // Require at least 50% agreement
      const hasConsensus = (votedAlgorithms / Object.keys(algorithmBreakdown).length) >= consensusThreshold;

      if (hasConsensus && ensembleSimilarity >= threshold) {
        collisions.push({
          candidate,
          similarity: ensembleSimilarity,
          confidence: Math.min(...similarities), // Conservative confidence
          algorithmBreakdown
        });
      }
    }

    // Sort by similarity (highest first)
    return collisions.sort((a, b) => b.similarity - a.similarity);
  }
}
```

## Testing Suite

### Unit Tests
```typescript
describe('EnsembleHashEngine', () => {
  let engine: EnsembleHashEngine;

  beforeEach(() => {
    engine = new EnsembleHashEngine();
  });

  test('should compute all ensemble hashes', async () => {
    const testImage = Buffer.from('fake-image-data');
    const result = await engine.computeEnsembleHashes(testImage);
    
    expect(result.ahash).toBeDefined();
    expect(result.dhash).toBeDefined();
    expect(result.phash).toBeDefined();
    expect(result.computed_at).toBeInstanceOf(Date);
  });

  test('should compare hashes correctly', () => {
    const hash1: AverageHash = {
      type: 'ahash',
      binary: Buffer.alloc(8, 0x00),
      hex: '0'.repeat(16),
      size: 64
    };
    const hash2: AverageHash = {
      type: 'ahash',
      binary: Buffer.alloc(8, 0xFF),
      hex: 'f'.repeat(16),
      size: 64
    };
    
    const distance = engine.compareHashes(hash1, hash2);
    expect(distance).toBe(64); // All bits differ
  });

  test('should ensemble vote correctly', () => {
    const hashes1: EnsembleHashes = {
      ahash: { type: 'ahash', binary: Buffer.alloc(8, 0x00), hex: '0'.repeat(16), size: 64 },
      dhash: { type: 'dhash', binary: Buffer.alloc(8, 0x00), hex: '0'.repeat(16), size: 64 },
      phash: { type: 'phash', binary: Buffer.alloc(8, 0x00), hex: '0'.repeat(16), size: 64 },
      computed_at: new Date()
    };
    
    const hashes2: EnsembleHashes = {
      ahash: { type: 'ahash', binary: Buffer.alloc(8, 0xFF), hex: 'f'.repeat(16), size: 64 },
      dhash: { type: 'dhash', binary: Buffer.alloc(8, 0x00), hex: '0'.repeat(16), size: 64 },
      phash: { type: 'phash', binary: Buffer.alloc(8, 0xFF), hex: 'f'.repeat(16), size: 64 },
      computed_at: new Date()
    };
    
    const isSimilar = engine.isSimilar(hashes1, hashes2, 0.5, 0.5);
    expect(isSimilar).toBe(true); // 2/3 algorithms vote for similarity
  });
});
```
