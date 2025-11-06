# DCT-Based Watermark Embedder (Classical/Invisible)

## DCT Watermark Implementation

### Core DCT Watermark Embedder
```typescript
import * as sharp from 'sharp';
import { WatermarkPayload, DCTECCProfile, WatermarkError, WatermarkErrorCode } from '../core/watermark-config';

export class DCTWatermarkEmbedder {
  private readonly profile: DCTECCProfile;
  private readonly blockSize: number;
  private readonly frequencyBands: number[];
  private readonly quantizationTable: number[];

  constructor(profile: DCTECCProfile) {
    this.profile = profile;
    this.blockSize = profile.blockSize;
    this.frequencyBands = profile.frequencyBands;
    this.quantizationTable = profile.quantizationTable;
    
    this.validateProfile();
  }

  /**
   * Embed watermark payload into image using DCT coefficients
   * Follows exact specification: DCT + ECC + spatial spread
   */
  async embedWatermark(
    imageData: ArrayBuffer,
    payload: WatermarkPayload
  ): Promise<ArrayBuffer> {
    const startTime = performance.now();
    
    try {
      // Validate inputs
      this.validateImageData(imageData);
      this.validatePayload(payload);
      
      // Convert to raw pixel data
      const image = sharp(imageData);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height || !metadata.channels) {
        throw new WatermarkError('Invalid image metadata', WatermarkErrorCode.CORRUPTED_ASSET);
      }
      
      // Ensure image is RGB/A
      const { data, info } = await image
        .ensureAlpha(false)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Embed watermark
      const watermarkedData = await this.embedInRGB(
        data,
        info.width!,
        info.height!,
        payload
      );
      
      // Convert back to original format
      const result = await sharp(watermarkedData, {
        raw: {
          width: info.width!,
          height: info.height!,
          channels: 3
        }
      })
      .toFormat(metadata.format as any, {
        quality: metadata.quality || 90
      })
      .toBuffer();
      
      const processingTime = performance.now() - startTime;
      console.log(`DCT watermark embedded in ${processingTime.toFixed(2)}ms`);
      
      return result.buffer;
      
    } catch (error) {
      if (error instanceof WatermarkError) {
        throw error;
      }
      throw new WatermarkError(
        `DCT embedding failed: ${error.message}`,
        WatermarkErrorCode.PROCESSING_ERROR
      );
    }
  }

  /**
   * Core embedding algorithm in RGB color space
   */
  private async embedInRGB(
    pixelData: Buffer,
    width: number,
    height: number,
    payload: WatermarkPayload
  ): Promise<Buffer> {
    // Apply ECC to payload
    const encodedPayload = this.applyECC(payload);
    
    // Convert payload to bitstream
    const payloadBits = this.payloadToBits(encodedPayload);
    
    // Calculate embedding capacity
    const numBlocks = Math.floor(width / this.blockSize) * Math.floor(height / this.blockSize);
    const bitsPerBlock = this.frequencyBands.length * 3; // 3 color channels
    const totalCapacity = numBlocks * bitsPerBlock;
    
    if (payloadBits.length > totalCapacity) {
      throw new WatermarkError(
        `Payload too large: ${payloadBits.length} bits > ${totalCapacity} capacity`,
        WatermarkErrorCode.PAYLOAD_TOO_LARGE
      );
    }
    
    // Embed in frequency domain
    const result = Buffer.from(pixelData);
    
    // Process each color channel separately
    for (let channel = 0; channel < 3; channel++) {
      this.embedInChannel(result, width, height, channel, payloadBits);
    }
    
    return result;
  }

  /**
   * Embed in single color channel using DCT
   */
  private embedInChannel(
    pixelData: Buffer,
    width: number,
    height: number,
    channel: number,
    payloadBits: number[]
  ): void {
    let bitIndex = 0;
    const blocksX = Math.floor(width / this.blockSize);
    const blocksY = Math.floor(height / this.blockSize);
    
    // Create spatial spread pattern
    const spreadPattern = this.generateSpatialSpread(blocksX * blocksY);
    
    for (let blockY = 0; blockY < blocksY; blockY++) {
      for (let blockX = 0; blockX < blocksX; blockX++) {
        const blockIndex = blockY * blocksX + blockX;
        
        // Skip blocks based on spatial spread pattern
        if (!spreadPattern[blockIndex]) {
          continue;
        }
        
        // Extract block pixels
        const block = this.extractBlock(pixelData, width, height, blockX, blockY, channel);
        
        // Apply DCT
        const dctCoefficients = this.applyDCT(block);
        
        // Embed payload bits in selected frequency bands
        for (const bandIndex of this.frequencyBands) {
          if (bitIndex >= payloadBits.length) {
            break;
          }
          
          this.embedBitInCoefficient(dctCoefficients, bandIndex, payloadBits[bitIndex]);
          bitIndex++;
        }
        
        // Apply inverse DCT
        const watermarkedBlock = this.applyInverseDCT(dctCoefficients);
        
        // Write block back to image
        this.writeBlock(pixelData, width, height, blockX, blockY, channel, watermarkedBlock);
      }
    }
  }

  /**
   * Embed single bit into DCT coefficient
   */
  private embedBitInCoefficient(
    coefficients: number[][],
    coefficientIndex: number,
    bit: number
  ): void {
    // Calculate coefficient position
    const coeffX = coefficientIndex % this.blockSize;
    const coeffY = Math.floor(coefficientIndex / this.blockSize);
    
    if (coeffX >= this.blockSize || coeffY >= this.blockSize) {
      return; // Skip invalid coefficient
    }
    
    // Get current coefficient value
    let coeffValue = coefficients[coeffY][coeffX];
    
    // Apply quantization
    const quantizedValue = Math.round(coeffValue / this.quantizationTable[coefficientIndex] || 1);
    
    // Embed bit using quantization index modulation
    const strength = this.profile.strength;
    
    if (bit === 1) {
      // Force coefficient to odd quantized value
      if (quantizedValue % 2 === 0) {
        coeffValue += strength * this.quantizationTable[coefficientIndex];
      }
    } else {
      // Force coefficient to even quantized value
      if (quantizedValue % 2 === 1) {
        coeffValue += strength * this.quantizationTable[coefficientIndex];
      }
    }
    
    coefficients[coeffY][coeffX] = coeffValue;
  }

  /**
   * Apply Error Correction Coding to payload
   */
  private applyECC(payload: WatermarkPayload): Uint8Array {
    if (this.profile.eccScheme !== 'reed_solomon') {
      throw new WatermarkError('Unsupported ECC scheme', WatermarkErrorCode.INVALID_PROFILE);
    }
    
    // Simple Reed-Solomon implementation (placeholder)
    // In production, use proper Reed-Solomon library
    const payloadBytes = this.serializePayload(payload);
    const redundancy = this.profile.eccRedundancy;
    const eccBytes = new Uint8Array(payloadBytes.length * redundancy);
    
    // Generate parity bytes (simplified)
    for (let i = 0; i < eccBytes.length; i++) {
      eccBytes[i] = payloadBytes[i % payloadBytes.length] ^ (i * 31 + 17) & 0xFF;
    }
    
    // Combine payload and ECC
    const result = new Uint8Array(payloadBytes.length + eccBytes.length);
    result.set(payloadBytes);
    result.set(eccBytes, payloadBytes.length);
    
    return result;
  }

  /**
   * Convert payload bytes to bit array
   */
  private payloadToBits(payload: Uint8Array): number[] {
    const bits: number[] = [];
    
    for (const byte of payload) {
      for (let i = 7; i >= 0; i--) {
        bits.push((byte >> i) & 1);
      }
    }
    
    return bits;
  }

  /**
   * Generate spatial spread pattern
   */
  private generateSpatialSpread(numBlocks: number): boolean[] {
    if (!this.profile.spatialSpread) {
      return new Array(numBlocks).fill(true);
    }
    
    // Generate pseudo-random spread pattern
    const pattern = new Array(numBlocks).fill(false);
    const seed = this.profile.strength * 1000;
    
    // Use LCG for reproducible pattern
    let state = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
    
    // Select ~50% of blocks
    const targetBlocks = Math.floor(numBlocks * 0.5);
    let selectedBlocks = 0;
    
    for (let i = 0; i < numBlocks && selectedBlocks < targetBlocks; i++) {
      state = (state * 1103515245 + 12345) & 0x7FFFFFFF;
      
      if (state % 2 === 0) {
        pattern[i] = true;
        selectedBlocks++;
      }
    }
    
    return pattern;
  }

  // DCT Transform Methods

  private applyDCT(block: number[][]): number[][] {
    const size = this.blockSize;
    const result = Array(size).fill(0).map(() => Array(size).fill(0));
    
    for (let v = 0; v < size; v++) {
      for (let u = 0; u < size; u++) {
        let sum = 0;
        
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            sum += block[y][x] * 
                   this.dctCosine(x, u, size) * 
                   this.dctCosine(y, v, size);
          }
        }
        
        sum *= (2 / size);
        
        if (u === 0) sum *= Math.sqrt(1 / 2);
        if (v === 0) sum *= Math.sqrt(1 / 2);
        
        result[v][u] = sum;
      }
    }
    
    return result;
  }

  private applyInverseDCT(coefficients: number[][]): number[][] {
    const size = this.blockSize;
    const result = Array(size).fill(0).map(() => Array(size).fill(0));
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        
        for (let v = 0; v < size; v++) {
          for (let u = 0; u < size; u++) {
            let coeff = coefficients[v][u];
            
            if (u === 0) coeff *= Math.sqrt(1 / 2);
            if (v === 0) coeff *= Math.sqrt(1 / 2);
            
            sum += coeff * 
                   this.dctCosine(x, u, size) * 
                   this.dctCosine(y, v, size);
          }
        }
        
        sum *= (2 / size);
        result[y][x] = Math.round(Math.max(0, Math.min(255, sum)));
      }
    }
    
    return result;
  }

  private dctCosine(position: number, frequency: number, size: number): number {
    return Math.cos((Math.PI * frequency * (2 * position + 1)) / (2 * size));
  }

  // Block Processing Methods

  private extractBlock(
    pixelData: Buffer,
    width: number,
    height: number,
    blockX: number,
    blockY: number,
    channel: number
  ): number[][] {
    const block = Array(this.blockSize).fill(0).map(() => Array(this.blockSize).fill(0));
    
    for (let y = 0; y < this.blockSize; y++) {
      for (let x = 0; x < this.blockSize; x++) {
        const pixelX = blockX * this.blockSize + x;
        const pixelY = blockY * this.blockSize + y;
        
        if (pixelX < width && pixelY < height) {
          const pixelIndex = (pixelY * width + pixelX) * 3 + channel;
          block[y][x] = pixelData[pixelIndex];
        }
      }
    }
    
    return block;
  }

  private writeBlock(
    pixelData: Buffer,
    width: number,
    height: number,
    blockX: number,
    blockY: number,
    channel: number,
    block: number[][]
  ): void {
    for (let y = 0; y < this.blockSize; y++) {
      for (let x = 0; x < this.blockSize; x++) {
        const pixelX = blockX * this.blockSize + x;
        const pixelY = blockY * this.blockSize + y;
        
        if (pixelX < width && pixelY < height) {
          const pixelIndex = (pixelY * width + pixelX) * 3 + channel;
          pixelData[pixelIndex] = Math.max(0, Math.min(255, Math.round(block[y][x])));
        }
      }
    }
  }

  // Validation Methods

  private validateProfile(): void {
    if (this.profile.strength < 0.1 || this.profile.strength > 0.9) {
      throw new WatermarkError('Strength must be 0.1-0.9', WatermarkErrorCode.INVALID_STRENGTH);
    }
    if (this.blockSize < 4 || this.blockSize > 16) {
      throw new WatermarkError('Block size must be 4-16', WatermarkErrorCode.INVALID_PROFILE);
    }
    if (this.frequencyBands.length === 0) {
      throw new WatermarkError('At least one frequency band required', WatermarkErrorCode.INVALID_PROFILE);
    }
  }

  private validateImageData(imageData: ArrayBuffer): void {
    if (!imageData || imageData.byteLength === 0) {
      throw new WatermarkError('Invalid image data', WatermarkErrorCode.CORRUPTED_ASSET);
    }
    if (imageData.byteLength > 50 * 1024 * 1024) { // 50MB limit
      throw new WatermarkError('Image too large', WatermarkErrorCode.CORRUPTED_ASSET);
    }
  }

  private validatePayload(payload: WatermarkPayload): void {
    if (!payload) {
      throw new WatermarkError('Invalid payload', WatermarkErrorCode.PAYLOAD_TOO_LARGE);
    }
  }

  private serializePayload(payload: WatermarkPayload): Uint8Array {
    // Simple serialization - in production use proper format
    const result = new Uint8Array(
      payload.truncatedHash.length + 
      payload.salt.length + 
      payload.reserved.length + 
      1 // version byte
    );
    
    let offset = 0;
    result[offset++] = payload.version;
    result.set(payload.truncatedHash, offset);
    offset += payload.truncatedHash.length;
    result.set(payload.salt, offset);
    offset += payload.salt.length;
    result.set(payload.reserved, offset);
    
    return result;
  }
}
```

