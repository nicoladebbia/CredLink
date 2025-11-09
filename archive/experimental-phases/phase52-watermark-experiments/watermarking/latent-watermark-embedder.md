# Latent Diffusion Watermark Embedder (Research-Only)

## Latent Space Watermark Implementation

### Core Latent Watermark Embedder
```typescript
import { WatermarkPayload, LatentProfile, WatermarkError, WatermarkErrorCode } from '../core/watermark-config';

export class LatentWatermarkEmbedder {
  private readonly profile: LatentProfile;
  private readonly keyBits: number;
  private readonly targetLayers: number[];

  constructor(profile: LatentProfile) {
    this.profile = profile;
    this.keyBits = profile.keyBits;
    this.targetLayers = profile.layers;
    
    this.validateProfile();
  }

  /**
   * Embed watermark payload into latent space of diffusion model
   * RESEARCH-ONLY: Not for production use
   */
  async embedInLatentSpace(
    latentTensor: Float32Array,
    payload: WatermarkPayload,
    modelInfo: {
      modelType: string;
      latentDimensions: [number, number, number, number]; // [batch, height, width, channels]
      layerNames: string[];
    }
  ): Promise<Float32Array> {
    const startTime = performance.now();
    
    try {
      // Validate inputs
      this.validateLatentTensor(latentTensor);
      this.validatePayload(payload);
      this.validateModelCompatibility(modelInfo);
      
      // Generate watermark key from payload
      const watermarkKey = this.generateWatermarkKey(payload);
      
      // Apply perturbations to target layers
      const watermarkedLatent = await this.applyLatentPerturbations(
        latentTensor,
        watermarkKey,
        modelInfo
      );
      
      const processingTime = performance.now() - startTime;
      console.log(`Latent watermark embedded in ${processingTime.toFixed(2)}ms`);
      
      return watermarkedLatent;
      
    } catch (error) {
      if (error instanceof WatermarkError) {
        throw error;
      }
      throw new WatermarkError(
        `Latent embedding failed: ${error.message}`,
        WatermarkErrorCode.PROCESSING_ERROR
      );
    }
  }

  /**
   * Generate watermark key from payload
   */
  private generateWatermarkKey(payload: WatermarkPayload): Float32Array {
    // Serialize payload to bytes
    const payloadBytes = this.serializePayload(payload);
    
    // Generate cryptographic key from payload
    const keyHash = this.hashPayload(payloadBytes);
    
    // Convert hash to float32 array for latent space
    const key = new Float32Array(this.keyBits / 32); // 32 bits per float
    
    for (let i = 0; i < key.length; i++) {
      // Extract 32 bits from hash
      const hashStart = i * 4;
      const hashChunk = keyHash.slice(hashStart, hashStart + 4);
      
      // Convert to normalized float (-1 to 1)
      const intValue = new DataView(hashChunk.buffer).getUint32(0, false); // big-endian
      key[i] = (intValue / 0xFFFFFFFF) * 2 - 1;
    }
    
    return key;
  }

  /**
   * Apply perturbations to latent space
   */
  private async applyLatentPerturbations(
    latentTensor: Float32Array,
    watermarkKey: Float32Array,
    modelInfo: {
      latentDimensions: [number, number, number, number];
      layerNames: string[];
    }
  ): Promise<Float32Array> {
    const [batch, height, width, channels] = modelInfo.latentDimensions;
    const totalElements = batch * height * width * channels;
    
    if (latentTensor.length !== totalElements) {
      throw new WatermarkError(
        'Latent tensor dimensions mismatch',
        WatermarkErrorCode.CORRUPTED_ASSET
      );
    }
    
    // Create copy of latent tensor
    const result = new Float32Array(latentTensor);
    
    // Apply perturbations based on target layers
    for (const layerIndex of this.targetLayers) {
      if (layerIndex >= modelInfo.layerNames.length) {
        continue; // Skip invalid layer
      }
      
      this.applyLayerPerturbation(result, watermarkKey, layerIndex, modelInfo.latentDimensions);
    }
    
    return result;
  }

  /**
   * Apply perturbation to specific layer
   */
  private applyLayerPerturbation(
    latentTensor: Float32Array,
    watermarkKey: Float32Array,
    layerIndex: number,
    dimensions: [number, number, number, number]
  ): void {
    const [batch, height, width, channels] = dimensions;
    
    // Generate spatial pattern for this layer
    const spatialPattern = this.generateSpatialPattern(layerIndex, height, width);
    
    // Apply perturbations
    let keyIndex = 0;
    
    for (let b = 0; b < batch; b++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          for (let c = 0; c < channels; c++) {
            const tensorIndex = ((b * height + h) * width + w) * channels + c;
            
            // Check if this position should be perturbed
            if (!spatialPattern[h * width + w]) {
              continue;
            }
            
            // Apply perturbation based on key
            const perturbation = this.calculatePerturbation(
              latentTensor[tensorIndex],
              watermarkKey[keyIndex % watermarkKey.length],
              layerIndex,
              c
            );
            
            latentTensor[tensorIndex] += perturbation;
            keyIndex++;
          }
        }
      }
    }
  }

  /**
   * Calculate perturbation for single latent value
   */
  private calculatePerturbation(
    currentValue: number,
    keyComponent: number,
    layerIndex: number,
    channelIndex: number
  ): number {
    const strength = this.profile.strength;
    const noiseScale = this.profile.noiseScale;
    
    // Generate perturbation using key and layer-specific parameters
    const layerWeight = 1.0 / (layerIndex + 1); // Deeper layers have less impact
    const channelWeight = (channelIndex + 1) / 64; // Normalize by typical channel count
    
    // Apply perturbation with noise
    const basePerturbation = keyComponent * strength * layerWeight * channelWeight;
    const noise = (Math.random() - 0.5) * noiseScale;
    
    return basePerturbation + noise;
  }

  /**
   * Generate spatial pattern for perturbation
   */
  private generateSpatialPattern(layerIndex: number, height: number, width: number): boolean[] {
    const pattern = new Array(height * width).fill(false);
    
    // Use deterministic seed based on layer and profile
    const seed = (layerIndex * 1000 + this.profile.strength * 10000) | 0;
    
    // Generate pseudo-random pattern
    let state = seed;
    
    // Target ~30% of spatial positions
    const targetPositions = Math.floor(height * width * 0.3);
    let selectedPositions = 0;
    
    for (let i = 0; i < height * width && selectedPositions < targetPositions; i++) {
      state = (state * 1103515245 + 12345) & 0x7FFFFFFF;
      
      if (state % 3 === 0) { // ~33% selection rate
        pattern[i] = true;
        selectedPositions++;
      }
    }
    
    return pattern;
  }

  /**
   * Hash payload bytes to generate deterministic key
   */
  private hashPayload(payloadBytes: Uint8Array): Uint8Array {
    // Simple hash implementation - in production use crypto.subtle.digest
    let hash = 0;
    
    for (const byte of payloadBytes) {
      hash = ((hash << 5) - hash) + byte;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Generate enough bytes for the key
    const result = new Uint8Array(Math.ceil(this.keyBits / 8));
    
    for (let i = 0; i < result.length; i++) {
      result[i] = (hash >> (i * 8)) & 0xFF;
    }
    
    return result;
  }

  /**
   * Serialize payload to bytes for hashing
   */
  private serializePayload(payload: WatermarkPayload): Uint8Array {
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

  /**
   * Validate model compatibility
   */
  private validateModelCompatibility(modelInfo: {
    modelType: string;
    latentDimensions: [number, number, number, number];
    layerNames: string[];
  }): void {
    if (!this.profile.modelCompatibility.includes(modelInfo.modelType)) {
      throw new WatermarkError(
        `Model ${modelInfo.modelType} not supported by latent watermark profile`,
        WatermarkErrorCode.UNSUPPORTED_ASSET_TYPE
      );
    }
    
    const [batch, height, width, channels] = modelInfo.latentDimensions;
    
    if (height < 8 || width < 8) {
      throw new WatermarkError(
        'Latent dimensions too small for watermarking',
        WatermarkErrorCode.UNSUPPORTED_ASSET_TYPE
      );
    }
    
    if (channels < 4) {
      throw new WatermarkError(
        'Insufficient channels for latent watermarking',
        WatermarkErrorCode.UNSUPPORTED_ASSET_TYPE
      );
    }
  }

  // Validation Methods

  private validateProfile(): void {
    if (this.profile.strength < 0.01 || this.profile.strength > 0.5) {
      throw new WatermarkError(
        'Latent watermark strength must be 0.01-0.5',
        WatermarkErrorCode.INVALID_STRENGTH
      );
    }
    
    if (this.profile.layers.length === 0) {
      throw new WatermarkError(
        'At least one target layer required',
        WatermarkErrorCode.INVALID_PROFILE
      );
    }
    
    if (this.profile.keyBits < 64 || this.profile.keyBits > 256) {
      throw new WatermarkError(
        'Key bits must be 64-256',
        WatermarkErrorCode.INVALID_PROFILE
      );
    }
    
    if (this.profile.noiseScale < 0.001 || this.profile.noiseScale > 0.1) {
      throw new WatermarkError(
        'Noise scale must be 0.001-0.1',
        WatermarkErrorCode.INVALID_PROFILE
      );
    }
  }

  private validateLatentTensor(tensor: Float32Array): void {
    if (!tensor || tensor.length === 0) {
      throw new WatermarkError(
        'Invalid latent tensor',
        WatermarkErrorCode.CORRUPTED_ASSET
      );
    }
    
    if (tensor.length > 1024 * 1024 * 64) { // 64MB limit
      throw new WatermarkError(
        'Latent tensor too large',
        WatermarkErrorCode.CORRUPTED_ASSET
      );
    }
    
    // SECURITY: Fixed validation to check ALL values, not just first 1000
    // Previously only checked first 1000 values, allowing invalid values to bypass validation
    let invalidCount = 0;
    const maxInvalidSamples = Math.min(tensor.length, 10000); // Sample up to 10k for performance
    
    for (let i = 0; i < tensor.length; i++) {
      if (!isFinite(tensor[i])) {
        invalidCount++;
        
        // If we find too many invalid values in our sample, reject the tensor
        if (invalidCount > 10 && i < maxInvalidSamples) {
          throw new WatermarkError(
            'Latent tensor contains too many invalid values',
            WatermarkErrorCode.CORRUPTED_ASSET
          );
        }
      }
    }
    
    // If invalid count is high relative to tensor size, reject
    if (invalidCount > tensor.length * 0.01) { // More than 1% invalid
      throw new WatermarkError(
        'Latent tensor contains excessive invalid values',
        WatermarkErrorCode.CORRUPTED_ASSET
      );
    }
  }

  private validatePayload(payload: WatermarkPayload): void {
    if (!payload) {
      throw new WatermarkError(
        'Invalid payload',
        WatermarkErrorCode.PAYLOAD_TOO_LARGE
      );
    }
    // SECURITY: Enhanced payload validation to prevent malformed data
    if (!payload.truncatedHash || payload.truncatedHash.length === 0) {
      throw new WatermarkError('Invalid truncated hash in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.salt || payload.salt.length === 0) {
      throw new WatermarkError('Invalid salt in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.reserved || payload.reserved.length === 0) {
      throw new WatermarkError('Invalid reserved field in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // SECURITY: Validate payload version range
    if (payload.version < 1 || payload.version > 15) {
      throw new WatermarkError(`Invalid payload version: ${payload.version}`, WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // SECURITY: Ensure reserved field complies with specification
    for (let i = 0; i < payload.reserved.length; i++) {
      if (payload.reserved[i] !== 0) {
        throw new WatermarkError('Reserved field must contain only zeros', WatermarkErrorCode.PAYLOAD_MISMATCH);
      }
    }
  }
}
```

