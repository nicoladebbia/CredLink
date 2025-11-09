# Payload Generation & Binding System

## Payload Generation Implementation

### Core Payload Generator
```typescript
import * as crypto from 'crypto';
import { WatermarkPayload, WatermarkError, WatermarkErrorCode } from './watermark-config';

export class PayloadGenerator {
  private readonly version: number;
  private readonly hashTruncationBits: number;
  private readonly saltBits: number;
  private readonly versionBits: number;
  private readonly reservedBits: number;

  constructor(config: {
    version: number;
    hashTruncationBits: number;
    saltBits: number;
    versionBits: number;
    reservedBits: number;
  }) {
    this.version = config.version;
    this.hashTruncationBits = config.hashTruncationBits;
    this.saltBits = config.saltBits;
    this.versionBits = config.versionBits;
    this.reservedBits = config.reservedBits;
    
    this.validateConfig();
  }

  /**
   * Generate watermark payload from manifest hash
   * Strictly follows: truncated sha256(manifest) + salt + version + reserved
   */
  generatePayload(manifestHash: string, salt?: string): WatermarkPayload {
    // Input validation
    this.validateManifestHash(manifestHash);
    
    // Generate or use provided salt
    const saltBytes = salt ? this.parseSalt(salt) : this.generateSalt();
    
    // Truncate SHA256 hash
    const truncatedHash = this.truncateSHA256(manifestHash);
    
    // Create version field
    const versionBytes = this.encodeVersion(this.version);
    
    // Create reserved field (all zeros)
    const reservedBytes = new Uint8Array(Math.ceil(this.reservedBits / 8));
    
    return {
      version: this.version,
      truncatedHash,
      salt: saltBytes,
      reserved: reservedBytes
    };
  }

  /**
   * Verify payload matches manifest hash
   * Returns true only if payload was generated from the exact manifest hash
   */
  verifyPayload(payload: WatermarkPayload, manifestHash: string): boolean {
    try {
      // Validate input
      this.validateManifestHash(manifestHash);
      this.validatePayload(payload);
      
      // Generate expected payload
      const expectedPayload = this.generatePayload(manifestHash, this.saltToHex(payload.salt));
      
      // Compare all fields
      return (
        payload.version === expectedPayload.version &&
        this.arraysEqual(payload.truncatedHash, expectedPayload.truncatedHash) &&
        this.arraysEqual(payload.salt, expectedPayload.salt) &&
        this.arraysEqual(payload.reserved, expectedPayload.reserved)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Serialize payload to bitstream for embedding
   */
  serializePayload(payload: WatermarkPayload): Uint8Array {
    this.validatePayload(payload);
    
    const totalBytes = Math.ceil(
      this.hashTruncationBits + this.saltBits + this.versionBits + this.reservedBits
    ) / 8;
    
    const result = new Uint8Array(totalBytes);
    let bitOffset = 0;
    
    // Write truncated hash
    this.writeBits(result, payload.truncatedHash, this.hashTruncationBits, bitOffset);
    bitOffset += this.hashTruncationBits;
    
    // Write salt
    this.writeBits(result, payload.salt, this.saltBits, bitOffset);
    bitOffset += this.saltBits;
    
    // Write version
    this.writeBits(result, this.encodeVersion(payload.version), this.versionBits, bitOffset);
    bitOffset += this.versionBits;
    
    // Write reserved (zeros)
    this.writeBits(result, payload.reserved, this.reservedBits, bitOffset);
    
    return result;
  }

  /**
   * Deserialize payload from bitstream
   */
  deserializePayload(data: Uint8Array): WatermarkPayload {
    if (!data || data.length === 0) {
      throw new WatermarkError('Invalid payload data', WatermarkErrorCode.PAYLOAD_TOO_LARGE);
    }
    
    const totalBits = this.hashTruncationBits + this.saltBits + this.versionBits + this.reservedBits;
    if (data.length * 8 < totalBits) {
      throw new WatermarkError('Payload data too small', WatermarkErrorCode.PAYLOAD_TOO_LARGE);
    }
    
    let bitOffset = 0;
    
    // Read truncated hash
    const truncatedHash = this.readBits(data, this.hashTruncationBits, bitOffset);
    bitOffset += this.hashTruncationBits;
    
    // Read salt
    const salt = this.readBits(data, this.saltBits, bitOffset);
    bitOffset += this.saltBits;
    
    // Read version
    const versionBytes = this.readBits(data, this.versionBits, bitOffset);
    const version = this.decodeVersion(versionBytes);
    bitOffset += this.versionBits;
    
    // Read reserved
    const reserved = this.readBits(data, this.reservedBits, bitOffset);
    
    return {
      version,
      truncatedHash,
      salt,
      reserved
    };
  }

  // Private helper methods

  private validateConfig(): void {
    if (this.version < 0 || this.version > 15) {
      throw new WatermarkError('Version must be 0-15', WatermarkErrorCode.INVALID_PROFILE);
    }
    if (this.hashTruncationBits < 1 || this.hashTruncationBits > 64) {
      throw new WatermarkError('Hash truncation must be 1-64 bits', WatermarkErrorCode.INVALID_PROFILE);
    }
    if (this.saltBits < 0 || this.saltBits > 64) {
      throw new WatermarkError('Salt must be 0-64 bits', WatermarkErrorCode.INVALID_PROFILE);
    }
    const totalBits = this.hashTruncationBits + this.saltBits + this.versionBits + this.reservedBits;
    if (totalBits > 128) {
      throw new WatermarkError('Total payload cannot exceed 128 bits', WatermarkErrorCode.PAYLOAD_TOO_LARGE);
    }
  }

  private validateManifestHash(hash: string): void {
    if (!hash || typeof hash !== 'string') {
      throw new WatermarkError('Invalid manifest hash', WatermarkErrorCode.INVALID_MANIFEST_HASH);
    }
    // Must be valid hex string of 64 characters (SHA256)
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      throw new WatermarkError('Manifest hash must be 64-character hex string', WatermarkErrorCode.INVALID_MANIFEST_HASH);
    }
  }

  private validatePayload(payload: WatermarkPayload): void {
    if (!payload) {
      throw new WatermarkError('Invalid payload', WatermarkErrorCode.PAYLOAD_TOO_LARGE);
    }
    if (payload.version !== this.version) {
      throw new WatermarkError(`Payload version mismatch: expected ${this.version}, got ${payload.version}`, WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.truncatedHash || payload.truncatedHash.length === 0) {
      throw new WatermarkError('Invalid truncated hash in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    if (!payload.salt || payload.salt.length === 0) {
      throw new WatermarkError('Invalid salt in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // SECURITY: Added validation for reserved field to prevent data injection
    if (!payload.reserved || payload.reserved.length === 0) {
      throw new WatermarkError('Invalid reserved field in payload', WatermarkErrorCode.PAYLOAD_MISMATCH);
    }
    // SECURITY: Ensure reserved field contains only zeros as per specification
    for (let i = 0; i < payload.reserved.length; i++) {
      if (payload.reserved[i] !== 0) {
        throw new WatermarkError('Reserved field must contain only zeros', WatermarkErrorCode.PAYLOAD_MISMATCH);
      }
    }
  }

  private truncateSHA256(manifestHash: string): Uint8Array {
    const hashBuffer = Buffer.from(manifestHash, 'hex');
    const truncatedBytes = Math.ceil(this.hashTruncationBits / 8);
    const result = new Uint8Array(truncatedBytes);
    
    // Copy the required number of bits
    for (let i = 0; i < truncatedBytes; i++) {
      result[i] = hashBuffer[i];
    }
    
    // Zero out excess bits in the last byte if needed
    const excessBits = (truncatedBytes * 8) - this.hashTruncationBits;
    if (excessBits > 0) {
      result[truncatedBytes - 1] &= ~(0xFF << (8 - excessBits));
    }
    
    return result;
  }

  private generateSalt(): Uint8Array {
    const saltBytes = Math.ceil(this.saltBits / 8);
    const salt = crypto.randomBytes(saltBytes);
    
    // Zero out excess bits in the last byte if needed
    const excessBits = (saltBytes * 8) - this.saltBits;
    if (excessBits > 0) {
      salt[saltBytes - 1] &= ~(0xFF << (8 - excessBits));
    }
    
    return new Uint8Array(salt);
  }

  private parseSalt(saltHex: string): Uint8Array {
    if (!/^[a-fA-F0-9]*$/.test(saltHex)) {
      throw new WatermarkError('Invalid salt format', WatermarkErrorCode.INVALID_PROFILE);
    }
    
    const saltBytes = Buffer.from(saltHex, 'hex');
    const expectedBytes = Math.ceil(this.saltBits / 8);
    
    if (saltBytes.length > expectedBytes) {
      throw new WatermarkError('Salt too large', WatermarkErrorCode.INVALID_PROFILE);
    }
    
    if (saltBytes.length < expectedBytes) {
      // Pad with zeros
      const padded = new Uint8Array(expectedBytes);
      padded.set(saltBytes);
      return padded;
    }
    
    return new Uint8Array(saltBytes);
  }

  private saltToHex(salt: Uint8Array): string {
    return Buffer.from(salt).toString('hex');
  }

  private encodeVersion(version: number): Uint8Array {
    const versionBytes = Math.ceil(this.versionBits / 8);
    const result = new Uint8Array(versionBytes);
    result[0] = version & 0xFF;
    return result;
  }

  private decodeVersion(versionBytes: Uint8Array): number {
    return versionBytes[0] & ((1 << this.versionBits) - 1);
  }

  private writeBits(target: Uint8Array, source: Uint8Array, bits: number, offset: number): void {
    let sourceBitIndex = 0;
    
    for (let i = 0; i < bits; i++) {
      const targetByte = Math.floor((offset + i) / 8);
      const targetBit = 7 - ((offset + i) % 8);
      const sourceByte = Math.floor(sourceBitIndex / 8);
      const sourceBitPos = 7 - (sourceBitIndex % 8);
      
      if (source[sourceByte] & (1 << sourceBitPos)) {
        target[targetByte] |= (1 << targetBit);
      }
      
      sourceBitIndex++;
    }
  }

  private readBits(source: Uint8Array, bits: number, offset: number): Uint8Array {
    const resultBytes = Math.ceil(bits / 8);
    const result = new Uint8Array(resultBytes);
    let resultBit = 0;
    
    for (let i = 0; i < bits; i++) {
      const sourceByte = Math.floor((offset + i) / 8);
      const sourceBit = 7 - ((offset + i) % 8);
      const resultByte = Math.floor(resultBit / 8);
      const resultBitPos = 7 - (resultBit % 8);
      
      if (source[sourceByte] & (1 << sourceBit)) {
        result[resultByte] |= (1 << resultBitPos);
      }
      
      resultBit++;
    }
    
    return result;
  }

  private arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
```

