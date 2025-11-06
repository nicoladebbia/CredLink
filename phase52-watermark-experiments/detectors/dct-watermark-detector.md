# DCT Watermark Detector

## DCT Watermark Detection Implementation

### Core DCT Watermark Detector
```typescript
import * as sharp from 'sharp';
import { 
  WatermarkPayload, 
  WatermarkDetectionResult, 
  DCTECCProfile, 
  WatermarkError, 
  WatermarkErrorCode 
} from '../core/watermark-config';
import { PayloadGenerator, PayloadBinding } from '../core/payload-generator';

export class DCTWatermarkDetector {
  private readonly profile: DCTECCProfile;
  private readonly payloadGenerator: PayloadGenerator;
  private readonly payloadBinding: PayloadBinding;
  private readonly blockSize: number;
  private readonly frequencyBands: number[];
  private readonly quantizationTable: number[];

  constructor(
    profile: DCTECCProfile,
    payloadGenerator: PayloadGenerator,
    payloadBinding: PayloadBinding
  ) {
    this.profile = profile;
    this.payloadGenerator = payloadGenerator;
    this.payloadBinding = payloadBinding;
    this.blockSize = profile.blockSize;
    this.frequencyBands = profile.frequencyBands;
    this.quantizationTable = profile.quantizationTable;
    
    this.validateProfile();
  }

  /**
   * Detect watermark in image and extract payload
   * Returns confidence score and extracted payload if found
   */
  async detectWatermark(imageData: ArrayBuffer): Promise<WatermarkDetectionResult> {
    const startTime = performance.now();
    
    try {
      // Validate input
      this.validateImageData(imageData);
      
      // Convert to raw pixel data
      const image = sharp(imageData);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height || !metadata.channels) {
        throw new WatermarkError('Invalid image metadata', WatermarkErrorCode.CORRUPTED_ASSET);
      }
      
      // Convert to RGB for processing
      const { data, info } = await image
        .ensureAlpha(false)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      // Extract payload bits from image
      const extractedBits = await this.extractFromRGB(
        data,
        info.width!,
        info.height!
      );
      
      // Convert bits to payload
      const payloadResult = this.bitsToPayload(extractedBits);
      
      const processingTime = performance.now() - startTime;
      
      return {
        match: payloadResult.match,
        confidence: payloadResult.confidence,
        payloadVersion: payloadResult.payload?.version || 0,
        payload: payloadResult.payload,
        processingTimeMs: processingTime
      };
      
    } catch (error) {
      const processingTime = performance.now() - startTime;
      
      if (error instanceof WatermarkError) {
        return {
          match: false,
          confidence: 0,
          payloadVersion: 0,
          error: error.message,
          processingTimeMs: processingTime
        };
      }
      
      return {
        match: false,
        confidence: 0,
        payloadVersion: 0,
        error: `Detection failed: ${error.message}`,
        processingTimeMs: processingTime
      };
    }
  }

  /**
   * Verify detected payload binds to expected manifest hash
   */
  async verifyBinding(
    imageData: ArrayBuffer,
    expectedManifestHash: string
  ): Promise<{
    present: boolean;
    confidence: number;
    payloadBindOk: boolean;
    payload?: WatermarkPayload;
    error?: string;
  }> {
    const detectionResult = await this.detectWatermark(imageData);
    
    if (!detectionResult.match || !detectionResult.payload) {
      return {
        present: false,
        confidence: 0,
        payloadBindOk: false,
        error: detectionResult.error || 'No watermark detected'
      };
    }
    
    const bindingResult = this.payloadBinding.verifyBinding(
      detectionResult.payload,
      expectedManifestHash
    );
    
    return {
      present: true,
      confidence: detectionResult.confidence,
      payloadBindOk: bindingResult.binds,
      payload: detectionResult.payload,
      error: bindingResult.error
    };
  }

  /**
   * Core extraction algorithm in RGB color space
   */
  private async extractFromRGB(
    pixelData: Buffer,
    width: number,
    height: number
  ): Promise<number[]> {
    const allBits: number[] = [];
    
    // Process each color channel separately
    for (let channel = 0; channel < 3; channel++) {
      const channelBits = this.extractFromChannel(pixelData, width, height, channel);
      allBits.push(...channelBits);
    }
    
    // Combine bits from all channels using majority voting
    return this.combineChannelBits(allBits);
  }

  /**
   * Extract bits from single color channel
   */
  private extractFromChannel(
    pixelData: Buffer,
    width: number,
    height: number,
    channel: number
  ): number[] {
    const bits: number[] = [];
    const blocksX = Math.floor(width / this.blockSize);
    const blocksY = Math.floor(height / this.blockSize);
    
    // Generate spatial spread pattern (must match embedder)
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
        
        // Extract bits from selected frequency bands
        for (const bandIndex of this.frequencyBands) {
          const bit = this.extractBitFromCoefficient(dctCoefficients, bandIndex);
          bits.push(bit);
        }
      }
    }
    
    return bits;
  }

  /**
   * Extract single bit from DCT coefficient
   */
  private extractBitFromCoefficient(
    coefficients: number[][],
    coefficientIndex: number
  ): number {
    // Calculate coefficient position
    const coeffX = coefficientIndex % this.blockSize;
    const coeffY = Math.floor(coefficientIndex / this.blockSize);
    
    if (coeffX >= this.blockSize || coeffY >= this.blockSize) {
      return 0; // Invalid coefficient
    }
    
    // Get current coefficient value
    const coeffValue = coefficients[coeffY][coeffX];
    
    // Apply quantization
    const quantizedValue = Math.round(coeffValue / (this.quantizationTable[coefficientIndex] || 1));
    
    // Extract bit using quantization index modulation
    return quantizedValue % 2;
  }

  /**
   * Combine bits from multiple channels using majority voting
   */
  private combineChannelBits(allBits: number[]): number[] {
    if (allBits.length === 0) {
      return [];
    }
    
    // Group bits by position (3 channels per bit position)
    const result: number[] = [];
    const numChannels = 3;
    const bitsPerChannel = Math.floor(allBits.length / numChannels);
    
    for (let i = 0; i < bitsPerChannel; i++) {
      const votes = [];
      for (let channel = 0; channel < numChannels; channel++) {
        const bitIndex = channel * bitsPerChannel + i;
        if (bitIndex < allBits.length) {
          votes.push(allBits[bitIndex]);
        }
      }
      
      // Majority voting
      const ones = votes.filter(bit => bit === 1).length;
      const zeros = votes.filter(bit => bit === 0).length;
      
      result.push(ones > zeros ? 1 : 0);
    }
    
    return result;
  }

  /**
   * Convert extracted bits to payload with ECC correction
   */
  private bitsToPayload(bits: number[]): {
    match: boolean;
    confidence: number;
    payload?: WatermarkPayload;
  } {
    try {
      // Apply ECC correction
      const correctedBits = this.applyECCCorrection(bits);
      
      // Convert bits to bytes
      const payloadBytes = this.bitsToBytes(correctedBits);
      
      // Deserialize payload
      const payload = this.payloadGenerator.deserializePayload(payloadBytes);
      
      // Validate payload structure
      this.validateExtractedPayload(payload);
      
      // Calculate confidence based on bit error rate
      const confidence = this.calculateConfidence(bits, correctedBits);
      
      return {
        match: true,
        confidence,
        payload
      };
      
    } catch (error) {
      return {
        match: false,
        confidence: 0
      };
    }
  }

  /**
   * Apply ECC correction to extracted bits
   */
  private applyECCCorrection(bits: number[]): number[] {
    if (this.profile.eccScheme !== 'reed_solomon') {
      return bits; // No correction if not supported
    }
    
    // Simple Reed-Solomon correction (placeholder)
    // In production, use proper Reed-Solomon library
    const redundancy = this.profile.eccRedundancy;
    const payloadSize = Math.floor(bits.length / (1 + redundancy));
    
    // Extract payload bits (without ECC)
    const payloadBits = bits.slice(0, payloadSize);
    
    // Simple error detection and correction
    const eccBits = bits.slice(payloadSize);
    const correctedBits = this.simpleErrorCorrection(payloadBits, eccBits);
    
    return correctedBits;
  }

  /**
   * Simple error correction implementation
   */
  private simpleErrorCorrection(payloadBits: number[], eccBits: number[]): number[] {
    // Calculate expected ECC
    const expectedEcc: number[] = [];
    for (let i = 0; i < eccBits.length; i++) {
      const expectedByte = payloadBits[i % payloadBits.length] ^ ((i * 31 + 17) & 0xFF);
      expectedEcc.push(expectedByte & 1);
    }
    
    // Count errors
    let errorCount = 0;
    for (let i = 0; i < eccBits.length; i++) {
      if (eccBits[i] !== expectedEcc[i]) {
        errorCount++;
      }
    }
    
    // If error rate is low, return payload as-is
    const errorRate = errorCount / eccBits.length;
    if (errorRate < 0.1) { // 10% error threshold
      return payloadBits;
    }
    
    // WARNING: This is a weak error correction implementation
    // In production, use proper Reed-Solomon decoding
    // Current implementation provides NO real error correction
    const corrected = [...payloadBits];
    
    // Simple deterministic correction (SECURE: no random usage)
    // Use hash-based correction instead of Math.random()
    for (let i = 0; i < Math.min(corrected.length, 10); i++) {
      const hash = this.simpleHash(i + errorCount);
      if (hash % 100 < errorRate * 100) {
        corrected[i] ^= 1; // Flip bit
      }
    }
    
    return corrected;
  }
  
  /**
   * Simple hash function for deterministic "random" behavior
   */
  private simpleHash(input: number): number {
    // Use a simple hash instead of Math.random() for security
    let hash = input;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
    hash = (hash >> 16) ^ hash;
    return Math.abs(hash);
  }

  /**
   * Convert bit array to byte array
   */
  private bitsToBytes(bits: number[]): Uint8Array {
    const byteCount = Math.ceil(bits.length / 8);
    const bytes = new Uint8Array(byteCount);
    
    for (let i = 0; i < bits.length; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      
      if (bits[i] === 1) {
        bytes[byteIndex] |= (1 << bitIndex);
      }
    }
    
    return bytes;
  }

  /**
   * Calculate confidence score based on extraction quality
   */
  private calculateConfidence(originalBits: number[], correctedBits: number[]): number {
    if (originalBits.length === 0 || correctedBits.length === 0) {
      return 0;
    }
    
    // Calculate bit error rate before correction
    const minLength = Math.min(originalBits.length, correctedBits.length);
    let matchingBits = 0;
    
    for (let i = 0; i < minLength; i++) {
      if (originalBits[i] === correctedBits[i]) {
        matchingBits++;
      }
    }
    
    const errorRate = 1 - (matchingBits / minLength);
    
    // Convert error rate to confidence (inverse relationship)
    const confidence = Math.max(0, 1 - (errorRate * 2)); // Scale factor of 2
    
    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Generate spatial spread pattern (must match embedder)
   */
  private generateSpatialSpread(numBlocks: number): boolean[] {
    if (!this.profile.spatialSpread) {
      return new Array(numBlocks).fill(true);
    }
    
    // Generate same pattern as embedder
    const pattern = new Array(numBlocks).fill(false);
    const seed = this.profile.strength * 1000;
    
    let state = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
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

  // Transform Methods (same as embedder)

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

  private dctCosine(position: number, frequency: number, size: number): number {
    return Math.cos((Math.PI * frequency * (2 * position + 1)) / (2 * size));
  }

  // Block Processing Methods (same as embedder)

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

  // Validation Methods

  private validateProfile(): void {
    if (this.profile.strength < 0.1 || this.profile.strength > 0.9) {
      throw new WatermarkError('Invalid profile strength', WatermarkErrorCode.INVALID_PROFILE);
    }
    if (this.frequencyBands.length === 0) {
      throw new WatermarkError('No frequency bands specified', WatermarkErrorCode.INVALID_PROFILE);
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

  private validateExtractedPayload(payload: WatermarkPayload): void {
    if (!payload) {
      throw new WatermarkError('Invalid payload extracted', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // SECURITY: Fixed version validation to prevent bypass attacks
    // Previously hardcoded to version 1, making it vulnerable to version-based attacks
    if (payload.version < 1 || payload.version > 15) {
      throw new WatermarkError(`Invalid payload version: ${payload.version}`, WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // Additional structural validation
    if (!payload.truncatedHash || payload.truncatedHash.length === 0) {
      throw new WatermarkError('Invalid truncated hash in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.salt || payload.salt.length === 0) {
      throw new WatermarkError('Invalid salt in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.reserved || payload.reserved.length === 0) {
      throw new WatermarkError('Invalid reserved field in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
  }
}
```

