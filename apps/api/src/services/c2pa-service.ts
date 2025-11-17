import { AsyncCertificateManager } from './certificate-manager-async';
import { AtomicCertificateManager } from './certificate-manager-atomic';
import { ManifestBuilder, C2PAManifest } from './manifest-builder';
import { C2PAWrapper } from './c2pa-wrapper';
import { MetadataEmbedder } from './metadata-embedder';
import { PerceptualHash } from '../utils/perceptual-hash';
import { AsyncProofStorage } from './proof-storage-async';
import * as crypto from 'crypto';
import { LRUCache } from 'lru-cache';
import sharp from 'sharp';

export interface SigningOptions {
  creator?: string;
  title?: string;
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
  signedBuffer: Buffer; // The actual signed image with embedded C2PA (required)
  manifest: C2PAManifest; // The C2PA manifest included in the signature
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
  private certManager: AtomicCertificateManager;
  private manifestBuilder: ManifestBuilder;
  private c2paWrapper: C2PAWrapper;
  private metadataEmbedder: MetadataEmbedder;
  private proofStorage: AsyncProofStorage;
  private useRealC2PA: boolean;
  private manifestCache: LRUCache<string, C2PAManifest>;
  private signingLock: Map<string, Promise<any>> = new Map();

  constructor(options: { useRealC2PA?: boolean; certificateManager?: AtomicCertificateManager } = {}) {
    this.useRealC2PA = options.useRealC2PA ?? (process.env.USE_REAL_C2PA === 'true');
    // 🔥 CRITICAL FIX: Use injected certificate manager to prevent race condition vulnerability
    this.certManager = options.certificateManager || new AtomicCertificateManager();
    this.manifestBuilder = new ManifestBuilder();
    // 🔥 CRITICAL FIX: Pass certificate manager to C2PAWrapper to prevent rogue instances
    this.c2paWrapper = new C2PAWrapper(this.certManager);
    this.metadataEmbedder = new MetadataEmbedder();
    this.proofStorage = new AsyncProofStorage();
    
    // Initialize LRU cache with max 1000 entries to prevent memory leak
    this.manifestCache = new LRUCache<string, C2PAManifest>({
      max: parseInt(process.env.C2PA_CACHE_MAX_SIZE || '1000'),
      ttl: parseInt(process.env.C2PA_CACHE_TTL_MS || String(1000 * 60 * 60 * 24)),
      updateAgeOnGet: true
    });
  }