### Payload Binding Verification
```typescript
export class PayloadBinding {
  private readonly payloadGenerator: PayloadGenerator;

  constructor(payloadGenerator: PayloadGenerator) {
    this.payloadGenerator = payloadGenerator;
  }

  /**
   * Check if detected payload binds to expected manifest hash
   * This is the critical security check that prevents forgery
   */
  verifyBinding(detectedPayload: WatermarkPayload, expectedManifestHash: string): {
    binds: boolean;
    confidence: number;
    error?: string;
  } {
    try {
      const binds = this.payloadGenerator.verifyPayload(detectedPayload, expectedManifestHash);
      
      return {
        binds,
        confidence: binds ? 1.0 : 0.0
      };
    } catch (error) {
      return {
        binds: false,
        confidence: 0.0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate payload binding report for audit
   */
  generateBindingReport(
    detectedPayload: WatermarkPayload,
    expectedManifestHash: string,
    detectionResult: any
  ): {
    timestamp: Date;
    manifestHash: string;
    payloadVersion: number;
    binds: boolean;
    confidence: number;
    detectionConfidence: number;
    processingTimeMs: number;
  } {
    const binding = this.verifyBinding(detectedPayload, expectedManifestHash);
    
    return {
      timestamp: new Date(),
      manifestHash: expectedManifestHash,
      payloadVersion: detectedPayload.version,
      binds: binding.binds,
      confidence: binding.confidence,
      detectionConfidence: detectionResult.confidence || 0,
      processingTimeMs: detectionResult.processingTimeMs || 0
    };
  }
}
```