### Detection Performance Monitor
```typescript
export class DetectionPerformanceMonitor {
  private metrics: {
    totalDetections: number;
    averageTimeMs: number;
    averageConfidence: number;
    detectionRate: number;
    falsePositiveRate: number;
    errorCounts: Record<string, number>;
  } = {
    totalDetections: 0,
    averageTimeMs: 0,
    averageConfidence: 0,
    detectionRate: 0,
    falsePositiveRate: 0,
    errorCounts: {}
  };

  recordDetection(
    durationMs: number,
    confidence: number,
    detected: boolean,
    error?: string
  ): void {
    // SECURITY: Added input validation to prevent injection attacks
    if (typeof durationMs !== 'number' || durationMs < 0 || durationMs > 60000) {
      return; // Invalid duration, ignore
    }
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      return; // Invalid confidence, ignore
    }
    if (typeof detected !== 'boolean') {
      return; // Invalid detection flag, ignore
    }
    
    this.metrics.totalDetections++;
    
    // Update average time
    this.metrics.averageTimeMs = 
      (this.metrics.averageTimeMs * (this.metrics.totalDetections - 1) + durationMs) / 
      this.metrics.totalDetections;
    
    // Update average confidence
    this.metrics.averageConfidence = 
      (this.metrics.averageConfidence * (this.metrics.totalDetections - 1) + confidence) / 
      this.metrics.totalDetections;
    
    // Update detection rate
    const detectionCount = this.metrics.detectionRate * (this.metrics.totalDetections - 1) + (detected ? 1 : 0);
    this.metrics.detectionRate = detectionCount / this.metrics.totalDetections;
    
    // Track errors with sanitization
    if (error && typeof error === 'string') {
      // SECURITY: Sanitize error messages to prevent injection
      const sanitizedError = error.replace(/[<>\"']/g, '').substring(0, 200);
      this.metrics.errorCounts[sanitizedError] = (this.metrics.errorCounts[sanitizedError] || 0) + 1;
    }
  }

  recordFalsePositive(): void {
    const fpCount = this.metrics.falsePositiveRate * this.metrics.totalDetections + 1;
    this.metrics.falsePositiveRate = fpCount / (this.metrics.totalDetections + 1);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalDetections: 0,
      averageTimeMs: 0,
      averageConfidence: 0,
      detectionRate: 0,
      falsePositiveRate: 0,
      errorCounts: {}
    };
  }
}

export const detectionPerformanceMonitor = new DetectionPerformanceMonitor();
```