### Latent Watermark Detector
```typescript
export class LatentWatermarkDetector {
  private readonly profile: LatentProfile;
  private readonly keyBits: number;

  constructor(profile: LatentProfile) {
    this.profile = profile;
    this.keyBits = profile.keyBits;
  }

  /**
   * Detect watermark in latent space
   * RESEARCH-ONLY: Not for production use
   */
  async detectInLatentSpace(
    latentTensor: Float32Array,
    expectedPayload: WatermarkPayload,
    modelInfo: {
      modelType: string;
      latentDimensions: [number, number, number, number];
      layerNames: string[];
    }
  ): Promise<{
    present: boolean;
    confidence: number;
    error?: string;
  }> {
    try {
      // Validate inputs
      this.validateLatentTensor(latentTensor);
      this.validateModelCompatibility(modelInfo);
      
      // Generate expected watermark key
      const expectedKey = this.generateWatermarkKey(expectedPayload);
      
      // Extract watermark from latent tensor
      const extractedKey = await this.extractFromLatentSpace(latentTensor, modelInfo);
      
      // Compare keys
      const similarity = this.calculateKeySimilarity(expectedKey, extractedKey);
      
      // Determine presence based on similarity threshold
      const threshold = 0.7; // 70% similarity required
      const present = similarity >= threshold;
      
      return {
        present,
        confidence: similarity
      };
      
    } catch (error) {
      return {
        present: false,
        confidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Extract watermark key from latent space
   */
  private async extractFromLatentSpace(
    latentTensor: Float32Array,
    modelInfo: {
      latentDimensions: [number, number, number, number];
      layerNames: string[];
    }
  ): Promise<Float32Array> {
    const [batch, height, width, channels] = modelInfo.latentDimensions;
    const extractedKey = new Float32Array(this.keyBits / 32);
    
    let keyIndex = 0;
    
    // Extract from each target layer
    for (const layerIndex of this.profile.layers) {
      if (layerIndex >= modelInfo.layerNames.length) {
        continue;
      }
      
      const layerKey = this.extractFromLayer(latentTensor, layerIndex, modelInfo.latentDimensions);
      
      // Combine with extracted key
      for (let i = 0; i < layerKey.length && keyIndex < extractedKey.length; i++) {
        extractedKey[keyIndex] = (extractedKey[keyIndex] + layerKey[i]) / 2;
        keyIndex++;
      }
    }
    
    return extractedKey;
  }

  /**
   * Extract from specific layer
   */
  private extractFromLayer(
    latentTensor: Float32Array,
    layerIndex: number,
    dimensions: [number, number, number, number]
  ): Float32Array {
    const [batch, height, width, channels] = dimensions;
    const spatialPattern = this.generateSpatialPattern(layerIndex, height, width);
    
    const extractedValues: number[] = [];
    let valueIndex = 0;
    
    for (let b = 0; b < batch; b++) {
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          if (!spatialPattern[h * width + w]) {
            continue;
          }
          
          for (let c = 0; c < channels; c++) {
            const tensorIndex = ((b * height + h) * width + w) * channels + c;
            
            if (valueIndex < extractedValues.length) {
              extractedValues[valueIndex] = latentTensor[tensorIndex];
            } else {
              extractedValues.push(latentTensor[tensorIndex]);
            }
            
            valueIndex++;
          }
        }
      }
    }
    
    // Convert to Float32Array
    const result = new Float32Array(Math.min(extractedValues.length, this.keyBits / 32));
    for (let i = 0; i < result.length; i++) {
      result[i] = extractedValues[i];
    }
    
    return result;
  }

  /**
   * Calculate similarity between two keys
   */
  private calculateKeySimilarity(key1: Float32Array, key2: Float32Array): number {
    if (key1.length !== key2.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < key1.length; i++) {
      dotProduct += key1[i] * key2[i];
      norm1 += key1[i] * key1[i];
      norm2 += key2[i] * key2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    // Cosine similarity
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  // Helper methods (same as embedder)

  private generateWatermarkKey(payload: WatermarkPayload): Float32Array {
    const payloadBytes = this.serializePayload(payload);
    const keyHash = this.hashPayload(payloadBytes);
    const key = new Float32Array(this.keyBits / 32);
    
    for (let i = 0; i < key.length; i++) {
      const hashStart = i * 4;
      const hashChunk = keyHash.slice(hashStart, hashStart + 4);
      const intValue = new DataView(the hashChunk.buffer).getUint32(0, false);
      key[i] = (intValue / 0xFFFFFFFF) * 2 - 1;
    }
    
    return key;
  }

  private generateSpatialPattern(layerIndex: number, height: number, width: number): boolean[] {
    const pattern = new Array(height * width).fill(false);
    const seed = (layerIndex * 1000 + this.profile.strength * 10000) | 0;
    
    let state = seed;
    const targetPositions = Math.floor(height * width * 0.3);
    let selectedPositions = 0;
    
    for (let i = 0; i < height * width && selectedPositions < targetPositions; i++) {
      state = (state * 1103515245 + 12345) & 0x7FFFFFFF;
      
      if (state % 3 === 0) {
        pattern[i] = true;
        selectedPositions++;
      }
    }
    
    return pattern;
  }

  private hashPayload(payloadBytes: Uint8Array): Uint8Array {
    let hash = 0;
    
    for (const byte of payloadBytes) {
      hash hash = ((hash << 5) - hash) + byte;
      the hash = hash & hash;
    }
    
    const result = new Uint8Array(Math.ceil(this.keyBits / 8));
    
    for (let i = 0; i < result.length; i++) {
      result[i] = (hash >> (i * 8)) & 0xFF;
    }
    
    return result;
  }

  private serializePayload(payload: WatermarkPayload): Uint8Array {
    const result = new Uint8Array(
      payload.truncatedHash.length + 
      payload.salt.length + 
      payload.reserved.length + 
      1
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

  private validateModelCompatibility(modelInfo: {
    modelType: string;
    latentDimensions: [number, number, number, number];
    layerNames: string[];
  }): void {
    if (!this.profile.modelCompatibility.includes(modelInfo.modelType)) {
      throw new WatermarkError(
        `Model ${modelInfo.modelType} not supported`,
        WatermarkErrorCode.UNSUPPORTED_ASSET_TYPE
      );
    }
  }

  private validateLatentTensor(tensor: Float32Array): void {
    if (!tensor || tensor.length === 0) {
      throw new WatermarkError('Invalid latent tensor', WatermarkErrorCode.CORRUPTED_ASSET);
    }
  }
}
```