### Payload Security Validation
```typescript
export class PayloadSecurityValidator {
  /**
   * Validate payload contains no PII or identifying information
   * This is a critical security requirement
   */
  validatePayloadSecurity(payload: WatermarkPayload): {
    secure: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    
    // Check payload size (≤128 bits)
    const totalBits = payload.truncatedHash.length * 8 + 
                     payload.salt.length * 8 + 
                     payload.reserved.length * 8;
    
    if (totalBits > 128) {
      violations.push('Payload exceeds 128-bit limit');
    }
    
    // Check for patterns that might indicate PII
    if (this.containsPIIPatterns(payload)) {
      violations.push('Payload contains potential PII patterns');
    }
    
    // Check for entropy (should be random-looking)
    if (!this.hasSufficientEntropy(payload)) {
      violations.push('Payload lacks sufficient entropy');
    }
    
    // Verify hash is properly truncated
    if (payload.truncatedHash.length > 8) { // 64 bits = 8 bytes
      violations.push('Hash truncation exceeds 64 bits');
    }
    
    // Verify salt size
    if (payload.salt.length > 4) { // 32 bits = 4 bytes
      violations.push('Salt exceeds 32 bits');
    }
    
    return {
      secure: violations.length === 0,
      violations
    };
  }

  private containsPIIPatterns(payload: WatermarkPayload): boolean {
    // Check for ASCII patterns that might indicate PII
    const allBytes = new Uint8Array([
      ...payload.truncatedHash,
      ...payload.salt,
      ...payload.reserved
    ]);
    
    // Look for common ASCII patterns
    const asciiStrings: string[] = [];
    let currentString = '';
    
    for (const byte of allBytes) {
      if (byte >= 32 && byte <= 126) { // Printable ASCII
        currentString += String.fromCharCode(byte);
      } else {
        if (currentString.length >= 3) {
          asciiStrings.push(currentString);
        }
        currentString = '';
      }
    }
    
    // Check for PII-like patterns
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ // Email
    ];
    
    return asciiStrings.some(str => 
      piiPatterns.some(pattern => pattern.test(str))
    );
  }

  private hasSufficientEntropy(payload: WatermarkPayload): boolean {
    const allBytes = new Uint8Array([
      ...payload.truncatedHash,
      ...payload.salt,
      ...payload.reserved
    ]);
    
    // Simple entropy check: count unique byte values
    const uniqueBytes = new Set(allBytes);
    const entropyRatio = uniqueBytes.size / allBytes.length;
    
    // Should have at least 70% unique bytes
    return entropyRatio >= 0.7;
  }
}
```

### Factory and Default Implementation
```typescript
export class PayloadGeneratorFactory {
  /**
   * Create payload generator with standard Phase 52 configuration
   */
  static createStandard(): PayloadGenerator {
    return new PayloadGenerator({
      version: 1,
      hashTruncationBits: 64,
      saltBits: 32,
      versionBits: 4,
      reservedBits: 28
    });
  }

  /**
   * Create payload generator for testing
   */
  static createForTesting(): PayloadGenerator {
    return new PayloadGenerator({
      version: 1,
      hashTruncationBits: 32, // Smaller for testing
      saltBits: 16,
      versionBits: 4,
      reservedBits: 12
    });
  }
}

// Export default instance
export const defaultPayloadGenerator = PayloadGeneratorFactory.createStandard();
export const defaultPayloadBinding = new PayloadBinding(defaultPayloadGenerator);
export const defaultSecurityValidator = new PayloadSecurityValidator();
```
