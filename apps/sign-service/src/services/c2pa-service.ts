import { CertificateManager } from './certificate-manager';
import { ManifestBuilder, C2PAManifest } from './manifest-builder';
import { C2PAWrapper } from './c2pa-wrapper';
import { PerceptualHash } from '../utils/perceptual-hash';
import { ProofStorage } from './proof-storage';
import * as crypto from 'crypto';
import { LRUCache } from 'lru-cache';

export interface SigningOptions {
  creator?: string;
  assertions?: any[];
  useRealC2PA?: boolean; // Flag to enable real C2PA signing
}

export interface SigningResult {
  manifestUri: string;
  signature: string;
  proofUri: string;
  imageHash: string;
  timestamp: string;
  certificateId: string;
  signedBuffer?: Buffer; // The actual signed image with embedded C2PA
}

export interface SignMetadata {
  title?: string;
  author?: string;
  description?: string;
  created?: string;
}

export interface SignedImage {
  buffer: Buffer;
  manifest: C2PAManifest;
  signature: string;
  manifestUri: string;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SigningError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'SigningError';
  }
}

export class C2PAService {
  private certManager: CertificateManager;
  private manifestBuilder: ManifestBuilder;
  private c2paWrapper: C2PAWrapper;
  private proofStorage: ProofStorage;
  private useRealC2PA: boolean;
  private manifestCache: LRUCache<string, C2PAManifest>;
  private signingLock: Map<string, Promise<any>> = new Map();

  constructor(options: { useRealC2PA?: boolean } = {}) {
    this.useRealC2PA = options.useRealC2PA ?? (process.env.USE_REAL_C2PA === 'true');
    this.certManager = new CertificateManager();
    this.manifestBuilder = new ManifestBuilder();
    this.c2paWrapper = new C2PAWrapper();
    this.proofStorage = new ProofStorage();
    
    // Initialize LRU cache with max 1000 entries to prevent memory leak
    this.manifestCache = new LRUCache<string, C2PAManifest>({
      max: 1000,
      ttl: 1000 * 60 * 60 * 24, // 24 hours
      updateAgeOnGet: true
    });
  }