### Factory and Research Interface
```typescript
export class LatentWatermarkFactory {
  /**
   * Create latent embedder for research
   */
  static createForResearch(): LatentWatermarkEmbedder {
    const profile: LatentProfile = {
      type: 'latent_diffusion',
      strength: 0.1,
      layers: [8, 9, 10, 11],
      noiseScale: 0.05,
      keyBits: 128,
      modelCompatibility: ['stable-diffusion-v1.5', 'stable-diffusion-xl']
    };
    
    return new LatentWatermarkEmbedder(profile);
  }

  /**
   * Create latent detector for research
   */
  static createDetectorForResearch(): LatentWatermarkDetector {
    const profile: LatentProfile = {
      type: 'latent_diffusion',
      strength: 0.1,
      layers: [8, 9, 10, 11],
      noiseScale: 0.05,
      keyBits: 128,
      modelCompatibility: ['stable-diffusion-v1.5', 'stable-diffusion-xl']
    };
    
    return new LatentWatermarkDetector(profile);
  }

  /**
   * Create embedder with custom profile
   */
  static createWithProfile(profile: LatentProfile): LatentWatermarkEmbedder {
    return new LatentWatermarkEmbedder(profile);
  }
}

// Research interface with safety warnings
export class ResearchWatermarkInterface {
  private readonly embedder: LatentWatermarkEmbedder;
  private readonly detector: LatentWatermarkDetector;

  constructor() {
    console.warn('⚠️  RESEARCH-ONLY: Latent watermarks are experimental and not production-ready');
    console.warn('⚠️  These watermarks may be easily removed or forged');
    console.warn('⚠️  Use only for controlled research experiments');
    
    this.embedder = LatentWatermarkFactory.createForResearch();
    this.detector = LatentWatermarkFactory.createDetectorForResearch();
  }

  async embedResearchWatermark(
    latentTensor: Float32Array,
    payload: WatermarkPayload,
    modelInfo: any
  ): Promise<Float32Array> {
    return this.embedder.embedInLatentSpace(latentTensor, payload, modelInfo);
  }

  async detectResearchWatermark(
    latentTensor: Float32Array,
    expectedPayload: WatermarkPayload,
    modelInfo: any
  ): Promise<{ present: boolean; confidence: number; error?: string }> {
    return this.detector.detectInLatentSpace(latentTensor, expectedPayload, modelInfo);
  }
}

// Export research interface
export const researchWatermarkInterface = new ResearchWatermarkInterface();
```