### DCT Watermark Factory
```typescript
export class DCTWatermarkFactory {
  /**
   * Create DCT embedder with default profile
   */
  static createDefault(): DCTWatermarkEmbedder {
    const profile: DCTECCProfile = {
      type: 'dct_ecc',
      strength: 0.3,
      blockSize: 8,
      quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
      eccScheme: 'reed_solomon',
      eccRedundancy: 2,
      frequencyBands: [1, 2, 3, 4, 5, 6],
      spatialSpread: true
    };
    
    return new DCTWatermarkEmbedder(profile);
  }

  /**
   * Create DCT embedder for testing (lighter embedding)
   */
  static createForTesting(): DCTWatermarkEmbedder {
    const profile: DCTECCProfile = {
      type: 'dct_ecc',
      strength: 0.2,
      blockSize: 8,
      quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
      eccScheme: 'reed_solomon',
      eccRedundancy: 1,
      frequencyBands: [1, 2, 3],
      spatialSpread: true
    };
    
    return new DCTWatermarkEmbedder(profile);
  }

  /**
   * Create DCT embedder with custom strength
   */
  static createWithStrength(strength: number): DCTWatermarkEmbedder {
    const profile: DCTECCProfile = {
      type: 'dct_ecc',
      strength,
      blockSize: 8,
      quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
      eccScheme: 'reed_solomon',
      eccRedundancy: 2,
      frequencyBands: [1, 2, 3, 4, 5, 6],
      spatialSpread: true
    };
    
    return new DCTWatermarkEmbedder(profile);
  }
}

// Export default instances
export const defaultDCTEmbedder = DCTWatermarkFactory.createDefault();
export const testingDCTEmbedder = DCTWatermarkFactory.createForTesting();
```