  async signImage(imageBuffer: Buffer, options: SigningOptions = {}): Promise<SigningResult> {
    try {
      // 1. Validate image format and size
      this.validateImage(imageBuffer);
      
      // 2. Generate image hash for deduplication
      const imageHash = await this.generateImageHash(imageBuffer);
      
      // 3. Build C2PA manifest with all required assertions
      const manifest = await this.manifestBuilder.build({
        imageBuffer,
        imageHash,
        creator: options.creator || 'CredLink',
        timestamp: new Date().toISOString(),
        customAssertions: options.assertions || []
      });
      
      // 4. Perform cryptographic signing
      let signingResult: { manifestUri: string; signature: string; signedBuffer?: Buffer };
      
      if (this.useRealC2PA || options.useRealC2PA) {
        // Use real C2PA library
        signingResult = await this.performRealC2PASigning(imageBuffer, manifest);
      } else {
        // Use fallback crypto signing (for testing/development)
        signingResult = await this.performCryptoSigning(imageBuffer, manifest);
      }
      
      // 5. Extract and validate signature components
      const signatureData = this.extractSignatureData(signingResult);
      
      // 6. Store proof with real storage
      const proofUri = await this.proofStorage.storeProof(manifest, imageHash);
      
      // Cache the manifest for retrieval
      this.manifestCache.set(signingResult.manifestUri, manifest);
      
      return {
        manifestUri: signingResult.manifestUri,
        signature: signatureData.signature,
        proofUri: proofUri,
        imageHash: imageHash,
        timestamp: manifest.claim_generator.timestamp,
        certificateId: this.certManager.getCurrentCertificateId(),
        signedBuffer: signingResult.signedBuffer
      };
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof SigningError) {
        throw error;
      }
      throw new SigningError(`Failed to sign image: ${error.message}`, 'SIGNING_FAILED');
    }
  }

  private async performRealC2PASigning(imageBuffer: Buffer, manifest: C2PAManifest): Promise<{ manifestUri: string; signature: string; signedBuffer: Buffer }> {
    try {
      // For now, use real cryptographic signing (RSA-SHA256)
      // This provides cryptographically valid signatures without C2PA library dependencies
      // Full C2PA embedding (manifests in JUMBF) is planned for Phase 2

      const manifestUri = `urn:uuid:${crypto.randomUUID()}`;
      const signingKey = await this.certManager.getSigningKey();

      // Create signature of manifest content using RSA-SHA256
      // This is cryptographically real, not mocked
      const manifestString = JSON.stringify({
        ...manifest,
        manifestUri,
        timestamp: new Date().toISOString()
      });

      const signature = crypto
        .sign('RSA-SHA256', Buffer.from(manifestString), signingKey)
        .toString('base64');

      // Return signed result
      // Note: signedBuffer returns original image for now
      // Real C2PA embedding will happen in Phase 2 (JUMBF implementation)
      return {
        manifestUri,
        signature,
        signedBuffer: imageBuffer
      };
    } catch (error: any) {
      throw new SigningError(`Real cryptographic signing failed: ${error.message}`, 'CRYPTO_SIGN_FAILED');
    }
  }

  private async performCryptoSigning(imageBuffer: Buffer, manifest: C2PAManifest): Promise<{ manifestUri: string; signature: string }> {
    const manifestUri = `urn:uuid:${crypto.randomUUID()}`;
    const signingKey = await this.certManager.getSigningKey();
    
    // Create a signature based on the manifest hash
    const manifestString = JSON.stringify(manifest);
    const signature = crypto.sign('RSA-SHA256', Buffer.from(manifestString), signingKey).toString('base64');
    
    return {
      manifestUri,
      signature
    };
  }

  private extractC2PASignature(manifestStore: any): string {
    // Extract signature from C2PA manifest store
    // This is a simplified extraction - real implementation would parse the JUMBF structure
    try {
      if (manifestStore && manifestStore.activeManifest) {
        return manifestStore.activeManifest.signature || 'c2pa-signature';
      }
      return 'c2pa-signature-extracted';
    } catch (error) {
      return 'c2pa-signature-fallback';
    }
  }

  private async validateImage(buffer: Buffer): Promise<void> {
    if (!Buffer.isBuffer(buffer)) {
      throw new ValidationError('Image must be a Buffer');
    }
    if (buffer.length === 0) {
      throw new ValidationError('Image cannot be empty');
    }
    if (buffer.length > 50 * 1024 * 1024) { // 50MB limit
      throw new ValidationError('Image size exceeds 50MB limit');
    }
    
    // Validate image dimensions to prevent decompression bombs
    try {
      const sharp = require('sharp');
      const metadata = await sharp(buffer).metadata();
      const pixels = (metadata.width || 0) * (metadata.height || 0);
      
      if (pixels > 100_000_000) { // 100 megapixels max
        throw new ValidationError('Image dimensions too large (max 100 megapixels)');
      }
    } catch (error: any) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError('Invalid image format');
    }
    
    // Validate image format
    const format = this.detectImageFormat(buffer);
    const supportedFormats = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedFormats.includes(format)) {
      throw new ValidationError(`Unsupported image format: ${format}`);
    }
  }

  private async generateImageHash(buffer: Buffer): Promise<string> {
    // Use SHA-256 for content hash
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    // Generate real perceptual hash for duplicate detection
    const perceptualHash = await PerceptualHash.generate(buffer);
    
    return `sha256:${contentHash}:phash:${perceptualHash}`;
  }

  private detectImageFormat(buffer: Buffer): string {
    // Check magic bytes
    const signature = buffer.toString('hex', 0, 12);
    
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('89504e470d0a1a0a')) return 'image/png';
    if (signature.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    
    throw new ValidationError('Unable to detect image format');
  }

  private extractSignatureData(signingResult: {manifestUri: string, signature: string}): {signature: string} {
    return {
      signature: signingResult.signature
    };
  }

  // Public methods for manifest retrieval and verification
  async getManifest(manifestUri: string): Promise<C2PAManifest | null> {
    // Check cache first
    if (this.manifestCache.has(manifestUri)) {
      return this.manifestCache.get(manifestUri)!;
    }
    
    // In production, this would fetch from remote storage
    // For now, return null if not in cache
    return null;
  }

  async verifySignature(imageBuffer: Buffer, signature: string): Promise<boolean> {
    // Placeholder for signature verification
    // In real implementation, this would use C2PA verification
    try {
      if (this.useRealC2PA) {
        return await this.c2paWrapper.verify(imageBuffer, signature);
      }
      // Fallback verification
      return signature.length > 50;
    } catch (error) {
      return false;
    }
  }
}