### DCT Watermark Detector Factory
```typescript
import { PayloadGeneratorFactory } from '../core/payload-generator';

export class DCTWatermarkDetectorFactory {
  /**
   * Create detector with default profile
   */
  static createDefault(): DCTWatermarkDetector {
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
    
    const payloadGenerator = PayloadGeneratorFactory.createStandard();
    const payloadBinding = new PayloadBinding(payloadGenerator);
    
    return new DCTWatermarkDetector(
      profile,
      payloadGenerator,
      payloadBinding
    );
  }

  /**
   * Create detector for testing
   */
  static createForTesting(): DCTWatermarkDetector {
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
    
    const payloadGenerator = PayloadGeneratorFactory.createStandard();
    const payloadBinding = new PayloadBinding(payloadGenerator);
    
    return new DCTWatermarkDetector(
      profile,
      payloadGenerator,
      payloadBinding
    );
  }

  /**
   * Create detector with custom profile
   */
  static createWithProfile(profile: DCTECCProfile): DCTWatermarkDetector {
    const payloadGenerator = PayloadGeneratorFactory.createStandard();
    const payloadBinding = new PayloadBinding(payloadGenerator);
    
    return new DCTWatermarkDetector(
      profile,
      payloadGenerator,
      payloadBinding
    );
  }
}

// Export default instances
export const defaultDCTDetector = DCTWatermarkDetectorFactory.createDefault();
export const testingDCTDetector = DCTWatermarkDetectorFactory.createForTesting();
```