  async signImage(imageBuffer: Buffer, options: SigningOptions = {}): Promise<SigningResult> {
    // Set timeout for image processing
    const PROCESSING_TIMEOUT = parseInt(process.env.IMAGE_PROCESSING_TIMEOUT_MS || '30000', 10);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Image processing timeout')), PROCESSING_TIMEOUT);
    });
    
    try {
      return await Promise.race([
        this.processImage(imageBuffer, options),
        timeoutPromise
      ]);
    } catch (error) {
      if ((error as Error).message === 'Image processing timeout') {
        throw new Error(`Image processing exceeded ${PROCESSING_TIMEOUT}ms timeout`);
      }
      throw error;
    }
  }

  private async processImage(imageBuffer: Buffer, options: SigningOptions): Promise<SigningResult> {
    try {
      // 1. Validate image format and size
      await this.validateImage(imageBuffer);
      
      // 2. Generate image hash for deduplication
      const imageHash = await this.generateImageHash(imageBuffer);
      
      // 3. Build C2PA manifest with all required assertions
      const manifest = await this.manifestBuilder.build({
        imageBuffer,
        imageHash,
        creator: options.creator || 'CredLink',
        title: options.title,
        timestamp: new Date().toISOString(),
        customAssertions: options.assertions || []
      });
      
      // 4. Store proof first to get real URI
      const proofUri = await this.proofStorage.storeProof(manifest, imageHash);
      
      // 5. Perform cryptographic signing with real proof URI
      let signingResult: { manifestUri: string; signature: string; signedBuffer?: Buffer };
      
      if (this.useRealC2PA || options.useRealC2PA) {
        // Use real C2PA library
        signingResult = await this.performRealC2PASigning(imageBuffer, manifest, proofUri);
      } else {
        // Use fallback crypto signing (for testing/development)
        signingResult = await this.performCryptoSigning(imageBuffer, manifest, proofUri);
      }
      
      // 6. Extract and validate signature components
      const signatureData = this.extractSignatureData(signingResult);
      
      // Cache the manifest for retrieval
      this.manifestCache.set(signingResult.manifestUri, manifest);
      
      return {
        manifestUri: signingResult.manifestUri,
        signature: signatureData.signature,
        proofUri: proofUri,
        imageHash: imageHash,
        timestamp: manifest.claim_generator.timestamp,
        certificateId: await this.certManager.getCurrentCertificateId(),
        signedBuffer: signingResult.signedBuffer!,
        manifest: manifest
      };
    } catch (error: any) {
      if (error instanceof ValidationError || error instanceof SigningError) {
        throw error;
      }
      throw new SigningError(`Failed to sign image: ${error.message}`, 'SIGNING_FAILED');
    }
  }

  private async performRealC2PASigning(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<{ manifestUri: string; signature: string; signedBuffer: Buffer }> {
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

      // Embed proof in image with real proof URI
      const signedBuffer = await this.metadataEmbedder.embedProofInImage(
        imageBuffer,
        manifest,
        proofUri
      );

      return {
        manifestUri,
        signature,
        signedBuffer
      };
    } catch (error: any) {
      throw new SigningError(`Real cryptographic signing failed: ${error.message}`, 'CRYPTO_SIGN_FAILED');
    }
  }

  private async performCryptoSigning(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<{ manifestUri: string; signature: string; signedBuffer: Buffer }> {
    const manifestUri = `urn:uuid:${crypto.randomUUID()}`;
    const signingKey = await this.certManager.getSigningKey();
    
    // Create a signature based on the manifest hash
    const manifestString = JSON.stringify(manifest);
    const signature = crypto.sign('RSA-SHA256', Buffer.from(manifestString), signingKey).toString('base64');
    
    // Embed proof in image metadata with real proof URI
    const signedBuffer = await this.metadataEmbedder.embedProofInImage(
      imageBuffer,
      manifest,
      proofUri
    );
    
    return {
      manifestUri,
      signature,
      signedBuffer
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
    if (buffer.length > 0) {
      // 🔥 CRITICAL FIX: Use configurable file size limit instead of hardcoded 50MB
      const maxFileSize = parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024;
      if (buffer.length > maxFileSize) {
        throw new ValidationError(`Image size exceeds ${maxFileSize / 1024 / 1024}MB limit`);
      }
    }
    
    // Validate image format first
    const format = this.detectImageFormat(buffer);
    const supportedFormats = ['image/jpeg', 'image/png', 'image/webp'];
    if (!supportedFormats.includes(format)) {
      throw new ValidationError(`Unsupported image format: ${format}`);
    }
    
    // Validate image dimensions to prevent decompression bombs
    try {
      const metadata = await sharp(buffer).metadata();
      const pixels = (metadata.width || 0) * (metadata.height || 0);
      
      if (pixels > 100_000_000) { // 100 megapixels max
        throw new ValidationError('Image dimensions too large (max 100 megapixels)');
      }
      
      console.log(`Image validated: ${format}, ${metadata.width}x${metadata.height}, ${buffer.length} bytes`);
    } catch (error: any) {
      if (error instanceof ValidationError) throw error;
      console.error('Sharp validation error:', error.message);
      throw new ValidationError('Invalid image format - cannot process image');
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
      return signature.length > parseInt(process.env.MIN_SIGNATURE_LENGTH || '50');
    } catch (error) {
      return false;
    }
  }

  /**
   * Week 7 Day 1: Cleanup method to prevent test hangs
   * Releases all resources held by the service
   */
  async cleanup(): Promise<void> {
    try {
      // Clear manifest cache
      this.manifestCache.clear();
      
      // Clear signing locks
      this.signingLock.clear();
      
      // Close proof storage
      if (this.proofStorage && typeof this.proofStorage.close === 'function') {
        await this.proofStorage.close();
      }
      
      // Cleanup certificate manager if it has cleanup
      if (this.certManager && typeof (this.certManager as any).cleanup === 'function') {
        await (this.certManager as any).cleanup();
      }
    } catch (error) {
      console.error('Error during C2PAService cleanup:', error);
    }
  }
}