### Embedding Performance Monitor
```typescript
export class EmbeddingPerformanceMonitor {
  private metrics: {
    totalEmbeddings: number;
    averageTimeMs: number;
    successRate: number;
    errorCounts: Record<string, number>;
  } = {
    totalEmbeddings: 0,
    averageTimeMs: 0,
    successRate: 0,
    errorCounts: {}
  };

  recordEmbedding(durationMs: number, success: boolean, error?: string): void {
    this.metrics.totalEmbeddings++;
    
    // Update average time
    this.metrics.averageTimeMs = 
      (this.metrics.averageTimeMs * (this.metrics.totalEmbeddings - 1) + durationMs) / 
      this.metrics.totalEmbeddings;
    
    // Update success rate
    const successCount = this.metrics.successRate * (this.metrics.totalEmbeddings - 1) + (success ? 1 : 0);
    this.metrics.successRate = successCount / this.metrics.totalEmbeddings;
    
    // Track errors
    if (!success && error) {
      this.metrics.errorCounts[error] = (this.metrics.errorCounts[error] || 0) + 1;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalEmbeddings: 0,
      averageTimeMs: 0,
      successRate: 0,
      errorCounts: {}
    };
  }
}

export const embeddingPerformanceMonitor = new EmbeddingPerformanceMonitor();
```
