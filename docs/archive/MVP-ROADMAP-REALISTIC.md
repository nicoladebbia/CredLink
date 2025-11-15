# CredLink MVP Roadmap - Realistic 16-Week Plan

**Owner:** Development Team
**Timeline:** 16 weeks (4 months)
**Target Launch:** MVP with 10-20 beta customers and $1-5K MRR validation
**Current State:** Backend is 12% implemented, infrastructure is designed but not deployed
**Scope:** Focus ONLY on core signing/verification flow, cut everything else

---

## **HONEST MVP DEFINITION**

MVP = Minimum Viable Product that proves:
1. ✅ We can cryptographically sign images (real C2PA, not mock)
2. ✅ We can verify signatures work (real validation, not fake)
3. ✅ Proofs survive format changes and compression
4. ✅ Infrastructure is deployed and reliable (99.9% uptime)
5. ✅ First paying customers validate the problem is real

**What's NOT in MVP:**
- ❌ Quantum AI, metaverse, Web3 (fiction)
- ❌ WordPress plugin, Shopify app, mobile SDKs
- ❌ Regulatory capture, government contracts
- ❌ 95% market share, IPO, $1B valuation
- ❌ Advanced features like AI generation detection

**What IS in MVP:**
- ✅ POST /sign endpoint (real signing)
- ✅ POST /verify endpoint (real verification)
- ✅ Cloudflare/AWS proof storage
- ✅ Web dashboard (beta customers only)
- ✅ API documentation
- ✅ Survival testing (JPEG compression, format conversion)
- ✅ 10+ beta customers paying $100-500/month each

---

## **PHASE 1: BACKEND IMPLEMENTATION (Weeks 1-6)**

### **Week 1-2: Real C2PA Signing** ⏱️ 10 days

**Goal:** Replace mock crypto with real C2PA signing

#### Tasks:

**Day 1-2: Research & Library Integration**

**Comprehensive Library Evaluation Framework:**
- [ ] **Option 1: @adobe/c2pa (Node.js)**
  - **Pros:** Official Adobe implementation, active maintenance, comprehensive documentation
  - **Cons:** Node.js only, potential performance limitations, dependency chain complexity
  - **Performance Metrics to Test:** Signing speed (ms), memory usage (MB), bundle size impact
  - **Integration Complexity:** Low - npm install, direct TypeScript support
  - **License:** MIT - commercially friendly
  - **Community Activity:** 200+ GitHub stars, 10+ contributors, last update < 30 days
  - **Testing Required:** Benchmark with 1MB, 5MB, 10MB images

- [ ] **Option 2: c2pa-rust (Rust bindings)**
  - **Pros:** Superior performance, memory safety, smaller binary size
  - **Cons:** Requires Rust toolchain, NAPI compilation complexity, potential platform issues
  - **Performance Metrics to Test:** Expected 2-3x faster than Node.js version
  - **Integration Complexity:** High - requires Rust compiler, NAPI setup, cross-platform testing
  - **License:** Apache 2.0 - commercially friendly
  - **Community Activity:** 150+ GitHub stars, Rust community backing
  - **Testing Required:** Cross-platform compilation (macOS, Linux, Windows), memory leak testing

- [ ] **Option 3: Native C++ Implementation via Node-FFI**
  - **Pros:** Maximum performance, full control over implementation
  - **Cons:** Highest complexity, maintenance burden, security considerations
  - **Performance Metrics to Test:** Expected 3-5x faster than pure Node.js
  - **Integration Complexity:** Very High - C++ compilation, FFI binding, memory management
  - **License:** Custom implementation required
  - **Testing Required:** Memory safety, buffer overflows, exception handling

**Decision Matrix:**
```
Criteria (Weight)    Adobe C2PA    Rust C2PA    Native C++
Performance (30%)        7/10         9/10        10/10
Integration (25%)        9/10         6/10         3/10
Maintenance (20%)        8/10         7/10         4/10
Documentation (15%)      9/10         7/10         2/10
Community (10%)          8/10         7/10         1/10
Weighted Score:           7.95         7.15         5.05
```

**Recommendation:** Start with @adobe/c2pa for MVP speed, plan Rust migration for V2

**Day 1-2 Implementation Tasks:**
- [ ] **Environment Setup:**
  ```bash
  # Install Adobe C2PA
  pnpm add @adobe/c2pa @adobe/c2pa-wc
  pnpm add -D @types/node sharp crypto
  
  # Test installation
  node -e "require('@adobe/c2pa'); console.log('C2PA loaded successfully')"
  ```
- [ ] **Development Certificate Generation:**
  ```bash
  # Create test CA
  openssl genrsa -out ca-key.pem 4096
  openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem
  
  # Create signing certificate
  openssl genrsa -out signing-key.pem 2048
  openssl req -new -key signing-key.pem -out signing-csr.pem
  openssl x509 -req -days 365 -in signing-csr.pem -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial -out signing-cert.pem
  ```
- [ ] **Certificate Storage Strategy:**
  - Development: Environment variables (SIGNING_CERT, SIGNING_KEY)
  - Production: AWS KMS or Cloudflare KMS for key management
  - Rotation: Automated rotation every 90 days
- [ ] **Initial Integration Test:**
  ```typescript
  import { C2PA } from '@adobe/c2pa';
  
  const c2pa = new C2PA();
  const testResult = await c2pa.sign({
    buffer: testImageBuffer,
    manifest: {
      title: 'Test Image',
      format: 'image/jpeg',
      ingredients: [],
      assertions: []
    }
  });
  console.log('C2PA integration successful:', testResult.manifest);
  ```

**Day 3-5: Implement Real Signing**

**Detailed Implementation Plan:**

**Step 1: Replace Mock Signing Service**
```typescript
// OLD MOCK CODE (to be removed):
async signImage(imageBuffer: Buffer): Promise<SigningResult> {
  const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
  return {
    manifestUri: `urn:uuid:${generateUUID()}`,
    signature: 'mock-signature',
    proofUri: `https://api.credlink.com/proof/${hash}`
  };
}

// NEW REAL IMPLEMENTATION:
import { C2PA } from '@adobe/c2pa';
import { CertificateManager } from './certificate-manager';
import { ManifestBuilder } from './manifest-builder';

export class C2PAService {
  private c2pa: C2PA;
  private certManager: CertificateManager;
  private manifestBuilder: ManifestBuilder;

  constructor() {
    this.c2pa = new C2PA({
      // C2PA configuration options
      sign_cert: process.env.SIGNING_CERTIFICATE,
      private_key: process.env.SIGNING_PRIVATE_KEY,
      tsa_url: process.env.TIMESTAMP_AUTHORITY_URL
    });
    this.certManager = new CertificateManager();
    this.manifestBuilder = new ManifestBuilder();
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
      const signingResult = await this.c2pa.sign({
        buffer: imageBuffer,
        manifest: manifest,
        format: this.detectImageFormat(imageBuffer)
      });
      
      // 5. Extract and validate signature components
      const signatureData = this.extractSignatureData(signingResult);
      
      // 6. Store proof remotely
      const proofUri = await this.storeProof(manifest, imageHash);
      
      return {
        manifestUri: signingResult.manifestUri,
        signature: signatureData.signature,
        proofUri: proofUri,
        imageHash: imageHash,
        timestamp: manifest.claim_generator.timestamp,
        certificateId: this.certManager.getCurrentCertificateId()
      };
    } catch (error) {
      throw new SigningError(`Failed to sign image: ${error.message}`, error.code);
    }
  }

  private validateImage(buffer: Buffer): void {
    if (!Buffer.isBuffer(buffer)) {
      throw new ValidationError('Image must be a Buffer');
    }
    if (buffer.length === 0) {
      throw new ValidationError('Image cannot be empty');
    }
    if (buffer.length > 50 * 1024 * 1024) { // 50MB limit
      throw new ValidationError('Image size exceeds 50MB limit');
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
    
    // Add perceptual hash for duplicate detection
    const perceptualHash = await this.generatePerceptualHash(buffer);
    
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
}
```

**Step 2: CertificateManager Implementation**
```typescript
import { KMS } from 'aws-sdk';
import * as crypto from 'crypto';
import { readFileSync } from 'fs';

export class CertificateManager {
  private kms: KMS;
  private currentCertificate: Certificate;
  private rotationInterval: number = 90 * 24 * 60 * 60 * 1000; // 90 days

  constructor() {
    this.kms = new KMS({ region: process.env.AWS_REGION });
    this.loadCurrentCertificate();
    this.scheduleRotation();
  }

  async getCurrentCertificate(): Promise<Certificate> {
    if (!this.currentCertificate || this.isCertificateExpired(this.currentCertificate)) {
      await this.rotateCertificate();
    }
    return this.currentCertificate;
  }

  async getSigningKey(): Promise<crypto.KeyObject> {
    if (process.env.NODE_ENV === 'production') {
      // In production, use AWS KMS
      const keyId = process.env.KMS_KEY_ID;
      const response = await this.kms.decrypt({
        CiphertextBlob: Buffer.from(process.env.ENCRYPTED_PRIVATE_KEY, 'base64')
      }).promise();
      
      return crypto.createPrivateKey(response.Plaintext as string);
    } else {
      // In development, use environment variable or file
      const privateKeyPem = process.env.SIGNING_PRIVATE_KEY || 
                           readFileSync('./certs/signing-key.pem', 'utf8');
      return crypto.createPrivateKey(privateKeyPem);
    }
  }

  private async loadCurrentCertificate(): Promise<void> {
    try {
      const certPem = process.env.SIGNING_CERTIFICATE || 
                     readFileSync('./certs/signing-cert.pem', 'utf8');
      
      this.currentCertificate = {
        pem: certPem,
        fingerprint: this.generateCertificateFingerprint(certPem),
        expiresAt: this.extractExpirationDate(certPem),
        id: this.generateCertificateId(certPem)
      };
    } catch (error) {
      throw new CertificateError('Failed to load signing certificate', error);
    }
  }

  private async rotateCertificate(): Promise<void> {
    // Generate new certificate signing request
    const csr = await this.generateCSR();
    
    // Sign with internal CA (or external CA in production)
    const newCertificate = await this.signCSR(csr);
    
    // Update current certificate
    this.currentCertificate = newCertificate;
    
    // Store in secure location
    await this.storeCertificate(newCertificate);
    
    // Log rotation
    console.info(`Certificate rotated: ${newCertificate.id}`);
  }

  private scheduleRotation(): void {
    // Check rotation daily
    setInterval(async () => {
      if (this.shouldRotate()) {
        await this.rotateCertificate();
      }
    }, 24 * 60 * 60 * 1000);
  }

  getCurrentCertificateId(): string {
    return this.currentCertificate?.id || 'unknown';
  }
}
```

**Step 3: ManifestBuilder Implementation**
```typescript
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export class ManifestBuilder {
  async build(options: ManifestOptions): Promise<C2PAManifest> {
    const manifest: C2PAManifest = {
      claim_generator: {
        $id: `urn:uuid:${uuidv4()}`,
        name: 'CredLink Signing Service',
        version: '1.0.0',
        timestamp: options.timestamp
      },
      claim_data: [
        {
          label: 'stds.schema-org.CreativeWork',
          data: {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: options.title || 'Signed Image',
            author: {
              '@type': 'Organization',
              name: options.creator || 'CredLink'
            },
            dateCreated: options.timestamp,
            identifier: options.imageHash
          }
        },
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                when: options.timestamp,
                digitalSourceType: 'https://ns.adobe.com/c2pa/created/digital-source/unknown'
              }
            ]
          }
        },
        {
          label: 'c2pa.hash',
          data: {
            alg: 'sha256',
            value: options.imageHash.split(':')[1]
          }
        }
      ],
      assertions: await this.buildAssertions(options),
      ingredient: {
        recipe: [],
        ingredient: []
      }
    };

    // Add custom assertions if provided
    if (options.customAssertions && options.customAssertions.length > 0) {
      manifest.assertions.push(...options.customAssertions);
    }

    // Add technical metadata
    manifest.assertions.push({
      label: 'credlink.technical',
      data: {
        serviceVersion: process.env.SERVICE_VERSION || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        signingAlgorithm: 'RSA-SHA256',
        manifestFormat: 'CBOR',
        embeddingStrategy: 'JUMBF'
      }
    });

    return manifest;
  }

  private async buildAssertions(options: ManifestOptions): Promise<Assertion[]> {
    const assertions: Assertion[] = [];

    // Add content type assertion
    assertions.push({
      label: 'c2pa.content-type',
      data: {
        format: options.format || 'image/jpeg',
        mime_type: options.mimeType || 'image/jpeg'
      }
    });

    // Add dimensions assertion if image data available
    if (options.imageBuffer) {
      const dimensions = await this.getImageDimensions(options.imageBuffer);
      assertions.push({
        label: 'c2pa.dimensions',
        data: {
          width: dimensions.width,
          height: dimensions.height,
          unit: 'pixels'
        }
      });
    }

    // Add EXIF data assertion if present
    const exifData = await this.extractExifData(options.imageBuffer);
    if (exifData && Object.keys(exifData).length > 0) {
      assertions.push({
        label: 'c2pa.exif',
        data: exifData
      });
    }

    return assertions;
  }

  private async getImageDimensions(buffer: Buffer): Promise<{width: number, height: number}> {
    // Use sharp to extract dimensions
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  }

  private async extractExifData(buffer: Buffer): Promise<any> {
    // Extract relevant EXIF data for provenance
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();
    
    if (metadata.exif) {
      // Parse EXIF and return relevant fields
      return {
        make: metadata.exif.Make,
        model: metadata.exif.Model,
        dateTime: metadata.exif.DateTime,
        gpsCoordinates: metadata.exif.GPSLatitude && metadata.exif.GPSLongitude ? {
          latitude: metadata.exif.GPSLatitude,
          longitude: metadata.exif.GPSLongitude
        } : undefined
      };
    }
    
    return {};
  }
}
```

**Step 4: Comprehensive Unit Testing**
```typescript
// /apps/sign-service/src/tests/unit/c2pa-service.test.ts
import { C2PAService } from '../../services/c2pa-service';
import { readFileSync } from 'fs';
import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';

describe('C2PAService', () => {
  let service: C2PAService;
  let testImage: Buffer;

  beforeEach(() => {
    service = new C2PAService();
    testImage = readFileSync('./test-fixtures/images/test-image.jpg');
  });

  describe('signImage', () => {
    it('should sign a valid JPEG image', async () => {
      const result = await service.signImage(testImage);
      
      expect(result).to.have.property('manifestUri');
      expect(result).to.have.property('signature');
      expect(result).to.have.property('proofUri');
      expect(result).to.have.property('imageHash');
      expect(result).to.have.property('timestamp');
      expect(result).to.have.property('certificateId');
      
      expect(result.manifestUri).to.match(/^urn:uuid:/);
      expect(result.signature).to.be.a('string').with.length.greaterThan(50);
      expect(result.proofUri).to.match(/^https:\/\/proofs\.credlink\.com\//);
    });

    it('should include custom assertions in manifest', async () => {
      const customAssertions = [
        {
          label: 'test.assertion',
          data: { test: 'value' }
        }
      ];
      
      const result = await service.signImage(testImage, {
        assertions: customAssertions
      });
      
      // Verify custom assertion is included
      const manifest = await service.getManifest(result.manifestUri);
      expect(manifest.assertions).to.include.deep.members(customAssertions);
    });

    it('should handle different image formats', async () => {
      const pngImage = readFileSync('./test-fixtures/images/test-image.png');
      const webpImage = readFileSync('./test-fixtures/images/test-image.webp');
      
      const pngResult = await service.signImage(pngImage);
      const webpResult = await service.signImage(webpImage);
      
      expect(pngResult.manifestUri).to.be.a('string');
      expect(webpResult.manifestUri).to.be.a('string');
      expect(pngResult.manifestUri).to.not.equal(webpResult.manifestUri);
    });

    it('should reject oversized images', async () => {
      const largeImage = Buffer.alloc(60 * 1024 * 1024); // 60MB
      
      try {
        await service.signImage(largeImage);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error.name).to.equal('ValidationError');
        expect(error.message).to.include('exceeds 50MB limit');
      }
    });

    it('should reject unsupported formats', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4');
      
      try {
        await service.signImage(pdfBuffer);
        expect.fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error.name).to.equal('ValidationError');
        expect(error.message).to.include('Unsupported image format');
      }
    });

    it('should generate consistent hashes for identical images', async () => {
      const result1 = await service.signImage(testImage);
      const result2 = await service.signImage(testImage);
      
      expect(result1.imageHash).to.equal(result2.imageHash);
      expect(result1.manifestUri).to.not.equal(result2.manifestUri); // Different UUIDs
    });

    it('should handle signing errors gracefully', async () => {
      // Mock certificate failure
      const originalEnv = process.env.SIGNING_CERTIFICATE;
      delete process.env.SIGNING_CERTIFICATE;
      
      try {
        await service.signImage(testImage);
        expect.fail('Should have thrown SigningError');
      } catch (error) {
        expect(error.name).to.equal('SigningError');
      } finally {
        process.env.SIGNING_CERTIFICATE = originalEnv;
      }
    });
  });

  describe('Performance', () => {
    it('should sign images within 2 seconds', async () => {
      const startTime = Date.now();
      await service.signImage(testImage);
      const duration = Date.now() - startTime;
      
      expect(duration).to.be.lessThan(2000);
    });

    it('should handle concurrent signing requests', async () => {
      const promises = Array(10).fill(null).map(() => 
        service.signImage(testImage)
      );
      
      const results = await Promise.all(promises);
      expect(results).to.have.length(10);
      
      // Verify all results are unique
      const manifestUris = results.map(r => r.manifestUri);
      const uniqueUris = new Set(manifestUris);
      expect(uniqueUris.size).to.equal(10);
    });
  });
});
```

**Testing Strategy:**
- [ ] **Unit Tests (15+ scenarios):**
  - Basic signing functionality
  - Custom assertions handling
  - Multiple image formats
  - Error handling (invalid inputs, certificate issues)
  - Performance benchmarks
  - Concurrent request handling
  - Memory usage validation

- [ ] **Integration Tests (8+ scenarios):**
  - End-to-end signing flow
  - Certificate rotation
  - KMS integration
  - Remote proof storage

- [ ] **Security Tests (5+ scenarios):**
  - Malicious image inputs
  - Certificate validation
  - Private key security
  - Buffer overflow prevention

**Day 6-8: Real Image Embedding**

**Comprehensive Embedding Strategy:**

**Multiple Embedding Methods for Maximum Survival:**

**Method 1: JUMBF (JPEG Universal Metadata Box Format) - Primary**
```typescript
import { JUMBFBuilder } from './jumbf-builder';
import { CBOR } from 'cbor';

export class MetadataEmbedder {
  private jumbfBuilder: JUMBFBuilder;

  constructor() {
    this.jumbfBuilder = new JUMBFBuilder();
  }

  async embedProofInImage(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<Buffer> {
    const format = this.detectImageFormat(imageBuffer);
    
    switch (format) {
      case 'image/jpeg':
        return this.embedInJPEG(imageBuffer, manifest, proofUri);
      case 'image/png':
        return this.embedInPNG(imageBuffer, manifest, proofUri);
      case 'image/webp':
        return this.embedInWebP(imageBuffer, manifest, proofUri);
      default:
        throw new EmbeddingError(`Unsupported format for embedding: ${format}`);
    }
  }

  private async embedInJPEG(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<Buffer> {
    // 1. Serialize manifest to CBOR
    const manifestCbor = await CBOR.encode(manifest);
    
    // 2. Create JUMBF container
    const jumbfContainer = await this.jumbfBuilder.build({
      type: 'c2pa',
      label: 'CredLink Manifest',
      data: manifestCbor,
      request: proofUri
    });
    
    // 3. Embed using sharp with custom metadata
    const sharp = require('sharp');
    const metadata = await sharp(imageBuffer).metadata();
    
    // Preserve existing metadata
    const existingExif = metadata.exif || {};
    const existingXmp = metadata.xmp || {};
    
    // Add C2PA data to multiple locations for redundancy
    const processed = await sharp(imageBuffer)
      .withMetadata({
        exif: {
          ...existingExif,
          // EXIF UserComment (ASCII)
          UserComment: `CredLink:${proofUri}`,
          // Custom EXIF tag for manifest hash
          '0xC2PA': manifestCbor.toString('base64')
        },
        xmp: {
          ...existingXmp,
          // XMP sidecar for C2PA
          'c2pa:manifest': proofUri,
          'c2pa:signature': manifest.signature || '',
          'c2pa:timestamp': manifest.claim_generator.timestamp
        }
      })
      .toBuffer();
    
    // 4. Inject JUMBF container directly into JPEG structure
    return this.injectJUMBFIntoJPEG(processed, jumbfContainer);
  }

  private async injectJUMBFIntoJPEG(jpegBuffer: Buffer, jumbfContainer: Buffer): Promise<Buffer> {
    // Parse JPEG segments
    const segments = this.parseJPEGSegments(jpegBuffer);
    
    // Find APP1 segment (EXIF) or create new one
    const app1Index = segments.findIndex(s => s.marker === 0xFFE1);
    
    if (app1Index >= 0) {
      // Insert JUMBF after existing APP1
      segments.splice(app1Index + 1, 0, {
        marker: 0xFFE1, // APP1 segment
        data: jumbfContainer
      });
    } else {
      // Insert JUMBF after SOI (Start of Image)
      segments.splice(1, 0, {
        marker: 0xFFE1,
        data: jumbfContainer
      });
    }
    
    // Rebuild JPEG
    return this.rebuildJPEG(segments);
  }

  private parseJPEGSegments(buffer: Buffer): JPEGSegment[] {
    const segments: JPEGSegment[] = [];
    let offset = 0;
    
    // Skip SOI (Start of Image)
    if (buffer.readUInt16BE(offset) === 0xFFD8) {
      segments.push({ marker: 0xFFD8, data: Buffer.alloc(0) });
      offset += 2;
    }
    
    while (offset < buffer.length) {
      const marker = buffer.readUInt16BE(offset);
      offset += 2;
      
      // Stop at EOI (End of Image) or SOS (Start of Scan)
      if (marker === 0xFFD9 || marker === 0xFFDA) {
        segments.push({ marker, data: buffer.slice(offset) });
        break;
      }
      
      // Read segment length
      const length = buffer.readUInt16BE(offset);
      offset += 2;
      
      // Read segment data
      const data = buffer.slice(offset, offset + length - 2);
      offset += length - 2;
      
      segments.push({ marker, data });
    }
    
    return segments;
  }

  private rebuildJPEG(segments: JPEGSegment[]): Buffer {
    const buffers: Buffer[] = [];
    
    for (const segment of segments) {
      buffers.push(Buffer.from([segment.marker >> 8, segment.marker & 0xFF]));
      
      if (segment.data.length > 0) {
        buffers.push(Buffer.from([(segment.data.length + 2) >> 8, (segment.data.length + 2) & 0xFF]));
        buffers.push(segment.data);
      }
    }
    
    return Buffer.concat(buffers);
  }

  private async embedInPNG(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<Buffer> {
    // PNG embedding via custom chunks
    const manifestCbor = await CBOR.encode(manifest);
    
    // Create custom PNG chunks
    const c2paChunk = this.createPNGChunk('c2pA', manifestCbor);
    const credlinkChunk = this.createPNGChunk('crLn', Buffer.from(proofUri));
    
    // Insert chunks before IDAT (image data)
    return this.insertPNGChunks(imageBuffer, [c2paChunk, credlinkChunk], 'before', 'IDAT');
  }

  private createPNGChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = this.calculateCRC(Buffer.concat([typeBuffer, data]));
    
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  private calculateCRC(buffer: Buffer): number {
    // CRC-32 calculation for PNG chunks
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  private async embedInWebP(imageBuffer: Buffer, manifest: C2PAManifest, proofUri: string): Promise<Buffer> {
    // WebP embedding via extended chunks
    const manifestCbor = await CBOR.encode(manifest);
    
    // Parse WebP structure
    const riffHeader = imageBuffer.slice(0, 12);
    const chunks = this.parseWebPChunks(imageBuffer.slice(12));
    
    // Add C2PA chunk
    chunks.push({
      fourCC: 'C2PA',
      data: manifestCbor
    });
    
    chunks.push({
      fourCC: 'CRDL',
      data: Buffer.from(proofUri)
    });
    
    // Rebuild WebP
    return this.rebuildWebP(riffHeader, chunks);
  }
}
```

**JUMBF Builder Implementation:**
```typescript
export class JUMBFBuilder {
  async build(options: JUMBFOptions): Promise<Buffer> {
    const jumbf = {
      type: 'jumb',
      label: options.label,
      boxes: [
        {
          type: 'c2pa',
          label: 'C2PA Manifest',
          boxes: [
            {
              type: 'json',
              label: 'manifest',
              data: options.data
            },
            {
              type: 'url',
              label: 'proof',
              data: Buffer.from(options.request)
            }
          ]
        }
      ]
    };
    
    return this.serializeJUMBF(jumbf);
  }

  private async serializeJUMBF(jumbf: any): Promise<Buffer> {
    // Implement JUMBF serialization according to ISO 19566-5
    const superbox = this.createSuperBox(jumbf);
    return this.addLengthFields(superbox);
  }

  private createSuperBox(content: any): Buffer {
    // Create superbox with type, label, and content boxes
    const typeBox = this.createTypeBox(content.type);
    const labelBox = this.createLabelBox(content.label || '');
    const contentBoxes = content.boxes ? this.createContentBoxes(content.boxes) : Buffer.alloc(0);
    
    return Buffer.concat([typeBox, labelBox, contentBoxes]);
  }

  private createTypeBox(type: string): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(typeBuffer.length + 4, 0);
    
    return Buffer.concat([length, typeBuffer]);
  }

  private createLabelBox(label: string): Buffer {
    if (!label) return Buffer.alloc(0);
    
    const labelBuffer = Buffer.from(label, 'utf8');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(labelBuffer.length + 4, 0);
    
    return Buffer.concat([length, labelBuffer]);
  }
}
```

**Comprehensive Survival Testing Framework:**
```typescript
export class SurvivalTester {
  private testScenarios: TestScenario[] = [
    {
      name: 'JPEG Quality Reduction 75%',
      transform: (img) => sharp(img).jpeg({ quality: 75 }).toBuffer(),
      expectedSurvival: 0.95
    },
    {
      name: 'JPEG Quality Reduction 50%',
      transform: (img) => sharp(img).jpeg({ quality: 50 }).toBuffer(),
      expectedSurvival: 0.88
    },
    {
      name: 'JPEG Quality Reduction 25%',
      transform: (img) => sharp(img).jpeg({ quality: 25 }).toBuffer(),
      expectedSurvival: 0.70
    },
    {
      name: 'Format Conversion JPG → WebP',
      transform: (img) => sharp(img).webp({ quality: 80 }).toBuffer(),
      expectedSurvival: 0.92
    },
    {
      name: 'Format Conversion JPG → PNG',
      transform: (img) => sharp(img).png().toBuffer(),
      expectedSurvival: 0.95
    },
    {
      name: 'Resize 50% (maintain aspect)',
      transform: (img) => sharp(img).resize(0.5).toBuffer(),
      expectedSurvival: 0.60
    },
    {
      name: 'Resize 200% (maintain aspect)',
      transform: (img) => sharp(img).resize(2.0).toBuffer(),
      expectedSurvival: 0.60
    },
    {
      name: 'Crop 25% from center',
      transform: async (img) => {
        const metadata = await sharp(img).metadata();
        const width = Math.floor(metadata.width * 0.5);
        const height = Math.floor(metadata.height * 0.5);
        const left = Math.floor(metadata.width * 0.25);
        const top = Math.floor(metadata.height * 0.25);
        return sharp(img).extract({ left, top, width, height }).toBuffer();
      },
      expectedSurvival: 0.30
    },
    {
      name: 'Rotate 90 degrees',
      transform: (img) => sharp(img).rotate(90).toBuffer(),
      expectedSurvival: 0.85
    },
    {
      name: 'Gaussian Blur radius 2',
      transform: (img) => sharp(img).blur(2).toBuffer(),
      expectedSurvival: 0.40
    },
    {
      name: 'Sharpen moderate',
      transform: (img) => sharp(img).sharpen().toBuffer(),
      expectedSurvival: 0.70
    },
    {
      name: 'Add text watermark',
      transform: async (img) => {
        const { createCanvas } = require('canvas');
        const metadata = await sharp(img).metadata();
        const canvas = createCanvas(metadata.width, metadata.height);
        const ctx = canvas.getContext('2d');
        
        // Draw image
        const image = new Image();
        image.src = img;
        ctx.drawImage(image, 0, 0);
        
        // Add watermark
        ctx.font = '48px Arial';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fillText('Sample', 50, 50);
        
        return canvas.toBuffer();
      },
      expectedSurvival: 0.75
    },
    {
      name: 'Metadata stripping (exiftool)',
      transform: async (img) => {
        // Simulate metadata stripping
        return sharp(img).withMetadata({}).toBuffer();
      },
      expectedSurvival: 0.20 // Only remote proof survives
    },
    {
      name: 'Colorspace conversion RGB → Grayscale',
      transform: (img) => sharp(img).greyscale().toBuffer(),
      expectedSurvival: 0.80
    },
    {
      name: 'Gamma correction 2.2',
      transform: (img) => sharp(img).gamma(2.2).toBuffer(),
      expectedSurvival: 0.85
    },
    {
      name: 'Contrast enhancement +20%',
      transform: (img) => sharp(img).linear(1.2, 0).toBuffer(),
      expectedSurvival: 0.80
    },
    {
      name: 'Brightness adjustment +10%',
      transform: (img) => sharp(img).linear(1, 0.1).toBuffer(),
      expectedSurvival: 0.85
    },
    {
      name: 'Multiple transformations pipeline',
      transform: async (img) => {
        return sharp(img)
          .resize(0.8)
          .jpeg({ quality: 80 })
          .sharpen()
          .toBuffer();
      },
      expectedSurvival: 0.65
    }
  ];

  async runSurvivalTests(testImages: Buffer[]): Promise<SurvivalReport> {
    const results: TestResult[] = [];
    
    for (const scenario of this.testScenarios) {
      console.log(`Testing scenario: ${scenario.name}`);
      
      let survivedCount = 0;
      let totalCount = testImages.length;
      
      for (const image of testImages) {
        try {
          // Sign the original image
          const signedImage = await this.signService.signImage(image);
          
          // Apply transformation
          const transformedImage = await scenario.transform(signedImage.signedImage);
          
          // Try to verify
          const verification = await this.verifyService.verifyImage(transformedImage);
          
          if (verification.confidence > 30) { // Threshold for "survived"
            survivedCount++;
          }
        } catch (error) {
          console.error(`Failed for scenario ${scenario.name}:`, error.message);
        }
      }
      
      const survivalRate = survivedCount / totalCount;
      results.push({
        scenario: scenario.name,
        survivalRate,
        expectedSurvival: scenario.expectedSurvival,
        passed: survivalRate >= scenario.expectedSurvival * 0.9 // 10% tolerance
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      totalScenarios: this.testScenarios.length,
      results,
      averageSurvival: results.reduce((sum, r) => sum + r.survivalRate, 0) / results.length,
      passedScenarios: results.filter(r => r.passed).length
    };
  }
}
```

**Embedding Performance Optimization:**
```typescript
export class EmbeddingOptimizer {
  private readonly MAX_JUMBF_SIZE = 64 * 1024; // 64KB limit
  private readonly COMPRESSION_THRESHOLD = 1024; // Compress if > 1KB

  async optimizeEmbedding(manifest: C2PAManifest): Promise<OptimizedManifest> {
    // 1. Minimize manifest size
    const minimized = this.minimizeManifest(manifest);
    
    // 2. Compress if necessary
    const compressed = await this.compressIfNeeded(minimized);
    
    // 3. Choose embedding strategy based on size
    const strategy = this.selectEmbeddingStrategy(compressed);
    
    return {
      manifest: compressed,
      strategy,
      estimatedSize: this.estimateEmbeddedSize(compressed, strategy)
    };
  }

  private minimizeManifest(manifest: C2PAManifest): C2PAManifest {
    // Remove unnecessary fields
    const minimized = { ...manifest };
    
    // Remove redundant assertions
    minimized.assertions = this.deduplicateAssertions(minimized.assertions);
    
    // Shorten field names
    minimized.claim_generator.name = 'CL';
    
    // Remove optional fields
    delete minimized.claim_generator.description;
    
    return minimized;
  }

  private async compressIfNeeded(manifest: C2PAManifest): Promise<C2PAManifest> {
    const serialized = JSON.stringify(manifest);
    
    if (serialized.length > this.COMPRESSION_THRESHOLD) {
      // Use gzip compression for large manifests
      const compressed = await this.gzipCompress(serialized);
      
      return {
        ...manifest,
        _compressed: true,
        _originalSize: serialized.length,
        _compressedSize: compressed.length,
        _data: compressed
      } as any;
    }
    
    return manifest;
  }

  private selectEmbeddingStrategy(manifest: C2PAManifest): EmbeddingStrategy {
    const size = JSON.stringify(manifest).length;
    
    if (size < 1024) {
      return 'EXIF_ONLY';
    } else if (size < 8192) {
      return 'XMP_PRIMARY';
    } else if (size < this.MAX_JUMBF_SIZE) {
      return 'JUMBF_PRIMARY';
    } else {
      return 'REMOTE_ONLY';
    }
  }
}
```

**Testing & Integration:**
- [ ] **Embedding Tests (20+ scenarios):**
  - JUMBF injection accuracy
  - EXIF data preservation
  - XMP metadata integrity
  - Format-specific embedding
  - Size optimization
  - Performance benchmarks

- [ ] **Survival Tests (18 scenarios):**
  - All transformations listed above
  - Real-world CDN simulation
  - Social media platform tests
  - Email attachment tests

- [ ] **Recovery Tests:**
  - Partial metadata extraction
  - Corrupted manifest handling
  - Fallback to remote proof
  - Multiple extraction methods

**Day 9-10: Testing & Integration**
- [ ] End-to-end test: Upload → Sign → Verify structure
- [ ] Test manifest is correctly embedded
- [ ] Test manifest can be extracted
- [ ] Performance check (sign should be <2s)

**Acceptance Criteria:**
- ✅ Real C2PA signature (not SHA256 hash)
- ✅ Signature validates with public certificate
- ✅ Manifest is embedded in image EXIF/XMP/JUMBF
- ✅ `pnpm test` passes all signing tests (25+ tests)
- ✅ Signs test image < 2 seconds
- ✅ Embedding survives 85% of transformations
- ✅ Remote proof always accessible (99.9% uptime)
- ✅ Multiple embedding strategies working (JUMBF, XMP, EXIF)
- ✅ Size optimization implemented
- ✅ Performance benchmarks met

**Deliverables:**
- `/apps/sign-service/src/services/c2pa-service.ts` (real implementation)
- `/apps/sign-service/src/services/certificate-manager.ts` (new)
- `/apps/sign-service/src/services/manifest-builder.ts` (new)
- `/apps/sign-service/src/services/metadata-embedder.ts` (new)
- `/apps/sign-service/src/services/jumbf-builder.ts` (new)
- `/apps/sign-service/src/services/embedding-optimizer.ts` (new)
- `/apps/sign-service/src/services/survival-tester.ts` (new)
- `/apps/sign-service/src/tests/unit/c2pa-service.test.ts` (comprehensive tests)
- `/apps/sign-service/src/tests/unit/embedding.test.ts` (new)
- `/apps/sign-service/src/tests/survival/survival-rates.test.ts` (new)
- `/apps/sign-service/SURVIVAL-REPORT.md` (actual measured rates)

---

### **Week 2-3: Real Metadata Extraction & Verification** ⏱️ 10 days

**Goal:** Extract real manifests from images and validate them cryptographically

#### Tasks:

**Day 1-3: Advanced Metadata Extraction Framework**

**Multi-Format Extraction Strategy:**
```typescript
import { ExifParser } from 'exif-parser';
import { XMLParser } from 'fast-xml-parser';
import { CBOR } from 'cbor';

export class MetadataExtractor {
  private exifParser: ExifParser;
  private xmlParser: XMLParser;
  private cborDecoder: CBOR;

  constructor() {
    this.exifParser = new ExifParser();
    this.xmlParser = new XMLParser({ ignoreAttributes: false });
    this.cborDecoder = new CBOR();
  }

  async extractManifest(imageBuffer: Buffer): Promise<ExtractionResult> {
    const format = this.detectImageFormat(imageBuffer);
    const extractionMethods = this.getExtractionMethods(format);
    
    const results: Partial<Manifest>[] = [];
    const sources: ExtractionSource[] = [];
    
    // Try all extraction methods in parallel
    const extractionPromises = extractionMethods.map(async method => {
      try {
        const result = await this.extractWithMethod(imageBuffer, method);
        if (result.manifest) {
          results.push(result.manifest);
          sources.push({
            method: method.type,
            confidence: result.confidence,
            metadata: result.metadata
          });
        }
      } catch (error) {
        console.warn(`Extraction method ${method.type} failed:`, error.message);
      }
    });
    
    await Promise.all(extractionPromises);
    
    // Merge and validate results
    const mergedManifest = this.mergeManifests(results);
    const confidence = this.calculateExtractionConfidence(sources);
    
    return {
      manifest: mergedManifest,
      confidence,
      sources,
      extractionMethod: this.selectBestExtraction(sources)
    };
  }

  private getExtractionMethods(format: string): ExtractionMethod[] {
    const baseMethods = [
      { type: 'JUMBF', priority: 1 },
      { type: 'XMP', priority: 2 },
      { type: 'EXIF', priority: 3 },
      { type: 'CUSTOM_TAGS', priority: 4 }
    ];
    
    // Format-specific methods
    switch (format) {
      case 'image/jpeg':
        return [
          ...baseMethods,
          { type: 'JPEG_SEGMENTS', priority: 5 },
          { type: 'APP1_C2PA', priority: 6 }
        ];
      case 'image/png':
        return [
          ...baseMethods,
          { type: 'PNG_CHUNKS', priority: 5 },
          { type: 'CUSTOM_PNG_CHUNKS', priority: 6 }
        ];
      case 'image/webp':
        return [
          ...baseMethods,
          { type: 'WEBP_CHUNKS', priority: 5 },
          { type: 'RIFF_EXTENDED', priority: 6 }
        ];
      default:
        return baseMethods;
    }
  }

  private async extractWithMethod(imageBuffer: Buffer, method: ExtractionMethod): Promise<MethodResult> {
    switch (method.type) {
      case 'JUMBF':
        return this.extractFromJUMBF(imageBuffer);
      case 'XMP':
        return this.extractFromXMP(imageBuffer);
      case 'EXIF':
        return this.extractFromEXIF(imageBuffer);
      case 'JPEG_SEGMENTS':
        return this.extractFromJPEGSegments(imageBuffer);
      case 'PNG_CHUNKS':
        return this.extractFromPNGChunks(imageBuffer);
      case 'WEBP_CHUNKS':
        return this.extractFromWebPChunks(imageBuffer);
      default:
        throw new ExtractionError(`Unsupported extraction method: ${method.type}`);
    }
  }

  private async extractFromJUMBF(imageBuffer: Buffer): Promise<MethodResult> {
    // Parse JPEG segments to find JUMBF container
    const segments = this.parseJPEGSegments(imageBuffer);
    
    for (const segment of segments) {
      if (segment.marker === 0xFFE1) { // APP1 segment
        try {
          const jumbfData = this.parseJUMBFContainer(segment.data);
          const manifest = await this.decodeJUMBFManifest(jumbfData);
          
          return {
            manifest,
            confidence: 0.95,
            metadata: {
              containerType: 'JUMBF',
              size: segment.data.length,
              location: 'APP1'
            }
          };
        } catch (error) {
          continue; // Try next segment
        }
      }
    }
    
    return { manifest: null, confidence: 0 };
  }

  private async extractFromXMP(imageBuffer: Buffer): Promise<MethodResult> {
    const sharp = require('sharp');
    const metadata = await sharp(imageBuffer).metadata();
    
    if (!metadata.xmp) {
      return { manifest: null, confidence: 0 };
    }
    
    // Parse XMP for C2PA data
    const xmpData = this.xmlParser.parse(metadata.xmp);
    const c2paData = this.extractC2PAFromXMP(xmpData);
    
    if (c2paData && c2paData.manifest) {
      return {
        manifest: c2paData.manifest,
        confidence: 0.85,
        metadata: {
          containerType: 'XMP',
          hasProofUri: !!c2paData.proofUri,
          hasSignature: !!c2paData.signature
        }
      };
    }
    
    return { manifest: null, confidence: 0 };
  }

  private async extractFromEXIF(imageBuffer: Buffer): Promise<MethodResult> {
    const sharp = require('sharp');
    const metadata = await sharp(imageBuffer).metadata();
    
    if (!metadata.exif) {
      return { manifest: null, confidence: 0 };
    }
    
    // Check for custom EXIF tags
    const exifData = this.exifParser.parse(metadata.exif);
    const credlinkData = exifData.tags?.['0xC2PA'];
    const userComment = exifData.tags?.UserComment;
    
    let manifest = null;
    let confidence = 0;
    
    if (credlinkData) {
      try {
        // Decode base64 CBOR data
        const cborData = Buffer.from(credlinkData, 'base64');
        manifest = await this.cborDecoder.decode(cborData);
        confidence = 0.80;
      } catch (error) {
        console.warn('Failed to decode CBOR from EXIF:', error.message);
      }
    }
    
    // Fallback: extract proof URI from user comment
    if (!manifest && userComment && userComment.includes('CredLink:')) {
      const proofUri = userComment.split('CredLink:')[1];
      
      // Fetch manifest from remote proof
      try {
        manifest = await this.fetchRemoteManifest(proofUri);
        confidence = 0.70; // Lower confidence for remote-only
      } catch (error) {
        console.warn('Failed to fetch remote manifest:', error.message);
      }
    }
    
    return {
      manifest,
      confidence,
      metadata: {
        containerType: 'EXIF',
        hasCustomTags: !!credlinkData,
        hasUserComment: !!userComment
      }
    };
  }

  private async extractFromJPEGSegments(imageBuffer: Buffer): Promise<MethodResult> {
    const segments = this.parseJPEGSegments(imageBuffer);
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Look for C2PA-specific markers
      if (segment.data.length > 4) {
        const signature = segment.data.toString('ascii', 0, 4);
        
        if (signature === 'c2pa' || signature === 'C2PA') {
          try {
            const manifestData = segment.data.slice(4);
            const manifest = await this.cborDecoder.decode(manifestData);
            
            return {
              manifest,
              confidence: 0.90,
              metadata: {
                containerType: 'JPEG_CUSTOM',
                segmentIndex: i,
                marker: segment.marker.toString(16)
              }
            };
          } catch (error) {
            continue;
          }
        }
      }
    }
    
    return { manifest: null, confidence: 0 };
  }

  private async extractFromPNGChunks(imageBuffer: Buffer): Promise<MethodResult> {
    const chunks = this.parsePNGChunks(imageBuffer);
    
    for (const chunk of chunks) {
      if (chunk.type === 'c2pA' || chunk.type === 'crLn') {
        try {
          if (chunk.type === 'c2pA') {
            const manifest = await this.cborDecoder.decode(chunk.data);
            return {
              manifest,
              confidence: 0.90,
              metadata: {
                containerType: 'PNG_CHUNK',
                chunkType: chunk.type,
                size: chunk.data.length
              }
            };
          } else if (chunk.type === 'crLn') {
            // CredLink chunk contains proof URI
            const proofUri = chunk.data.toString('utf8');
            const manifest = await this.fetchRemoteManifest(proofUri);
            
            return {
              manifest,
              confidence: 0.70,
              metadata: {
                containerType: 'PNG_REMOTE',
                proofUri: proofUri
              }
            };
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return { manifest: null, confidence: 0 };
  }

  private async extractFromWebPChunks(imageBuffer: Buffer): Promise<MethodResult> {
    const chunks = this.parseWebPChunks(imageBuffer);
    
    for (const chunk of chunks) {
      if (chunk.fourCC === 'C2PA' || chunk.fourCC === 'CRDL') {
        try {
          if (chunk.fourCC === 'C2PA') {
            const manifest = await this.cborDecoder.decode(chunk.data);
            return {
              manifest,
              confidence: 0.90,
              metadata: {
                containerType: 'WEBP_CHUNK',
                chunkType: chunk.fourCC,
                size: chunk.data.length
              }
            };
          } else if (chunk.fourCC === 'CRDL') {
            const proofUri = chunk.data.toString('utf8');
            const manifest = await this.fetchRemoteManifest(proofUri);
            
            return {
              manifest,
              confidence: 0.70,
              metadata: {
                containerType: 'WEBP_REMOTE',
                proofUri: proofUri
              }
            };
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return { manifest: null, confidence: 0 };
  }

  private mergeManifests(manifests: Partial<Manifest>[]): Manifest | null {
    if (manifests.length === 0) return null;
    if (manifests.length === 1) return manifests[0] as Manifest;
    
    // Merge manifests, preferring higher confidence data
    const merged: Manifest = {
      claim_generator: manifests[0].claim_generator,
      claim_data: [],
      assertions: [],
      ingredient: { recipe: [], ingredient: [] }
    };
    
    // Merge claim data
    const claimDataMap = new Map();
    for (const manifest of manifests) {
      if (manifest.claim_data) {
        for (const claim of manifest.claim_data) {
          claimDataMap.set(claim.label, claim.data);
        }
      }
    }
    merged.claim_data = Array.from(claimDataMap.entries()).map(([label, data]) => ({ label, data }));
    
    // Merge assertions (deduplicate by label)
    const assertionMap = new Map();
    for (const manifest of manifests) {
      if (manifest.assertions) {
        for (const assertion of manifest.assertions) {
          assertionMap.set(assertion.label, assertion.data);
        }
      }
    }
    merged.assertions = Array.from(assertionMap.entries()).map(([label, data]) => ({ label, data }));
    
    return merged;
  }

  private calculateExtractionConfidence(sources: ExtractionSource[]): number {
    if (sources.length === 0) return 0;
    
    // Weight by extraction method reliability
    const weights = {
      'JUMBF': 0.95,
      'XMP': 0.85,
      'EXIF': 0.80,
      'JPEG_SEGMENTS': 0.90,
      'PNG_CHUNKS': 0.90,
      'WEBP_CHUNKS': 0.90,
      'CUSTOM_TAGS': 0.70
    };
    
    let totalWeight = 0;
    let weightedConfidence = 0;
    
    for (const source of sources) {
      const weight = weights[source.method] || 0.5;
      totalWeight += weight;
      weightedConfidence += source.confidence * weight;
    }
    
    return totalWeight > 0 ? weightedConfidence / totalWeight : 0;
  }

  private selectBestExtraction(sources: ExtractionSource[]): ExtractionSource | null {
    if (sources.length === 0) return null;
    
    return sources.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }
}
```

**Advanced Certificate Validation Framework:**
```typescript
import { X509Certificate } from 'crypto';
import { OCSPClient } from 'ocsp';
import { CRLClient } from 'crl';

export class CertificateValidator {
  private trustedRoots: X509Certificate[];
  private ocspClient: OCSPClient;
  private crlClient: CRLClient;
  private certificateCache: Map<string, CachedCertificate> = new Map();

  constructor() {
    this.trustedRoots = this.loadTrustedRootCertificates();
    this.ocspClient = new OCSPClient();
    this.crlClient = new CRLClient();
  }

  async validateCertificateChain(certificateChain: X509Certificate[]): Promise<ValidationResult> {
    const results: CertificateValidationResult[] = [];
    
    for (let i = 0; i < certificateChain.length; i++) {
      const cert = certificateChain[i];
      const issuer = i > 0 ? certificateChain[i - 1] : null;
      
      const result = await this.validateSingleCertificate(cert, issuer);
      results.push(result);
      
      if (!result.isValid) {
        break; // Chain is broken
      }
    }
    
    const chainValid = results.every(r => r.isValid) && this.validateChainStructure(certificateChain);
    
    return {
      isValid: chainValid,
      certificateResults: results,
      chainLength: certificateChain.length,
      rootTrusted: this.isRootTrusted(certificateChain[certificateChain.length - 1]),
      timestamp: new Date().toISOString()
    };
  }

  private async validateSingleCertificate(cert: X509Certificate, issuer: X509Certificate | null): Promise<CertificateValidationResult> {
    const cacheKey = cert.fingerprint;
    
    // Check cache first
    if (this.certificateCache.has(cacheKey)) {
      const cached = this.certificateCache.get(cacheKey)!;
      if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
        return cached.result;
      }
    }
    
    const result: CertificateValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      checks: {}
    };
    
    // 1. Check expiration
    const now = new Date();
    if (cert.validFrom > now) {
      result.isValid = false;
      result.errors.push('Certificate not yet valid');
    }
    if (cert.validTo < now) {
      result.isValid = false;
      result.errors.push('Certificate has expired');
    }
    result.checks.expiration = cert.validFrom <= now && cert.validTo >= now;
    
    // 2. Check signature
    if (issuer) {
      try {
        const signatureValid = crypto.verify('sha256', cert.raw, issuer.publicKey, cert.signature);
        result.checks.signature = signatureValid;
        if (!signatureValid) {
          result.isValid = false;
          result.errors.push('Invalid certificate signature');
        }
      } catch (error) {
        result.isValid = false;
        result.errors.push('Signature verification failed');
      }
    }
    
    // 3. Check revocation (OCSP)
    try {
      const ocspResult = await this.checkOCSP(cert, issuer);
      result.checks.ocsp = ocspResult.valid;
      result.ocspResponse = ocspResult.response;
      
      if (!ocspResult.valid) {
        result.isValid = false;
        result.errors.push('Certificate revoked (OCSP)');
      }
    } catch (error) {
      result.warnings.push('OCSP check failed');
    }
    
    // 4. Check CRL if OCSP fails
    if (!result.checks.ocsp) {
      try {
        const crlResult = await this.checkCRL(cert);
        result.checks.crl = !crlResult.revoked;
        
        if (crlResult.revoked) {
          result.isValid = false;
          result.errors.push('Certificate revoked (CRL)');
        }
      } catch (error) {
        result.warnings.push('CRL check failed');
      }
    }
    
    // 5. Check key usage
    const keyUsage = this.checkKeyUsage(cert);
    result.checks.keyUsage = keyUsage.valid;
    if (!keyUsage.valid) {
      result.isValid = false;
      result.errors.push(`Invalid key usage: ${keyUsage.reason}`);
    }
    
    // 6. Check basic constraints
    const constraints = this.checkBasicConstraints(cert);
    result.checks.basicConstraints = constraints.valid;
    if (!constraints.valid) {
      result.warnings.push(`Basic constraints issue: ${constraints.reason}`);
    }
    
    // Cache result
    this.certificateCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
    
    return result;
  }

  private async checkOCSP(cert: X509Certificate, issuer: X509Certificate | null): Promise<OCSPResult> {
    if (!issuer) {
      return { valid: false, response: null };
    }
    
    try {
      const ocspRequest = this.ocspClient.request(cert, issuer);
      const ocspResponse = await this.ocspClient.request(ocspRequest);
      
      return {
        valid: ocspResponse.type === 'good',
        response: ocspResponse
      };
    } catch (error) {
      return { valid: false, response: null, error: error.message };
    }
  }

  private async checkCRL(cert: X509Certificate): Promise<CRLResult> {
    try {
      const crlUrl = this.getCRLDistributionPoint(cert);
      if (!crlUrl) {
        return { revoked: false, error: 'No CRL distribution point' };
      }
      
      const crl = await this.crlClient.fetch(crlUrl);
      const revoked = crl.isRevoked(cert.serialNumber);
      
      return { revoked, crl };
    } catch (error) {
      return { revoked: false, error: error.message };
    }
  }

  private checkKeyUsage(cert: X509Certificate): KeyUsageResult {
    const keyUsage = cert.keyUsage;
    
    if (!keyUsage) {
      return { valid: false, reason: 'No key usage extension' };
    }
    
    // For signing certificates, require digitalSignature
    if (!keyUsage.digitalSignature) {
      return { valid: false, reason: 'Digital signature not permitted' };
    }
    
    return { valid: true };
  }

  private checkBasicConstraints(cert: X509Certificate): BasicConstraintsResult {
    const constraints = cert.basicConstraints;
    
    if (!constraints) {
      return { valid: false, reason: 'No basic constraints extension' };
    }
    
    // Check path length if CA
    if (constraints.ca && constraints.pathLenConstraint !== undefined) {
      if (constraints.pathLenConstraint < 0) {
        return { valid: false, reason: 'Invalid path length constraint' };
      }
    }
    
    return { valid: true };
  }

  private validateChainStructure(chain: X509Certificate[]): boolean {
    if (chain.length < 2) return false;
    
    // Check that each certificate signs the next one
    for (let i = 0; i < chain.length - 1; i++) {
      const subject = chain[i];
      const issuer = chain[i + 1];
      
      if (subject.issuer !== issuer.subject) {
        return false;
      }
    }
    
    return true;
  }

  private isRootTrusted(rootCert: X509Certificate): boolean {
    return this.trustedRoots.some(trusted => 
      trusted.fingerprint === rootCert.fingerprint
    );
  }
}
```

**Cryptographic Signature Verification:**
```typescript
import { createVerify, createHash } from 'crypto';
import { ASN1Parser } from 'asn1-parser';

export class SignatureVerifier {
  async verifySignature(manifest: Manifest, signature: string, certificate: X509Certificate): Promise<SignatureVerificationResult> {
    try {
      // 1. Prepare manifest data for verification
      const manifestData = this.prepareManifestData(manifest);
      
      // 2. Decode signature
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      // 3. Parse signature to extract algorithm and parameters
      const signatureInfo = this.parseSignature(signatureBuffer);
      
      // 4. Create verifier with correct algorithm
      const verifier = createVerify(signatureInfo.algorithm);
      verifier.update(manifestData);
      
      // 5. Verify signature
      const isValid = verifier.verify(certificate.publicKey, signatureInfo.signatureValue);
      
      // 6. Additional validation checks
      const algorithmValid = this.validateSignatureAlgorithm(signatureInfo.algorithm, certificate);
      const timestampValid = this.validateTimestamp(manifest.claim_generator.timestamp);
      
      return {
        isValid: isValid && algorithmValid && timestampValid,
        algorithm: signatureInfo.algorithm,
        timestamp: manifest.claim_generator.timestamp,
        certificateFingerprint: certificate.fingerprint,
        checks: {
          signatureValid: isValid,
          algorithmValid,
          timestampValid
        },
        details: {
          signatureLength: signatureBuffer.length,
          manifestHash: createHash('sha256').update(manifestData).digest('hex'),
          verificationTime: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
        algorithm: 'unknown',
        timestamp: manifest.claim_generator.timestamp,
        certificateFingerprint: certificate.fingerprint,
        checks: {
          signatureValid: false,
          algorithmValid: false,
          timestampValid: false
        }
      };
    }
  }

  private prepareManifestData(manifest: Manifest): Buffer {
    // Create canonical representation of manifest for signing
    const canonicalManifest = {
      claim_generator: {
        $id: manifest.claim_generator.$id,
        name: manifest.claim_generator.name,
        version: manifest.claim_generator.version,
        timestamp: manifest.claim_generator.timestamp
      },
      claim_data: manifest.claim_data.sort((a, b) => a.label.localeCompare(b.label)),
      assertions: manifest.assertions.sort((a, b) => a.label.localeCompare(b.label))
    };
    
    return Buffer.from(JSON.stringify(canonicalManifest), 'utf8');
  }

  private parseSignature(signatureBuffer: Buffer): SignatureInfo {
    try {
      // Parse ASN.1 encoded signature
      const asn1 = ASN1Parser.parse(signatureBuffer);
      
      // Extract algorithm identifier and signature value
      const algorithmOID = asn1.sub[0].value;
      const signatureValue = asn1.sub[1].value;
      
      const algorithm = this.mapOIDToAlgorithm(algorithmOID);
      
      return {
        algorithm,
        signatureValue,
        oid: algorithmOID
      };
    } catch (error) {
      // Fallback: assume raw signature
      return {
        algorithm: 'RSA-SHA256',
        signatureValue: signatureBuffer,
        oid: null
      };
    }
  }

  private mapOIDToAlgorithm(oid: string): string {
    const oidMap = {
      '1.2.840.113549.1.1.11': 'RSA-SHA256',
      '1.2.840.113549.1.1.12': 'RSA-SHA384',
      '1.2.840.113549.1.1.13': 'RSA-SHA512',
      '1.2.840.10045.4.3.2': 'ECDSA-SHA256',
      '1.3.14.3.2.26': 'DSA-SHA1'
    };
    
    return oidMap[oid] || 'RSA-SHA256';
  }

  private validateSignatureAlgorithm(algorithm: string, certificate: X509Certificate): boolean {
    // Check if algorithm matches certificate capabilities
    const keyType = certificate.publicKey.type;
    
    if (keyType === 'rsa' && !algorithm.startsWith('RSA')) {
      return false;
    }
    
    if (keyType === 'ec' && !algorithm.startsWith('ECDSA')) {
      return false;
    }
    
    if (keyType === 'dsa' && !algorithm.startsWith('DSA')) {
      return false;
    }
    
    return true;
  }

  private validateTimestamp(timestamp: string): boolean {
    const signingTime = new Date(timestamp);
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Timestamp should be within reasonable bounds
    return signingTime >= oneYearAgo && signingTime <= oneHourFromNow;
  }
}
```

**Realistic Confidence Scoring Algorithm:**
```typescript
export class ConfidenceCalculator {
  calculateConfidence(
    extractionResult: ExtractionResult,
    signatureResult: SignatureVerificationResult,
    certificateResult: ValidationResult,
    hasRemoteProof: boolean
  ): ConfidenceScore {
    let score = 0;
    const factors: ConfidenceFactor[] = [];
    
    // 1. Cryptographic signature validation (30 points)
    if (signatureResult.isValid) {
      score += 30;
      factors.push({
        name: 'Cryptographic Signature',
        points: 30,
        maxPoints: 30,
        details: 'Signature validates with public certificate'
      });
    } else {
      factors.push({
        name: 'Cryptographic Signature',
        points: 0,
        maxPoints: 30,
        details: signatureResult.error || 'Signature validation failed'
      });
    }
    
    // 2. Certificate chain validation (25 points)
    if (certificateResult.isValid && certificateResult.rootTrusted) {
      score += 25;
      factors.push({
        name: 'Certificate Chain',
        points: 25,
        maxPoints: 25,
        details: `Valid chain of ${certificateResult.chainLength} certificates ending in trusted root`
      });
    } else if (certificateResult.isValid && !certificateResult.rootTrusted) {
      score += 15;
      factors.push({
        name: 'Certificate Chain',
        points: 15,
        maxPoints: 25,
        details: 'Valid chain but root not in trusted store'
      });
    } else {
      factors.push({
        name: 'Certificate Chain',
        points: 0,
        maxPoints: 25,
        details: certificateResult.certificateResults[0]?.errors?.join(', ') || 'Chain validation failed'
      });
    }
    
    // 3. Remote proof availability (20 points)
    if (hasRemoteProof) {
      score += 20;
      factors.push({
        name: 'Remote Proof',
        points: 20,
        maxPoints: 20,
        details: 'Proof is accessible from remote storage'
      });
    } else {
      factors.push({
        name: 'Remote Proof',
        points: 0,
        maxPoints: 20,
        details: 'Remote proof not available or inaccessible'
      });
    }
    
    // 4. Manifest extraction confidence (15 points)
    const extractionScore = Math.round(extractionResult.confidence * 15);
    score += extractionScore;
    factors.push({
      name: 'Manifest Extraction',
      points: extractionScore,
      maxPoints: 15,
      details: `Extracted via ${extractionResult.extractionMethod?.method || 'unknown'} with ${Math.round(extractionResult.confidence * 100)}% confidence`
    });
    
    // 5. Timestamp validation (10 points)
    if (signatureResult.checks?.timestampValid) {
      score += 10;
      factors.push({
        name: 'Timestamp Validity',
        points: 10,
        maxPoints: 10,
        details: `Timestamp ${signatureResult.timestamp} is within reasonable bounds`
      });
    } else {
      factors.push({
        name: 'Timestamp Validity',
        points: 0,
        maxPoints: 10,
        details: 'Timestamp is invalid or outside reasonable bounds'
      });
    }
    
    // Normalize to 0-100 scale
    const normalizedScore = Math.min(100, Math.max(0, score));
    
    // Determine confidence level
    let level: ConfidenceLevel;
    if (normalizedScore >= 90) level = 'very_high';
    else if (normalizedScore >= 75) level = 'high';
    else if (normalizedScore >= 60) level = 'medium';
    else if (normalizedScore >= 40) level = 'low';
    else level = 'very_low';
    
    return {
      score: normalizedScore,
      level,
      factors,
      summary: this.generateConfidenceSummary(normalizedScore, factors),
      recommendations: this.generateRecommendations(normalizedScore, factors)
    };
  }

  private generateConfidenceSummary(score: number, factors: ConfidenceFactor[]): string {
    const passedFactors = factors.filter(f => f.points > 0);
    const failedFactors = factors.filter(f => f.points === 0);
    
    if (score >= 90) {
      return `Very high confidence (${score}/100). All critical validations passed: ${passedFactors.map(f => f.name).join(', ')}.`;
    } else if (score >= 75) {
      return `High confidence (${score}/100). Most validations passed: ${passedFactors.map(f => f.name).join(', ')}.`;
    } else if (score >= 60) {
      return `Medium confidence (${score}/100). Some validations failed: ${failedFactors.map(f => f.name).join(', ')}.`;
    } else {
      return `Low confidence (${score}/100). Critical validations failed: ${failedFactors.map(f => f.name).join(', ')}.`;
    }
  }

  private generateRecommendations(score: number, factors: ConfidenceFactor[]): string[] {
    const recommendations: string[] = [];
    
    for (const factor of factors) {
      if (factor.points === 0) {
        switch (factor.name) {
          case 'Cryptographic Signature':
            recommendations.push('Image may have been tampered with or signature corrupted');
            break;
          case 'Certificate Chain':
            recommendations.push('Check if certificate authority is trusted');
            break;
          case 'Remote Proof':
            recommendations.push('Try accessing proof directly from the provided URI');
            break;
          case 'Manifest Extraction':
            recommendations.push('Image may have been processed in a way that removed metadata');
            break;
          case 'Timestamp Validity':
            recommendations.push('Check if system clock is correct');
            break;
        }
      }
    }
    
    if (score < 40) {
      recommendations.push('This image should not be trusted for critical applications');
    }
    
    return recommendations;
  }
}
```

---

### **Week 2-3: Real Metadata Extraction & Verification** ⏱️ 10 days

**Goal:** Extract real manifests from images and validate them

#### Tasks:

**Day 1-3: Metadata Extraction**
- [ ] Replace `extractManifest()` to actually parse EXIF/XMP:
  ```typescript
  // OLD (mock): return null
  // NEW: Actually parse metadata
  const metadata = await sharp(imageBuffer).metadata();
  const manifestCbor = metadata.exif?.['credlink-manifest'];
  const manifestJson = decodeCBOR(manifestCbor);
  return parseC2PAManifest(manifestJson);
  ```
- [ ] Handle multiple metadata formats:
  - EXIF IFD0 (standard cameras)
  - XMP data
  - Custom JUMBF container (C2PA standard)
- [ ] Handle cases where metadata is missing
- [ ] Add error handling for corrupted metadata
- [ ] Create utility: `CBORDecoder` class
- [ ] Write 5+ tests for different image types

**Day 4-6: Advanced Rate Limiting & Security**

**Tiered Rate Limiting System:**
**Unit Tests (15+ scenarios):**
```typescript
// /apps/sign-service/src/tests/unit/metadata-extractor.test.ts
describe('MetadataExtractor', () => {
  describe('extractManifest', () => {
    it('should extract from JUMBF container in JPEG', async () => {
      const testImage = readFileSync('./test-fixtures/images/jumbf-signed.jpg');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.confidence).to.be.greaterThan(0.9);
      expect(result.extractionMethod.method).to.equal('JUMBF');
    });

    it('should extract from XMP metadata', async () => {
      const testImage = readFileSync('./test-fixtures/images/xmp-signed.jpg');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.confidence).to.be.greaterThan(0.8);
      expect(result.extractionMethod.method).to.equal('XMP');
    });

    it('should extract from EXIF custom tags', async () => {
      const testImage = readFileSync('./test-fixtures/images/exif-signed.jpg');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.confidence).to.be.greaterThan(0.7);
      expect(result.extractionMethod.method).to.equal('EXIF');
    });

    it('should fallback to remote proof when local extraction fails', async () => {
      const testImage = readFileSync('./test-fixtures/images/remote-only.jpg');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.confidence).to.be.equal(0.7);
      expect(result.extractionMethod.method).to.equal('EXIF');
    });

    it('should merge manifests from multiple sources', async () => {
      const testImage = readFileSync('./test-fixtures/images/multi-source.jpg');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.sources).to.have.length.greaterThan(1);
      expect(result.manifest).to.not.be.null;
    });

    it('should handle corrupted metadata gracefully', async () => {
      const corruptedImage = Buffer.from('corrupted-data');
      const result = await extractor.extractManifest(corruptedImage);
      
      expect(result.manifest).to.be.null;
      expect(result.confidence).to.equal(0);
    });

    it('should extract from PNG chunks', async () => {
      const testImage = readFileSync('./test-fixtures/images/png-signed.png');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.extractionMethod.method).to.equal('PNG_CHUNKS');
    });

    it('should extract from WebP chunks', async () => {
      const testImage = readFileSync('./test-fixtures/images/webp-signed.webp');
      const result = await extractor.extractManifest(testImage);
      
      expect(result.manifest).to.not.be.null;
      expect(result.extractionMethod.method).to.equal('WEBP_CHUNKS');
    });
  });
});
```

**Certificate Validation Tests (12+ scenarios):**
```typescript
// /apps/sign-service/src/tests/unit/certificate-validator.test.ts
describe('CertificateValidator', () => {
  describe('validateCertificateChain', () => {
    it('should validate complete certificate chain', async () => {
      const chain = [
        loadCertificate('./certs/leaf.pem'),
        loadCertificate('./certs/intermediate.pem'),
        loadCertificate('./certs/root.pem')
      ];
      
      const result = await validator.validateCertificateChain(chain);
      
      expect(result.isValid).to.be.true;
      expect(result.rootTrusted).to.be.true;
      expect(result.chainLength).to.equal(3);
    });

    it('should reject expired certificate', async () => {
      const expiredChain = [
        loadCertificate('./certs/expired-leaf.pem'),
        loadCertificate('./certs/intermediate.pem'),
        loadCertificate('./certs/root.pem')
      ];
      
      const result = await validator.validateCertificateChain(expiredChain);
      
      expect(result.isValid).to.be.false;
      expect(result.certificateResults[0].errors).to.include('Certificate has expired');
    });

    it('should reject revoked certificate via OCSP', async () => {
      const revokedChain = [
        loadCertificate('./certs/revoked-leaf.pem'),
        loadCertificate('./certs/intermediate.pem'),
        loadCertificate('./certs/root.pem')
      ];
      
      const result = await validator.validateCertificateChain(revokedChain);
      
      expect(result.isValid).to.be.false;
      expect(result.certificateResults[0].errors).to.include('Certificate revoked (OCSP)');
    });

    it('should reject invalid signature in chain', async () => {
      const invalidChain = [
        loadCertificate('./certs/invalid-signature.pem'),
        loadCertificate('./certs/intermediate.pem'),
        loadCertificate('./certs/root.pem')
      ];
      
      const result = await validator.validateCertificateChain(invalidChain);
      
      expect(result.isValid).to.be.false;
      expect(result.certificateResults[0].errors).to.include('Invalid certificate signature');
    });

    it('should cache validation results', async () => {
      const chain = [
        loadCertificate('./certs/leaf.pem'),
        loadCertificate('./certs/intermediate.pem'),
        loadCertificate('./certs/root.pem')
      ];
      
      // First validation
      const start1 = Date.now();
      await validator.validateCertificateChain(chain);
      const duration1 = Date.now() - start1;
      
      // Second validation (should be cached)
      const start2 = Date.now();
      await validator.validateCertificateChain(chain);
      const duration2 = Date.now() - start2;
      
      expect(duration2).to.be.lessThan(duration1 * 0.5); // Should be significantly faster
    });
  });
});
```

**Signature Verification Tests (10+ scenarios):**
```typescript
// /apps/sign-service/src/tests/unit/signature-verifier.test.ts
describe('SignatureVerifier', () => {
  describe('verifySignature', () => {
    it('should verify valid RSA-SHA256 signature', async () => {
      const manifest = loadTestManifest();
      const signature = loadValidSignature();
      const certificate = loadCertificate('./certs/leaf.pem');
      
      const result = await verifier.verifySignature(manifest, signature, certificate);
      
      expect(result.isValid).to.be.true;
      expect(result.algorithm).to.equal('RSA-SHA256');
      expect(result.checks.signatureValid).to.be.true;
    });

    it('should reject tampered manifest', async () => {
      const tamperedManifest = { ...loadTestManifest(), claim_data: 'tampered' };
      const signature = loadValidSignature();
      const certificate = loadCertificate('./certs/leaf.pem');
      
      const result = await verifier.verifySignature(tamperedManifest, signature, certificate);
      
      expect(result.isValid).to.be.false;
      expect(result.checks.signatureValid).to.be.false;
    });

    it('should reject signature with wrong certificate', async () => {
      const manifest = loadTestManifest();
      const signature = loadValidSignature();
      const wrongCertificate = loadCertificate('./certs/different-leaf.pem');
      
      const result = await verifier.verifySignature(manifest, signature, wrongCertificate);
      
      expect(result.isValid).to.be.false;
      expect(result.checks.signatureValid).to.be.false;
    });

    it('should validate timestamp bounds', async () => {
      const futureManifest = loadTestManifest();
      futureManifest.claim_generator.timestamp = '2100-01-01T00:00:00Z';
      
      const result = await verifier.verifySignature(futureManifest, loadValidSignature(), loadCertificate('./certs/leaf.pem'));
      
      expect(result.isValid).to.be.false;
      expect(result.checks.timestampValid).to.be.false;
    });
  });
});
```

**Confidence Scoring Tests (8+ scenarios):**
```typescript
// /apps/sign-service/src/tests/unit/confidence-calculator.test.ts
describe('ConfidenceCalculator', () => {
  describe('calculateConfidence', () => {
    it('should return very high confidence for perfect validation', () => {
      const extractionResult = { confidence: 0.95, extractionMethod: { method: 'JUMBF' } };
      const signatureResult = { isValid: true, checks: { timestampValid: true } };
      const certificateResult = { isValid: true, rootTrusted: true, chainLength: 3 };
      
      const result = calculator.calculateConfidence(extractionResult, signatureResult, certificateResult, true);
      
      expect(result.score).to.be.greaterThan(90);
      expect(result.level).to.equal('very_high');
    });

    it('should return low confidence for failed signature', () => {
      const extractionResult = { confidence: 0.95, extractionMethod: { method: 'JUMBF' } };
      const signatureResult = { isValid: false, checks: { timestampValid: true } };
      const certificateResult = { isValid: true, rootTrusted: true, chainLength: 3 };
      
      const result = calculator.calculateConfidence(extractionResult, signatureResult, certificateResult, true);
      
      expect(result.score).to.be.lessThan(40);
      expect(result.level).to.equal('low');
    });

    it('should provide appropriate recommendations', () => {
      const extractionResult = { confidence: 0.3, extractionMethod: { method: 'EXIF' } };
      const signatureResult = { isValid: false, error: 'Signature mismatch', checks: { timestampValid: true } };
      const certificateResult = { isValid: true, rootTrusted: false, chainLength: 2 };
      
      const result = calculator.calculateConfidence(extractionResult, signatureResult, certificateResult, false);
      
      expect(result.recommendations).to.include('Image may have been tampered with or signature corrupted');
      expect(result.recommendations).to.include('Check if certificate authority is trusted');
    });
  });
});
```

**Day 7-8: Integration Testing**

**End-to-End Verification Flow Tests:**
```typescript
// /apps/sign-service/src/tests/integration/verification-flow.test.ts
describe('Verification Flow Integration', () => {
  describe('Complete Sign → Transform → Verify Flow', () => {
    it('should verify image after JPEG compression', async () => {
      // 1. Sign original image
      const originalImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(originalImage);
      
      // 2. Compress the signed image
      const compressedImage = await sharp(originalImage)
        .jpeg({ quality: 75 })
        .toBuffer();
      
      // 3. Verify the compressed image
      const verifyResult = await verifyService.verifyImage(compressedImage);
      
      expect(verifyResult.confidence).to.be.greaterThan(80);
      expect(verifyResult.extractionResult.extractionMethod.method).to.be.oneOf(['JUMBF', 'XMP']);
    });

    it('should verify image after format conversion', async () => {
      const originalImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(originalImage);
      
      // Convert to WebP
      const webpImage = await sharp(originalImage)
        .webp({ quality: 80 })
        .toBuffer();
      
      const verifyResult = await verifyService.verifyImage(webpImage);
      
      expect(verifyResult.confidence).to.be.greaterThan(70);
    });

    it('should fallback to remote proof when metadata is stripped', async () => {
      const originalImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(originalImage);
      
      // Strip all metadata
      const strippedImage = await sharp(originalImage)
        .withMetadata({})
        .toBuffer();
      
      const verifyResult = await verifyService.verifyImage(strippedImage);
      
      expect(verifyResult.confidence).to.be.equal(70); // Remote proof only
      expect(verifyResult.extractionResult.extractionMethod.method).to.equal('EXIF');
    });

    it('should handle concurrent verification requests', async () => {
      const originalImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(originalImage);
      
      // Create 50 concurrent verification requests
      const promises = Array(50).fill(null).map(() => 
        verifyService.verifyImage(originalImage)
      );
      
      const results = await Promise.all(promises);
      
      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.confidence).to.equal(firstResult.confidence);
        expect(result.extractionResult.extractionMethod.method).to.equal(firstResult.extractionResult.extractionMethod.method);
      });
    });
  });
});
```

**Real-World Image Tests:**
```typescript
// /apps/sign-service/src/tests/integration/real-world-images.test.ts
describe('Real-World Image Verification', () => {
  const realImages = [
    { path: './test-fixtures/real/iphone-photo.jpg', source: 'iPhone 13' },
    { path: './test-fixtures/real/android-photo.jpg', source: 'Samsung Galaxy S21' },
    { path: './test-fixtures/real/photoshop-edited.jpg', source: 'Adobe Photoshop' },
    { path: './test-fixtures/real/canon-camera.jpg', source: 'Canon EOS R5' },
    { path: './test-fixtures/real/social-media.jpg', source: 'Instagram Download' }
  ];

  realImages.forEach(({ path, source }) => {
    it(`should handle ${source} images correctly`, async () => {
      const image = readFileSync(path);
      
      // First, sign the image
      const signResult = await signService.signImage(image);
      expect(signResult.proofUri).to.be.a('string');
      
      // Then verify it
      const verifyResult = await verifyService.verifyImage(signResult.signedImage);
      expect(verifyResult.confidence).to.be.greaterThan(85);
      
      // Test common transformations
      const compressed = await sharp(signResult.signedImage).jpeg({ quality: 80 }).toBuffer();
      const compressedVerify = await verifyService.verifyImage(compressed);
      expect(compressedVerify.confidence).to.be.greaterThan(70);
    });
  });
});
```

**Day 9-10: Performance & Load Testing**

**Performance Benchmarks:**
```typescript
// /apps/sign-service/src/tests/performance/verification-performance.test.ts
describe('Verification Performance', () => {
  it('should verify images under 500ms', async () => {
    const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
    const iterations = 100;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await verifyService.verifyImage(testImage);
      times.push(Date.now() - start);
    }
    
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    
    expect(averageTime).to.be.lessThan(300);
    expect(p95Time).to.be.lessThan(500);
  });

  it('should handle 100 concurrent verification requests', async () => {
    const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
    const concurrency = 100;
    
    const start = Date.now();
    const promises = Array(concurrency).fill(null).map(() => 
      verifyService.verifyImage(testImage)
    );
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - start;
    
    expect(results).to.have.length(concurrency);
    expect(results.every(r => r.confidence > 0)).to.be.true;
    expect(totalTime / concurrency).to.be.lessThan(1000); // Average < 1s per request
  });

  it('should maintain performance with large images', async () => {
    const largeImage = readFileSync('./test-fixtures/images/large-10mb.jpg');
    
    const start = Date.now();
    const result = await verifyService.verifyImage(largeImage);
    const duration = Date.now() - start;
    
    expect(result.confidence).to.be.greaterThan(0);
    expect(duration).to.be.lessThan(2000); // Should complete within 2 seconds
  });
});
```

**Memory Usage Tests:**
```typescript
// /apps/sign-service/src/tests/performance/memory-usage.test.ts
describe('Memory Usage', () => {
  it('should not leak memory during repeated verifications', async () => {
    const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Perform 1000 verifications
    for (let i = 0; i < 1000; i++) {
      await verifyService.verifyImage(testImage);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be minimal (< 50MB)
    expect(memoryIncrease).to.be.lessThan(50 * 1024 * 1024);
  });
});
```

**Acceptance Criteria:**
- ✅ Extracts real C2PA manifest from EXIF/XMP/JUMBF/PNG/WebP
- ✅ Validates signature cryptographically (RSA/ECDSA/DSA)
- ✅ Validates certificate chain with OCSP/CRL checking
- ✅ Detects tampered manifests (score < 30)
- ✅ `pnpm test` passes all verification tests (30+ tests)
- ✅ Verification is deterministic (same image = same result)
- ✅ Performance: p95 < 500ms, supports 100 concurrent requests
- ✅ Memory usage stable under load
- ✅ Remote proof fallback working
- ✅ Multi-source manifest merging functional

**Deliverables:**
- `/apps/sign-service/src/services/metadata-extractor.ts` (real implementation)
- `/apps/sign-service/src/services/certificate-validator.ts` (new)
- `/apps/sign-service/src/services/signature-verifier.ts` (new)
- `/apps/sign-service/src/services/confidence-calculator.ts` (new)
- `/apps/sign-service/src/tests/unit/verification.test.ts` (comprehensive)
- `/apps/sign-service/src/tests/integration/verification-flow.test.ts` (new)
- `/apps/sign-service/src/tests/performance/verification-performance.test.ts` (new)

---

### **Week 3-4: Real Proof Storage (S3/Cloudflare R2)** ⏱️ 10 days

**Goal:** Replace in-memory storage with persistent remote storage with global CDN

#### Tasks:

**Day 1-2: Multi-Cloud Storage Architecture**

**Storage Provider Abstraction:**
```typescript
export interface StorageProvider {
  store(key: string, data: Buffer, options?: StorageOptions): Promise<StorageResult>;
  retrieve(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<StorageItem[]>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

export class S3StorageProvider implements StorageProvider {
  private s3: AWS.S3;
  private bucket: string;
  private region: string;

  constructor(config: S3Config) {
    this.s3 = new AWS.S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: config.region,
      maxRetries: 3
    });
    this.bucket = config.bucket;
    this.region = config.region;
  }

  async store(key: string, data: Buffer, options: StorageOptions = {}): Promise<StorageResult> {
    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options.contentType || 'application/json',
        CacheControl: options.cacheControl || 'max-age=31536000', // 1 year
        Metadata: options.metadata || {},
        ServerSideEncryption: 'AES256',
        StorageClass: options.storageClass || 'STANDARD'
      };

      // Add compression if enabled
      if (options.compress) {
        const compressed = await this.compressData(data);
        params.Body = compressed;
        params.ContentEncoding = 'gzip';
        params.Metadata = {
          ...params.Metadata,
          'original-size': data.length.toString(),
          'compressed': 'true'
        };
      }

      const result = await this.s3.upload(params).promise();
      
      return {
        key,
        url: result.Location,
        etag: result.ETag,
        size: data.length,
        compressedSize: options.compress ? (params.Body as Buffer).length : undefined
      };
    } catch (error) {
      throw new StorageError(`Failed to store ${key}: ${error.message}`, error.code);
    }
  }

  async retrieve(key: string): Promise<Buffer | null> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: this.bucket,
        Key: key
      };

      const result = await this.s3.getObject(params).promise();
      let data = result.Body as Buffer;

      // Decompress if needed
      if (result.ContentEncoding === 'gzip') {
        data = await this.decompressData(data);
      }

      return data;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return null;
      }
      throw new StorageError(`Failed to retrieve ${key}: ${error.message}`, error.code);
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const params: AWS.S3.GetSignedUrlRequest = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  private async compressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gzip(data, { level: 9 }, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  private async decompressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zlib.gunzip(data, (err, decompressed) => {
        if (err) reject(err);
        else resolve(decompressed);
      });
    });
  }
}
```

**Cloudflare R2 Implementation:**
```typescript
export class CloudflareR2StorageProvider implements StorageProvider {
  private client: AWS.S3; // R2 uses S3-compatible API
  private bucket: string;
  private accountId: string;
  private customDomain?: string;

  constructor(config: R2Config) {
    this.client = new AWS.S3({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: 'auto',
      maxRetries: 3
    });
    this.bucket = config.bucket;
    this.accountId = config.accountId;
    this.customDomain = config.customDomain;
  }

  async store(key: string, data: Buffer, options: StorageOptions = {}): Promise<StorageResult> {
    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options.contentType || 'application/json',
        CacheControl: options.cacheControl || 'max-age=31536000',
        Metadata: options.metadata || {}
      };

      // R2-specific optimizations
      if (options.compress) {
        const compressed = await this.compressData(data);
        params.Body = compressed;
        params.ContentEncoding = 'gzip';
        params.Metadata = {
          ...params.Metadata,
          'original-size': data.length.toString(),
          'compressed': 'true'
        };
      }

      const result = await this.client.upload(params).promise();
      
      // Use custom domain if configured
      const url = this.customDomain 
        ? `https://${this.customDomain}/${key}`
        : `https://pub-${this.accountId}.r2.dev/${key}`;
      
      return {
        key,
        url,
        etag: result.ETag,
        size: data.length,
        compressedSize: options.compress ? (params.Body as Buffer).length : undefined
      };
    } catch (error) {
      throw new StorageError(`Failed to store ${key}: ${error.message}`, error.code);
    }
  }

  async retrieve(key: string): Promise<Buffer | null> {
    try {
      const params: AWS.S3.GetObjectRequest = {
        Bucket: this.bucket,
        Key: key
      };

      const result = await this.client.getObject(params).promise();
      let data = result.Body as Buffer;

      if (result.ContentEncoding === 'gzip') {
        data = await this.decompressData(data);
      }

      return data;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        return null;
      }
      throw new StorageError(`Failed to retrieve ${key}: ${error.message}`, error.code);
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // R2 supports pre-signed URLs for private buckets
    const params: AWS.S3.GetSignedUrlRequest = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn
    };

    return this.client.getSignedUrl('getObject', params);
  }
}
```

**Storage Manager with Fallback:**
```typescript
export class StorageManager {
  private primaryProvider: StorageProvider;
  private fallbackProvider?: StorageProvider;
  private cache: Map<string, CachedItem> = new Map();
  private metrics: StorageMetrics;

  constructor(config: StorageConfig) {
    // Initialize primary provider based on configuration
    if (config.type === 's3') {
      this.primaryProvider = new S3StorageProvider(config.s3!);
    } else if (config.type === 'r2') {
      this.primaryProvider = new CloudflareR2StorageProvider(config.r2!);
    } else {
      throw new Error('Unsupported storage type');
    }

    // Initialize fallback provider if configured
    if (config.fallback) {
      if (config.fallback.type === 's3') {
        this.fallbackProvider = new S3StorageProvider(config.fallback.s3!);
      } else if (config.fallback.type === 'r2') {
        this.fallbackProvider = new CloudflareR2StorageProvider(config.fallback.r2!);
      }
    }

    this.metrics = new StorageMetrics();
    this.scheduleCacheCleanup();
  }

  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    const startTime = Date.now();
    const key = this.generateProofKey(imageHash);
    
    try {
      // Serialize and compress manifest
      const manifestJson = JSON.stringify(manifest);
      const manifestBuffer = Buffer.from(manifestJson, 'utf8');
      
      // Store with compression and metadata
      const result = await this.primaryProvider.store(key, manifestBuffer, {
        contentType: 'application/json',
        compress: true,
        cacheControl: 'max-age=31536000, immutable',
        metadata: {
          'image-hash': imageHash,
          'manifest-version': manifest.claim_generator.version,
          'created-at': manifest.claim_generator.timestamp,
          'credlink-version': process.env.SERVICE_VERSION || '1.0.0'
        }
      });

      // Cache the result
      this.cache.set(key, {
        data: manifestBuffer,
        timestamp: Date.now(),
        url: result.url
      });

      // Record metrics
      this.metrics.recordStore(key, manifestBuffer.length, Date.now() - startTime);
      
      return result.url;
    } catch (error) {
      this.metrics.recordError('store', error.code);
      
      // Try fallback provider if available
      if (this.fallbackProvider) {
        try {
          console.warn(`Primary storage failed, trying fallback: ${error.message}`);
          const fallbackResult = await this.fallbackProvider.store(key, manifestBuffer, {
            contentType: 'application/json',
            compress: true,
            cacheControl: 'max-age=31536000, immutable'
          });
          
          this.metrics.recordFallback('store');
          return fallbackResult.url;
        } catch (fallbackError) {
          this.metrics.recordError('store_fallback', fallbackError.code);
          throw new StorageError(`Both primary and fallback storage failed: ${fallbackError.message}`);
        }
      }
      
      throw error;
    }
  }

  async retrieveProof(proofId: string): Promise<C2PAManifest | null> {
    const startTime = Date.now();
    const key = this.parseProofId(proofId);
    
    // Check cache first
    const cached = this.cache.get(key);
    if (cached && !this.isCacheExpired(cached)) {
      this.metrics.recordCacheHit();
      try {
        return JSON.parse(cached.data.toString('utf8'));
      } catch (error) {
        // Cache corrupted, remove it
        this.cache.delete(key);
      }
    }
    
    try {
      const data = await this.primaryProvider.retrieve(key);
      
      if (data) {
        // Cache the retrieved data
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
          url: proofId
        });
        
        this.metrics.recordRetrieve(key, data.length, Date.now() - startTime);
        
        try {
          return JSON.parse(data.toString('utf8'));
        } catch (parseError) {
          throw new StorageError(`Invalid JSON in stored proof: ${parseError.message}`);
        }
      }
      
      // Try fallback provider if primary returns null
      if (this.fallbackProvider) {
        const fallbackData = await this.fallbackProvider.retrieve(key);
        if (fallbackData) {
          this.metrics.recordFallback('retrieve');
          
          try {
            const manifest = JSON.parse(fallbackData.toString('utf8'));
            
            // Cache fallback result
            this.cache.set(key, {
              data: fallbackData,
              timestamp: Date.now(),
              url: proofId
            });
            
            return manifest;
          } catch (parseError) {
            throw new StorageError(`Invalid JSON in fallback proof: ${parseError.message}`);
          }
        }
      }
      
      this.metrics.recordMiss();
      return null;
    } catch (error) {
      this.metrics.recordError('retrieve', error.code);
      throw new StorageError(`Failed to retrieve proof: ${error.message}`);
    }
  }

  private generateProofKey(imageHash: string): string {
    // Use SHA-256 hash for consistent key generation
    const hash = crypto.createHash('sha256').update(imageHash).digest('hex');
    return `proofs/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}.json`;
  }

  private parseProofId(proofId: string): string {
    // Extract key from proof URL
    const url = new URL(proofId);
    return url.pathname.substring(1); // Remove leading slash
  }

  private isCacheExpired(item: CachedItem): boolean {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    return Date.now() - item.timestamp > maxAge;
  }

  private scheduleCacheCleanup(): void {
    // Clean expired cache entries every hour
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.cache.entries()) {
        if (this.isCacheExpired(item)) {
          this.cache.delete(key);
        }
      }
    }, 60 * 60 * 1000);
  }

  getMetrics(): StorageMetricsSnapshot {
    return this.metrics.getSnapshot();
  }
}
```

**Day 3-4: Advanced Caching & Performance Optimization**

**Multi-Layer Caching Strategy:**
```typescript
export class AdvancedCacheManager {
  private l1Cache: Map<string, CachedProof>; // In-memory L1
  private l2Cache: RedisClient; // Redis L2
  private l3Cache: StorageProvider; // S3/R2 L3 (warm storage)
  private metrics: CacheMetrics;

  constructor(config: CacheConfig) {
    this.l1Cache = new Map();
    this.l2Cache = new RedisClient(config.redis);
    this.l3Cache = config.storageProvider;
    this.metrics = new CacheMetrics();
    
    this.scheduleL1Cleanup();
    this.scheduleL2Cleanup();
  }

  async getProof(proofId: string): Promise<C2PAManifest | null> {
    const startTime = Date.now();
    
    // L1 Cache (in-memory, fastest)
    const l1Result = this.l1Cache.get(proofId);
    if (l1Result && !this.isL1Expired(l1Result)) {
      this.metrics.recordHit('L1');
      return l1Result.manifest;
    }
    
    // L2 Cache (Redis, medium speed)
    try {
      const l2Data = await this.l2Cache.get(proofId);
      if (l2Data) {
        const manifest = JSON.parse(l2Data);
        
        // Promote to L1
        this.l1Cache.set(proofId, {
          manifest,
          timestamp: Date.now(),
          accessCount: 1
        });
        
        this.metrics.recordHit('L2');
        return manifest;
      }
    } catch (error) {
      console.warn('Redis cache miss:', error.message);
    }
    
    // L3 Cache (warm storage in S3/R2)
    try {
      const l3Data = await this.l3Cache.retrieve(this.parseProofKey(proofId));
      if (l3Data) {
        const manifest = JSON.parse(l3Data.toString('utf8'));
        
        // Promote to L2 and L1
        await this.l2Cache.setex(proofId, 86400, JSON.stringify(manifest)); // 24 hours
        this.l1Cache.set(proofId, {
          manifest,
          timestamp: Date.now(),
          accessCount: 1
        });
        
        this.metrics.recordHit('L3');
        return manifest;
      }
    } catch (error) {
      console.warn('L3 cache miss:', error.message);
    }
    
    this.metrics.recordMiss();
    return null;
  }

  async storeProof(proofId: string, manifest: C2PAManifest): Promise<void> {
    const manifestJson = JSON.stringify(manifest);
    
    // Store in all cache layers
    this.l1Cache.set(proofId, {
      manifest,
      timestamp: Date.now(),
      accessCount: 0
    });
    
    await this.l2Cache.setex(proofId, 86400, manifestJson); // 24 hours
    
    // L3 storage is handled by StorageManager
  }

  private isL1Expired(item: CachedProof): boolean {
    const maxAge = 60 * 60 * 1000; // 1 hour for L1
    return Date.now() - item.timestamp > maxAge;
  }

  private scheduleL1Cleanup(): void {
    // Clean L1 cache every 10 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, item] of this.l1Cache.entries()) {
        if (this.isL1Expired(item)) {
          this.l1Cache.delete(key);
        }
      }
      
      // Keep only top 1000 items by access count
      if (this.l1Cache.size > 1000) {
        const sorted = Array.from(this.l1Cache.entries())
          .sort(([,a], [,b]) => b.accessCount - a.accessCount);
        
        this.l1Cache.clear();
        sorted.slice(0, 1000).forEach(([key, item]) => {
          this.l1Cache.set(key, item);
        });
      }
    }, 10 * 60 * 1000);
  }

  private scheduleL2Cleanup(): void {
    // Redis handles TTL automatically, but we can clean up orphaned keys
    setInterval(async () => {
      try {
        const keys = await this.l2Cache.keys('proof:*');
        const batchSize = 100;
        
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          const ttlPromises = batch.map(key => this.l2Cache.ttl(key));
          const ttls = await Promise.all(ttlPromises);
          
          // Remove keys with no TTL (orphaned)
          const orphanedKeys = batch.filter((_, index) => ttls[index] === -1);
          if (orphanedKeys.length > 0) {
            await this.l2Cache.del(...orphanedKeys);
          }
        }
      } catch (error) {
        console.warn('L2 cleanup failed:', error.message);
      }
    }, 60 * 60 * 1000); // Every hour
  }

  getCacheMetrics(): CacheMetricsSnapshot {
    return {
      l1Size: this.l1Cache.size,
      l1HitRate: this.metrics.getHitRate('L1'),
      l2HitRate: this.metrics.getHitRate('L2'),
      l3HitRate: this.metrics.getHitRate('L3'),
      overallHitRate: this.metrics.getOverallHitRate(),
      totalRequests: this.metrics.getTotalRequests()
    };
  }
}
```

**Deduplication Service:**
```typescript
export class DeduplicationService {
  private imageHashIndex: Map<string, string>; // imageHash → proofId
  private perceptualHashIndex: Map<string, string[]>; // perceptualHash → [proofIds]
  private similarityThreshold: number = 0.95;

  constructor() {
    this.imageHashIndex = new Map();
    this.perceptualHashIndex = new Map();
  }

  async checkDuplicate(imageBuffer: Buffer): Promise<DuplicateCheckResult> {
    const contentHash = this.generateContentHash(imageBuffer);
    const perceptualHash = await this.generatePerceptualHash(imageBuffer);
    
    // Exact content hash match
    const exactProofId = this.imageHashIndex.get(contentHash);
    if (exactProofId) {
      return {
        isDuplicate: true,
        duplicateType: 'exact',
        existingProofId: exactProofId,
        similarity: 1.0
      };
    }
    
    // Perceptual hash similarity check
    const similarProofIds = this.perceptualHashIndex.get(perceptualHash) || [];
    for (const proofId of similarProofIds) {
      const similarity = await this.calculateSimilarity(imageBuffer, proofId);
      if (similarity >= this.similarityThreshold) {
        return {
          isDuplicate: true,
          duplicateType: 'similar',
          existingProofId: proofId,
          similarity
        };
      }
    }
    
    return {
      isDuplicate: false,
      duplicateType: 'none',
      existingProofId: null,
      similarity: 0.0
    };
  }

  async recordImage(imageHash: string, perceptualHash: string, proofId: string): Promise<void> {
    // Record exact hash
    this.imageHashIndex.set(imageHash, proofId);
    
    // Record perceptual hash
    if (!this.perceptualHashIndex.has(perceptualHash)) {
      this.perceptualHashIndex.set(perceptualHash, []);
    }
    this.perceptualHashIndex.get(perceptualHash)!.push(proofId);
  }

  private generateContentHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  private async generatePerceptualHash(buffer: Buffer): Promise<string> {
    // Implement perceptual hashing (e.g., using pHash or similar)
    const sharp = require('sharp');
    const { data, info } = await sharp(buffer)
      .resize(8, 8, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Calculate average color
    const avg = data.reduce((sum, pixel) => sum + pixel, 0) / data.length;
    
    // Generate hash based on comparison to average
    let hash = '';
    for (let i = 0; i < data.length; i++) {
      hash += data[i] > avg ? '1' : '0';
    }
    
    return hash;
  }

  private async calculateSimilarity(imageBuffer: Buffer, proofId: string): Promise<number> {
    // Retrieve original image hash and compare
    // This is a simplified implementation
    const newHash = await this.generatePerceptualHash(imageBuffer);
    
    // Find existing perceptual hash for this proofId
    for (const [hash, proofIds] of this.perceptualHashIndex.entries()) {
      if (proofIds.includes(proofId)) {
        return this.hammingDistance(newHash, hash);
      }
    }
    
    return 0.0;
  }

  private hammingDistance(hash1: string, hash2: string): number {
    if (hash1.length !== hash2.length) return 0;
    
    let diff = 0;
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] !== hash2[i]) diff++;
    }
    
    return 1 - (diff / hash1.length);
  }
}
```

**Day 5-6: Storage Testing & Migration**

**Comprehensive Storage Tests:**
```typescript
// /apps/sign-service/src/tests/unit/storage-manager.test.ts
describe('StorageManager', () => {
  describe('storeProof', () => {
    it('should store proof in primary storage', async () => {
      const manifest = createTestManifest();
      const imageHash = 'test-hash-123';
      
      const proofUri = await storageManager.storeProof(manifest, imageHash);
      
      expect(proofUri).to.be.a('string');
      expect(proofUri).to.include('https://');
      
      // Verify it can be retrieved
      const retrieved = await storageManager.retrieveProof(proofUri);
      expect(retrieved).to.deep.equal(manifest);
    });

    it('should fallback to secondary storage on primary failure', async () => {
      // Mock primary storage failure
      const primaryProvider = mockStorageProvider();
      primaryProvider.store.rejects(new Error('Primary storage down'));
      
      const fallbackProvider = mockStorageProvider();
      fallbackProvider.store.resolves({ url: 'https://fallback.com/proof' });
      
      const manager = new StorageManager({
        type: 's3',
        s3: primaryProvider,
        fallback: { type: 'r2', r2: fallbackProvider }
      });
      
      const manifest = createTestManifest();
      const proofUri = await manager.storeProof(manifest, 'test-hash');
      
      expect(proofUri).to.equal('https://fallback.com/proof');
    });

    it('should compress large manifests', async () => {
      const largeManifest = createLargeManifest(10000); // 10KB
      const imageHash = 'large-hash-123';
      
      const proofUri = await storageManager.storeProof(largeManifest, imageHash);
      
      // Verify compression happened
      const metrics = storageManager.getMetrics();
      expect(metrics.compressionRatio).to.be.lessThan(0.8);
    });

    it('should handle concurrent storage operations', async () => {
      const promises = Array(50).fill(null).map((_, i) => {
        const manifest = createTestManifest({ id: i });
        return storageManager.storeProof(manifest, `hash-${i}`);
      });
      
      const results = await Promise.all(promises);
      
      expect(results).to.have.length(50);
      results.forEach(uri => expect(uri).to.be.a('string'));
    });
  });

  describe('retrieveProof', () => {
    it('should retrieve from cache when available', async () => {
      const manifest = createTestManifest();
      const imageHash = 'cached-hash';
      
      // Store first time
      await storageManager.storeProof(manifest, imageHash);
      
      // Retrieve (should hit cache)
      const start = Date.now();
      const retrieved = await storageManager.retrieveProof(`https://example.com/${imageHash}`);
      const duration = Date.now() - start;
      
      expect(retrieved).to.deep.equal(manifest);
      expect(duration).to.be.lessThan(100); // Should be very fast from cache
    });

    it('should try fallback when primary fails', async () => {
      const primaryProvider = mockStorageProvider();
      primaryProvider.retrieve.resolves(null);
      
      const fallbackProvider = mockStorageProvider();
      fallbackProvider.retrieve.resolves(Buffer.from(JSON.stringify(createTestManifest())));
      
      const manager = new StorageManager({
        type: 's3',
        s3: primaryProvider,
        fallback: { type: 'r2', r2: fallbackProvider }
      });
      
      const result = await manager.retrieveProof('https://example.com/proof');
      expect(result).to.not.be.null;
    });
  });
});
```

**Migration Service:**
```typescript
export class MigrationService {
  private oldStorage: InMemoryStorage; // Mock old storage
  private newStorage: StorageManager;
  private migrationProgress: Map<string, MigrationStatus> = new Map();

  constructor(oldStorage: InMemoryStorage, newStorage: StorageManager) {
    this.oldStorage = oldStorage;
    this.newStorage = newStorage;
  }

  async migrateAllProofs(): Promise<MigrationReport> {
    const startTime = Date.now();
    const oldProofs = await this.oldStorage.listAll();
    
    console.log(`Starting migration of ${oldProofs.length} proofs`);
    
    const results: MigrationResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    // Process in batches of 100
    const batchSize = 100;
    for (let i = 0; i < oldProofs.length; i += batchSize) {
      const batch = oldProofs.slice(i, i + batchSize);
      
      const batchResults = await Promise.allSettled(
        batch.map(proof => this.migrateProof(proof))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++;
          results.push(result.value);
        } else {
          errorCount++;
          results.push({
            proofId: batch[index].id,
            success: false,
            error: result.reason.message
          });
        }
      });
      
      // Progress reporting
      const progress = ((i + batchSize) / oldProofs.length) * 100;
      console.log(`Migration progress: ${Math.min(progress, 100).toFixed(1)}%`);
      
      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const duration = Date.now() - startTime;
    
    return {
      totalProofs: oldProofs.length,
      successCount,
      errorCount,
      duration,
      results,
      timestamp: new Date().toISOString()
    };
  }

  private async migrateProof(oldProof: OldProof): Promise<MigrationResult> {
    try {
      // Convert old format to new format
      const manifest = this.convertOldManifest(oldProof.data);
      
      // Store in new storage
      const proofUri = await this.newStorage.storeProof(manifest, oldProof.imageHash);
      
      // Verify it can be retrieved
      const verification = await this.newStorage.retrieveProof(proofUri);
      if (!verification) {
        throw new Error('Stored proof could not be retrieved');
      }
      
      return {
        proofId: oldProof.id,
        success: true,
        newProofUri: proofUri
      };
    } catch (error) {
      return {
        proofId: oldProof.id,
        success: false,
        error: error.message
      };
    }
  }

  private convertOldManifest(oldData: any): C2PAManifest {
    // Convert old storage format to new C2PA manifest format
    return {
      claim_generator: {
        $id: `urn:uuid:${uuidv4()}`,
        name: 'CredLink Signing Service',
        version: '1.0.0',
        timestamp: oldData.timestamp || new Date().toISOString()
      },
      claim_data: oldData.claims || [],
      assertions: oldData.assertions || [],
      ingredient: { recipe: [], ingredient: [] }
    };
  }
}
```

**Day 7-8: Performance Testing & Optimization**

**Storage Performance Tests:**
```typescript
// /apps/sign-service/src/tests/performance/storage-performance.test.ts
describe('Storage Performance', () => {
  it('should store proofs under 200ms', async () => {
    const manifest = createTestManifest();
    const iterations = 100;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await storageManager.storeProof(manifest, `test-hash-${i}`);
      times.push(Date.now() - start);
    }
    
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    
    expect(averageTime).to.be.lessThan(150);
    expect(p95Time).to.be.lessThan(200);
  });

  it('should retrieve proofs under 50ms (cache hit)', async () => {
    const manifest = createTestManifest();
    const proofUri = await storageManager.storeProof(manifest, 'cache-test');
    
    const iterations = 100;
    const times: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await storageManager.retrieveProof(proofUri);
      times.push(Date.now() - start);
    }
    
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    
    expect(averageTime).to.be.lessThan(20);
    expect(p95Time).to.be.lessThan(50);
  });

  it('should handle 1000 concurrent storage operations', async () => {
    const concurrency = 1000;
    const promises = Array(concurrency).fill(null).map((_, i) => {
      const manifest = createTestManifest({ id: i });
      return storageManager.storeProof(manifest, `concurrent-hash-${i}`);
    });
    
    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;
    
    expect(results).to.have.length(concurrency);
    expect(results.every(uri => uri && uri.length > 0)).to.be.true;
    expect(duration / concurrency).to.be.lessThan(500); // Average < 500ms per request
  });

  it('should maintain memory efficiency under load', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    // Store 1000 proofs
    for (let i = 0; i < 1000; i++) {
      const manifest = createTestManifest({ id: i });
      await storageManager.storeProof(manifest, `memory-test-${i}`);
    }
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (< 100MB)
    expect(memoryIncrease).to.be.lessThan(100 * 1024 * 1024);
  });
});
```

**Day 9-10: Integration & Documentation**

**Storage Integration Tests:**
```typescript
// /apps/sign-service/src/tests/integration/storage-integration.test.ts
describe('Storage Integration', () => {
  describe('End-to-End Storage Flow', () => {
    it('should complete sign → store → retrieve → verify flow', async () => {
      // 1. Sign image
      const image = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(image);
      
      expect(signResult.proofUri).to.be.a('string');
      
      // 2. Verify proof is stored
      const storedProof = await storageManager.retrieveProof(signResult.proofUri);
      expect(storedProof).to.not.be.null;
      
      // 3. Verify image using stored proof
      const verifyResult = await verifyService.verifyImage(signResult.signedImage);
      expect(verifyResult.confidence).to.be.greaterThan(85);
      
      // 4. Check deduplication works
      const signResult2 = await signService.signImage(image); // Same image
      expect(signResult2.proofUri).to.equal(signResult.proofUri);
    });

    it('should handle storage failures gracefully', async () => {
      // Mock storage failure
      const originalStore = storageManager.storeProof;
      storageManager.storeProof = () => Promise.reject(new Error('Storage unavailable'));
      
      const image = readFileSync('./test-fixtures/images/test-image.jpg');
      
      try {
        await signService.signImage(image);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('Storage unavailable');
      }
      
      // Restore original method
      storageManager.storeProof = originalStore;
    });
  });
});
```

**Acceptance Criteria:**
- ✅ Proofs persist in S3 or R2 (survives restart)
- ✅ Retrieval is <500ms (with caching)
- ✅ Deduplication works (same image = same proof)
- ✅ Proofs are compressed (gzip, 70%+ reduction)
- ✅ Fallback storage works when primary fails
- ✅ Multi-layer caching functional (L1/L2/L3)
- ✅ Performance: p95 < 200ms storage, <50ms retrieval
- ✅ Migration from old storage completes successfully
- ✅ `pnpm test` passes all storage tests (20+ tests)
- ✅ Handles 1000+ concurrent operations

**Deliverables:**
- `/apps/sign-service/src/services/storage-manager.ts` (new)
- `/apps/sign-service/src/services/s3-storage.ts` (new)
- `/apps/sign-service/src/services/cloudflare-r2-storage.ts` (new)
- `/apps/sign-service/src/services/cache-manager.ts` (new)
- `/apps/sign-service/src/services/deduplication-service.ts` (new)
- `/apps/sign-service/src/services/migration-service.ts` (new)
- `/apps/sign-service/src/tests/unit/storage.test.ts` (comprehensive)
- `/apps/sign-service/src/tests/performance/storage-performance.test.ts` (new)
- `/apps/sign-service/STORAGE-MIGRATION-REPORT.md` (new)

---

### **Week 5-6: Survival Testing & Polish** ⏱️ 10 days

**Goal:** Prove signatures survive real-world transformations and optimize performance

#### Tasks:

**Day 1-4: Advanced Survival Testing Framework**

**Real-World Transformation Tests:**
```typescript
export class RealWorldSurvivalTester {
  private testScenarios: RealWorldScenario[] = [
    {
      name: 'Instagram Upload',
      description: 'Simulate Instagram photo processing',
      transform: async (img) => {
        return await sharp(img)
          .resize(1080, 1080, { fit: 'cover' })
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
      },
      expectedSurvival: 0.90
    },
    {
      name: 'Twitter Compression',
      description: 'Simulate Twitter image optimization',
      transform: async (img) => {
        return await sharp(img)
          .resize(1200, 675, { fit: 'cover' })
          .webp({ quality: 80 })
          .toBuffer();
      },
      expectedSurvival: 0.88
    },
    {
      name: 'Facebook Processing',
      description: 'Simulate Facebook image handling',
      transform: async (img) => {
        return await sharp(img)
          .resize(2048, 2048, { fit: 'inside' })
          .jpeg({ quality: 90, mozjpeg: true })
          .toBuffer();
      },
      expectedSurvival: 0.92
    },
    {
      name: 'WhatsApp Compression',
      description: 'Simulate WhatsApp image compression',
      transform: async (img) => {
        return await sharp(img)
          .resize(1600, 1600, { fit: 'inside' })
          .jpeg({ quality: 75 })
          .toBuffer();
      },
      expectedSurvival: 0.85
    },
    {
      name: 'LinkedIn Processing',
      description: 'Simulate LinkedIn image optimization',
      transform: async (img) => {
        return await sharp(img)
          .resize(1200, 627, { fit: 'cover' })
          .jpeg({ quality: 85 })
          .toBuffer();
      },
      expectedSurvival: 0.88
    },
    {
      name: 'TikTok Processing',
      description: 'Simulate TikTok video thumbnail processing',
      transform: async (img) => {
        return await sharp(img)
          .resize(1080, 1920, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
      },
      expectedSurvival: 0.85
    },
    {
      name: 'Pinterest Optimization',
      description: 'Simulate Pinterest image processing',
      transform: async (img) => {
        return await sharp(img)
          .resize(736, null, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
      },
      expectedSurvival: 0.90
    },
    {
      name: 'Google Photos Backup',
      description: 'Simulate Google Photos storage compression',
      transform: async (img) => {
        return await sharp(img)
          .jpeg({ quality: 85, progressive: true })
          .toBuffer();
      },
      expectedSurvival: 0.95
    },
    {
      name: 'iCloud Photo Storage',
      description: 'Simulate iCloud photo optimization',
      transform: async (img) => {
        return await sharp(img)
          .heif({ quality: 85 })
          .toBuffer();
      },
      expectedSurvival: 0.70 // HEIF conversion is more aggressive
    },
    {
      name: 'Dropbox Sync',
      description: 'Simulate Dropbox image sync',
      transform: async (img) => {
        return await sharp(img)
          .jpeg({ quality: 90 })
          .toBuffer();
      },
      expectedSurvival: 0.95
    },
    {
      name: 'Slack Image Upload',
      description: 'Simulate Slack image processing',
      transform: async (img) => {
        return await sharp(img)
          .resize(2000, 2000, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer();
      },
      expectedSurvival: 0.90
    },
    {
      name: 'Discord Image Share',
      description: 'Simulate Discord image compression',
      transform: async (img) => {
        return await sharp(img)
          .resize(1920, 1080, { fit: 'inside' })
          .webp({ quality: 80 })
          .toBuffer();
      },
      expectedSurvival: 0.88
    },
    {
      name: 'Email Attachment',
      description: 'Simulate email attachment compression',
      transform: async (img) => {
        return await sharp(img)
          .resize(1024, 1024, { fit: 'inside' })
          .jpeg({ quality: 75 })
          .toBuffer();
      },
      expectedSurvival: 0.85
    },
    {
      name: 'MMS Message',
      description: 'Simulate MMS image compression',
      transform: async (img) => {
        return await sharp(img)
          .resize(640, 480, { fit: 'inside' })
          .jpeg({ quality: 70 })
          .toBuffer();
      },
      expectedSurvival: 0.80
    }
  ];

  async runRealWorldTests(testImages: Buffer[]): Promise<RealWorldSurvivalReport> {
    const results: RealWorldTestResult[] = [];
    
    for (const scenario of this.testScenarios) {
      console.log(`Testing real-world scenario: ${scenario.name}`);
      
      let survivedCount = 0;
      let totalCount = testImages.length;
      const failureReasons: Map<string, number> = new Map();
      
      for (const image of testImages) {
        try {
          // Sign the original image
          const signResult = await signService.signImage(image);
          
          // Apply real-world transformation
          const transformedImage = await scenario.transform(signResult.signedImage);
          
          // Try to verify
          const verifyResult = await verifyService.verifyImage(transformedImage);
          
          if (verifyResult.confidence > 30) {
            survivedCount++;
          } else {
            const reason = this.determineFailureReason(verifyResult);
            failureReasons.set(reason, (failureReasons.get(reason) || 0) + 1);
          }
        } catch (error) {
          failureReasons.set('processing_error', (failureReasons.get('processing_error') || 0) + 1);
        }
      }
      
      const survivalRate = survivedCount / totalCount;
      results.push({
        scenario: scenario.name,
        description: scenario.description,
        survivalRate,
        expectedSurvival: scenario.expectedSurvival,
        passed: survivalRate >= scenario.expectedSurvival * 0.9,
        failureReasons: Object.fromEntries(failureReasons),
        sampleSize: totalCount
      });
    }
    
    return {
      timestamp: new Date().toISOString(),
      totalScenarios: this.testScenarios.length,
      results,
      averageSurvival: results.reduce((sum, r) => sum + r.survivalRate, 0) / results.length,
      passedScenarios: results.filter(r => r.passed).length,
      recommendations: this.generateRecommendations(results)
    };
  }

  private determineFailureReason(verifyResult: VerificationResult): string {
    if (verifyResult.confidence < 30) {
      if (!verifyResult.extractionResult.manifest) {
        return 'manifest_not_found';
      } else if (!verifyResult.signatureResult.isValid) {
        return 'signature_invalid';
      } else if (!verifyResult.certificateResult.isValid) {
        return 'certificate_invalid';
      } else {
        return 'low_confidence';
      }
    }
    return 'unknown';
  }

  private generateRecommendations(results: RealWorldTestResult[]): string[] {
    const recommendations: string[] = [];
    const failedScenarios = results.filter(r => !r.passed);
    
    if (failedScenarios.length > 0) {
      recommendations.push(`${failedScenarios.length} scenarios failed survival testing`);
      
      // Analyze common failure patterns
      const commonFailures = new Map<string, number>();
      failedScenarios.forEach(scenario => {
        Object.entries(scenario.failureReasons).forEach(([reason, count]) => {
          commonFailures.set(reason, (commonFailures.get(reason) || 0) + count);
        });
      });
      
      const topFailure = Array.from(commonFailures.entries())
        .sort(([,a], [,b]) => b - a)[0];
      
      if (topFailure) {
        recommendations.push(`Most common failure: ${topFailure[0]} (${topFailure[1]} occurrences)`);
      }
    }
    
    const avgSurvival = results.reduce((sum, r) => sum + r.survivalRate, 0) / results.length;
    if (avgSurvival < 0.85) {
      recommendations.push('Overall survival rate below target (85%)');
    }
    
    return recommendations;
  }
}
```

**Day 5-6: Advanced Performance Optimization**

**Performance Profiling Framework:**
```typescript
export class PerformanceProfiler {
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private thresholds: PerformanceThresholds;

  constructor() {
    this.thresholds = {
      signing: { p50: 1000, p95: 2000, p99: 3000 }, // ms
      verification: { p50: 200, p95: 500, p99: 1000 }, // ms
      storage: { p50: 100, p95: 200, p99: 400 }, // ms
      memory: { maxHeap: 512 * 1024 * 1024, maxIncrease: 100 * 1024 * 1024 } // bytes
    };
  }

  async profileOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<{ result: T; metrics: OperationMetrics }> {
    const startMemory = process.memoryUsage();
    const startTime = process.hrtime.bigint();
    
    try {
      const result = await fn();
      
      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();
      
      const duration = Number(endTime - startTime) / 1000000; // Convert to ms
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
      
      const metrics: OperationMetrics = {
        operation,
        duration,
        memoryUsed: endMemory.heapUsed,
        memoryDelta,
        timestamp: new Date().toISOString()
      };
      
      this.recordMetrics(operation, metrics);
      
      return { result, metrics };
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const duration = Number(endTime - startTime) / 1000000;
      
      this.recordMetrics(operation, {
        operation,
        duration,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  async runLoadTest(
    operation: string,
    fn: () => Promise<any>,
    concurrency: number,
    duration: number
  ): Promise<LoadTestReport> {
    console.log(`Starting load test: ${operation} (concurrency: ${concurrency}, duration: ${duration}s)`);
    
    const results: OperationResult[] = [];
    const startTime = Date.now();
    let completedRequests = 0;
    let failedRequests = 0;
    
    const runRequest = async (): Promise<void> => {
      const requestStart = Date.now();
      try {
        await fn();
        completedRequests++;
        results.push({
          success: true,
          duration: Date.now() - requestStart,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        failedRequests++;
        results.push({
          success: false,
          duration: Date.now() - requestStart,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    };
    
    // Run concurrent requests for specified duration
    const promises: Promise<void>[] = [];
    const interval = setInterval(() => {
      for (let i = 0; i < concurrency; i++) {
        promises.push(runRequest());
      }
    }, 1000); // Add new batch every second
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    clearInterval(interval);
    
    // Wait for all pending requests to complete
    await Promise.all(promises);
    
    const totalTime = Date.now() - startTime;
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);
    
    const report: LoadTestReport = {
      operation,
      concurrency,
      duration: totalTime,
      totalRequests: completedRequests + failedRequests,
      successfulRequests: completedRequests,
      failedRequests,
      requestsPerSecond: (completedRequests / totalTime) * 1000,
      errorRate: failedRequests / (completedRequests + failedRequests),
      latency: {
        p50: this.percentile(durations, 0.5),
        p95: this.percentile(durations, 0.95),
        p99: this.percentile(durations, 0.99),
        average: durations.reduce((sum, d) => sum + d, 0) / durations.length
      },
      passedThresholds: this.evaluateThresholds(operation, successfulResults),
      timestamp: new Date().toISOString()
    };
    
    return report;
  }

  private percentile(values: number[], p: number): number {
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  private evaluateThresholds(operation: string, results: OperationResult[]): ThresholdEvaluation {
    const thresholds = this.thresholds[operation];
    if (!thresholds) {
      return { passed: true, details: ['No thresholds defined'] };
    }
    
    const durations = results.map(r => r.duration);
    const p50 = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);
    const p99 = this.percentile(durations, 0.99);
    
    const details: string[] = [];
    let passed = true;
    
    if (p50 > thresholds.p50) {
      passed = false;
      details.push(`P50 latency ${p50}ms exceeds threshold ${thresholds.p50}ms`);
    }
    
    if (p95 > thresholds.p95) {
      passed = false;
      details.push(`P95 latency ${p95}ms exceeds threshold ${thresholds.p95}ms`);
    }
    
    if (p99 > thresholds.p99) {
      passed = false;
      details.push(`P99 latency ${p99}ms exceeds threshold ${thresholds.p99}ms`);
    }
    
    return { passed, details };
  }

  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {
      timestamp: new Date().toISOString(),
      operations: []
    };
    
    for (const [operation, metrics] of this.metrics.entries()) {
      const durations = metrics.filter(m => !m.error).map(m => m.duration);
      
      report.operations.push({
        operation,
        totalRequests: metrics.length,
        successfulRequests: durations.length,
        failedRequests: metrics.length - durations.length,
        averageLatency: durations.reduce((sum, d) => sum + d, 0) / durations.length,
        p50Latency: this.percentile(durations, 0.5),
        p95Latency: this.percentile(durations, 0.95),
        p99Latency: this.percentile(durations, 0.99),
        errorRate: (metrics.length - durations.length) / metrics.length,
        thresholdEvaluation: this.evaluateThresholds(operation, metrics.map(m => ({
          success: !m.error,
          duration: m.duration,
          timestamp: m.timestamp
        })))
      });
    }
    
    return report;
  }
}
```

**Memory Optimization Service:**
```typescript
export class MemoryOptimizer {
  private memoryThresholds: MemoryThresholds;
  private gcInterval?: NodeJS.Timeout;
  private memoryMonitorInterval?: NodeJS.Timeout;

  constructor() {
    this.memoryThresholds = {
      maxHeapSize: 512 * 1024 * 1024, // 512MB
      maxIncreasePerMinute: 50 * 1024 * 1024, // 50MB/min
      gcThreshold: 400 * 1024 * 1024 // 400MB
    };
  }

  startMonitoring(): void {
    // Monitor memory usage every 30 seconds
    this.memoryMonitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);
    
    // Force garbage collection every 5 minutes if available
    if (global.gc) {
      this.gcInterval = setInterval(() => {
        global.gc();
        console.log('Forced garbage collection completed');
      }, 5 * 60 * 1000);
    }
  }

  stopMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
  }

  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;
    
    // Check if we're approaching the heap size limit
    if (heapUsed > this.memoryThresholds.maxHeapSize) {
      console.warn(`Memory usage high: ${Math.round(heapUsed / 1024 / 1024)}MB`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        
        const newMemUsage = process.memoryUsage();
        const reduction = heapUsed - newMemUsage.heapUsed;
        console.log(`GC freed ${Math.round(reduction / 1024 / 1024)}MB`);
      }
    }
    
    // Check if we should trigger GC based on threshold
    if (heapUsed > this.memoryThresholds.gcThreshold && global.gc) {
      global.gc();
    }
  }

  optimizeImageProcessing(): void {
    // Configure Sharp for memory efficiency
    const sharp = require('sharp');
    sharp.cache({ memory: 50, files: 20, items: 100 }); // Limit cache sizes
    
    // Set concurrency to limit memory usage
    sharp.concurrency(2); // Limit to 2 threads
  }

  getMemoryUsage(): MemoryUsageReport {
    const memUsage = process.memoryUsage();
    
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUtilization: memUsage.heapUsed / memUsage.heapTotal,
      timestamp: new Date().toISOString()
    };
  }
}
```

**Day 7-8: Comprehensive Testing Suite**

**End-to-End Survival Tests:**
```typescript
// /apps/sign-service/src/tests/survival/real-world-survival.test.ts
describe('Real-World Survival Tests', () => {
  const testImages = [
    './test-fixtures/images/portrait-4k.jpg',
    './test-fixtures/images/landscape-nature.jpg',
    './test-fixtures/images/urban-architecture.jpg',
    './test-fixtures/images/product-photo.jpg',
    './test-fixtures/images/selfphone-camera.jpg',
    './test-fixtures/images/drone-aerial.jpg',
    './test-fixtures/images/food-photography.jpg',
    './test-fixtures/images/sports-action.jpg'
  ];

  describe('Social Media Platform Tests', () => {
    it('should survive Instagram processing pipeline', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const instagramResult = report.results.find(r => r.scenario === 'Instagram Upload');
      
      expect(instagramResult).to.not.be.undefined;
      expect(instagramResult.survivalRate).to.be.greaterThan(0.85);
      expect(instagramResult.passed).to.be.true;
    });

    it('should survive Twitter image optimization', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const twitterResult = report.results.find(r => r.scenario === 'Twitter Compression');
      
      expect(twitterResult.survivalRate).to.be.greaterThan(0.83);
      expect(twitterResult.passed).to.be.true;
    });

    it('should survive Facebook processing', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const facebookResult = report.results.find(r => r.scenario === 'Facebook Processing');
      
      expect(facebookResult.survivalRate).to.be.greaterThan(0.87);
      expect(facebookResult.passed).to.be.true;
    });
  });

  describe('Cloud Storage Service Tests', () => {
    it('should survive Google Photos compression', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const googlePhotosResult = report.results.find(r => r.scenario === 'Google Photos Backup');
      
      expect(googlePhotosResult.survivalRate).to.be.greaterThan(0.90);
      expect(googlePhotosResult.passed).to.be.true;
    });

    it('should survive iCloud HEIF conversion', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const iCloudResult = report.results.find(r => r.scenario === 'iCloud Photo Storage');
      
      expect(iCloudResult.survivalRate).to.be.greaterThan(0.65); // Lower threshold for HEIF
    });
  });

  describe('Messaging Platform Tests', () => {
    it('should survive WhatsApp compression', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const whatsappResult = report.results.find(r => r.scenario === 'WhatsApp Compression');
      
      expect(whatsappResult.survivalRate).to.be.greaterThan(0.80);
      expect(whatsappResult.passed).to.be.true;
    });

    it('should survive Discord processing', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      const discordResult = report.results.find(r => r.scenario === 'Discord Image Share');
      
      expect(discordResult.survivalRate).to.be.greaterThan(0.83);
      expect(discordResult.passed).to.be.true;
    });
  });

  describe('Overall Survival Metrics', () => {
    it('should maintain 85%+ average survival rate', async () => {
      const survivalTester = new RealWorldSurvivalTester();
      const testBuffers = testImages.map(path => readFileSync(path));
      
      const report = await survivalTester.runRealWorldTests(testBuffers);
      
      expect(report.averageSurvival).to.be.greaterThan(0.85);
      expect(report.passedScenarios).to.be.greaterThan(report.totalScenarios * 0.8);
    });
  });
});
```

**Performance Load Tests:**
```typescript
// /apps/sign-service/src/tests/performance/load-testing.test.ts
describe('Load Testing', () => {
  let profiler: PerformanceProfiler;
  
  before(() => {
    profiler = new PerformanceProfiler();
  });

  describe('Signing Service Load Tests', () => {
    it('should handle 50 concurrent signing requests', async () => {
      const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
      
      const report = await profiler.runLoadTest(
        'signing',
        () => signService.signImage(testImage),
        50, // concurrency
        30  // duration in seconds
      );
      
      expect(report.requestsPerSecond).to.be.greaterThan(10);
      expect(report.errorRate).to.be.lessThan(0.01); // < 1% error rate
      expect(report.latency.p95).to.be.lessThan(2000);
      expect(report.passedThresholds.passed).to.be.true;
    });

    it('should handle 100 concurrent verification requests', async () => {
      const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const signResult = await signService.signImage(testImage);
      
      const report = await profiler.runLoadTest(
        'verification',
        () => verifyService.verifyImage(signResult.signedImage),
        100, // concurrency
        30   // duration in seconds
      );
      
      expect(report.requestsPerSecond).to.be.greaterThan(50);
      expect(report.errorRate).to.be.lessThan(0.01);
      expect(report.latency.p95).to.be.lessThan(500);
      expect(report.passedThresholds.passed).to.be.true;
    });
  });

  describe('Storage Service Load Tests', () => {
    it('should handle 200 concurrent storage operations', async () => {
      const manifest = createTestManifest();
      
      const report = await profiler.runLoadTest(
        'storage',
        () => storageManager.storeProof(manifest, `test-${Date.now()}-${Math.random()}`),
        200, // concurrency
        30   // duration in seconds
      );
      
      expect(report.requestsPerSecond).to.be.greaterThan(100);
      expect(report.errorRate).to.be.lessThan(0.02);
      expect(report.latency.p95).to.be.lessThan(200);
      expect(report.passedThresholds.passed).to.be.true;
    });
  });

  describe('Memory Usage Under Load', () => {
    it('should maintain stable memory usage during sustained load', async () => {
      const memoryOptimizer = new MemoryOptimizer();
      memoryOptimizer.startMonitoring();
      
      const initialMemory = memoryOptimizer.getMemoryUsage();
      
      // Run sustained load for 2 minutes
      const testImage = readFileSync('./test-fixtures/images/test-image.jpg');
      const promises: Promise<any>[] = [];
      
      for (let i = 0; i < 120; i++) { // 2 minutes of operations
        promises.push(
          signService.signImage(testImage),
          verifyService.verifyImage(testImage),
          storageManager.storeProof(createTestManifest(), `load-test-${i}`)
        );
        
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay every 10 operations
        }
      }
      
      await Promise.all(promises);
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = memoryOptimizer.getMemoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      expect(memoryIncrease).to.be.lessThan(100 * 1024 * 1024); // < 100MB increase
      expect(finalMemory.heapUtilization).to.be.lessThan(0.9); // < 90% utilization
      
      memoryOptimizer.stopMonitoring();
    });
  });
});
```

**Day 9-10: Polish & Documentation**

**Comprehensive Error Handling:**
```typescript
export class ErrorHandler {
  private errorCounts: Map<string, number> = new Map();
  private lastErrors: ErrorEvent[] = [];
  private maxStoredErrors = 100;

  handleError(error: Error, context: ErrorContext): void {
    const errorKey = `${error.name}:${error.code || 'UNKNOWN'}`;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || 0) + 1);
    
    const errorEvent: ErrorEvent = {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      count: this.errorCounts.get(errorKey)
    };
    
    this.lastErrors.unshift(errorEvent);
    if (this.lastErrors.length > this.maxStoredErrors) {
      this.lastErrors.pop();
    }
    
    // Log error with appropriate level
    if (this.isCriticalError(error)) {
      console.error('CRITICAL ERROR:', errorEvent);
    } else {
      console.warn('Error:', errorEvent);
    }
    
    // Send to monitoring service if configured
    if (process.env.ERROR_MONITORING_ENDPOINT) {
      this.sendToMonitoring(errorEvent);
    }
  }

  private isCriticalError(error: Error): boolean {
    const criticalErrors = [
      'StorageUnavailable',
      'CertificateRevoked',
      'SignatureCorruption',
      'MemoryLimitExceeded'
    ];
    
    return criticalErrors.includes(error.name) || 
           criticalErrors.includes(error.code) ||
           error.message.includes('out of memory') ||
           error.message.includes('disk full');
  }

  getErrorReport(): ErrorReport {
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
      errorTypes: Object.fromEntries(this.errorCounts),
      recentErrors: this.lastErrors.slice(0, 10),
      timestamp: new Date().toISOString()
    };
  }
}
```

**Acceptance Criteria:**
- ✅ Real-world survival testing completed (15+ platforms)
- ✅ Average survival rate > 85% across all platforms
- ✅ Performance: p95 < 2s signing, <500ms verification
- ✅ Load testing: 50+ concurrent signing, 100+ concurrent verification
- ✅ Memory usage stable under sustained load (<100MB increase)
- ✅ Error handling comprehensive with monitoring
- ✅ All tests passing (50+ total tests)
- ✅ Documentation complete with survival report

**Deliverables:**
- `/apps/sign-service/src/services/real-world-survival-tester.ts` (new)
- `/apps/sign-service/src/services/performance-profiler.ts` (new)
- `/apps/sign-service/src/services/memory-optimizer.ts` (new)
- `/apps/sign-service/src/services/error-handler.ts` (new)
- `/apps/sign-service/src/tests/survival/real-world-survival.test.ts` (comprehensive)
- `/apps/sign-service/src/tests/performance/load-testing.test.ts` (comprehensive)
- `/apps/sign-service/SURVIVAL-REPORT.md` (detailed results)
- `/apps/sign-service/PERFORMANCE-REPORT.md` (benchmark results)

---

### **Week 7-8: API Gateway & Rate Limiting** ⏱️ 10 days

**Goal:** Build production-ready API with authentication, rate limiting, and monitoring

#### Tasks:

**Day 1-3: API Gateway Implementation**

**Express.js API Gateway:**
```typescript
// /apps/api-gw/src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';
import { errorHandler } from './middleware/error-handler';
import { metricsMiddleware } from './middleware/metrics';
import { signingRoutes } from './routes/signing';
import { verificationRoutes } from './routes/verification';
import { healthRoutes } from './routes/health';

export class APIGateway {
  private app: express.Application;
  private server?: any;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: (origin, callback) => {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
    }));

    // Compression
    this.app.use(compression({
      threshold: 1024, // Only compress responses > 1KB
      level: 6
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Metrics collection
    this.app.use(metricsMiddleware);
  }

  private setupRoutes(): void {
    // Health check (no auth required)
    this.app.use('/health', healthRoutes);

    // API routes with authentication
    this.app.use('/api/v1/sign', authMiddleware, validationMiddleware, signingRoutes);
    this.app.use('/api/v1/verify', authMiddleware, validationMiddleware, verificationRoutes);

    // API documentation
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'CredLink API',
        version: '1.0.0',
        endpoints: {
          sign: {
            path: '/api/v1/sign',
            method: 'POST',
            description: 'Sign an image with C2PA manifest',
            authentication: 'required'
          },
          verify: {
            path: '/api/v1/verify',
            method: 'POST',
            description: 'Verify an image signature',
            authentication: 'required'
          }
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString()
      });
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, (err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log(`API Gateway started on port ${port}`);
          resolve();
        }
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('API Gateway stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
```

**Authentication Middleware:**
```typescript
// /apps/api-gw/src/middleware/auth.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    plan: 'free' | 'pro' | 'enterprise';
    rateLimitTier: number;
  };
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    let token: string;

    // Support both Bearer token and API key
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (apiKey) {
      token = apiKey;
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    // Load user from database (or cache)
    const user = await loadUser(decoded.userId);
    if (!user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User not found',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Account is suspended',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      plan: user.plan,
      rateLimitTier: getRateLimitTier(user.plan)
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    } else if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token expired',
        timestamp: new Date().toISOString()
      });
    } else {
      console.error('Auth middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
        timestamp: new Date().toISOString()
      });
    }
  }
};

function getRateLimitTier(plan: string): number {
  switch (plan) {
    case 'free': return 1;
    case 'pro': return 2;
    case 'enterprise': return 3;
    default: return 1;
  }
}

- `/apps/api-gw/OPENAPI.yaml` (API documentation)

---

### **Week 9-10: Production Deployment & Monitoring** ⏱️ 10 days

**Goal:** Deploy to production with full monitoring, alerting, and reliability

#### Tasks:

**Day 1-3: Infrastructure Setup**

**AWS ECS Deployment:**
```yaml
# /infra/ecs/credlink-api-task-definition.json
{
  "family": "credlink-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/credlinkTaskRole",
  "containerDefinitions": [
    {
      "name": "credlink-api",
      "image": "ACCOUNT.dkr.ecr.REGION.amazonaws.com/credlink-api:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "REDIS_HOST",
          "value": "redis-cluster.production.internal"
        },
        {
          "name": "DB_HOST",
          "value": "postgres-cluster.production.internal"
        }
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:credlink/jwt-secret"
        },
        {
          "name": "DB_PASSWORD",
          "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:credlink/db-password"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/credlink-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
```

**Application Load Balancer Configuration:**
```yaml
# /infra/alb/credlink-alb.yaml
Resources:
  CredLinkLoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Properties:
      Name: credlink-api-prod
      Scheme: internet-facing
      Type: application
      Subnets:
        - !Ref PublicSubnet1
        - !Ref PublicSubnet2
        - !Ref PublicSubnet3
      SecurityGroups:
        - !Ref ALBSecurityGroup
      
  ALBSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for CredLink ALB
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
          
  HTTPListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref CredLinkLoadBalancer
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: redirect
          RedirectConfig:
            Protocol: HTTPS
            Port: "443"
            StatusCode: HTTP_301
            
  HTTPSListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Properties:
      LoadBalancerArn: !Ref CredLinkLoadBalancer
      Port: 443
      Protocol: HTTPS
      Certificates:
        - CertificateArn: !Ref SSLCertificate
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref TargetGroup
          
  TargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Properties:
      Name: credlink-api-targets
      Port: 3000
      Protocol: HTTP
      VpcId: !Ref VPC
      HealthCheckProtocol: HTTP
      HealthCheckPath: /health
      HealthCheckIntervalSeconds: 30
      HealthCheckTimeoutSeconds: 5
      HealthyThresholdCount: 2
      UnhealthyThresholdCount: 3
      TargetType: ip
```

**Day 4-6: Monitoring & Alerting**

**CloudWatch Dashboards:**
```typescript
// /infra/monitoring/cloudwatch-dashboard.json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ECS", "CPUUtilization", "ServiceName", "credlink-api"],
          [".", "MemoryUtilization", ".", "."]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "ECS Service Metrics",
        "period": 60
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", "credlink-api-prod"],
          [".", "TargetResponseTime", ".", "."],
          [".", "HTTPCode_Target_5XX_Count", ".", "."],
          [".", "HTTPCode_Target_4XX_Count", ".", "."]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "ALB Metrics",
        "period": 60
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", "credlink-postgres"],
          [".", "DatabaseConnections", ".", "."],
          [".", "FreeStorageSpace", ".", "."]
        ],
        "view": "timeSeries",
        "stacked": false,
        "region": "us-east-1",
        "title": "RDS Metrics",
        "period": 60
      }
    }
  ]
}
```

**Prometheus & Grafana Integration:**
```yaml
# /infra/monitoring/prometheus-config.yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'credlink-api'
    static_configs:
      - targets: ['api.credlink.com:443']
    metrics_path: '/metrics'
    scheme: 'https'
    tls_config:
      cert_file: /etc/ssl/certs/api.credlink.com.crt
      key_file: /etc/ssl/private/api.credlink.com.key
      insecure_skip_verify: false
    
  - job_name: 'redis'
    static_configs:
      - targets: ['redis.production.internal:9121']
      
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres.production.internal:9187']

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

**Alert Rules:**
```yaml
# /infra/monitoring/alert_rules.yml
groups:
  - name: credlink_alerts
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{status_code=~"5.."}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors per second"
          
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency detected"
          description: "95th percentile latency is {{ $value }} seconds"
          
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value | humanizePercentage }}"
          
      - alert: DatabaseConnectionsHigh
        expr: aws_rds_database_connections > 80
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "High database connections"
          description: "Database has {{ $value }} active connections"
```

**Day 7-8: Logging & Error Tracking**

**Structured Logging with Winston:**
```typescript
// /apps/api-gw/src/utils/logger.ts
import winston from 'winston';
import { Request } from 'express';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'credlink-api',
    version: process.env.SERVICE_VERSION || '1.0.0'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});

// Add CloudWatch transport in production
if (process.env.NODE_ENV === 'production') {
  const CloudWatchTransport = require('winston-cloudwatch');
  logger.add(new CloudWatchTransport({
    logGroupName: '/aws/ecs/credlink-api',
    logStreamName: () => {
      const date = new Date().toISOString().split('T')[0];
      return `${date}-${process.env.ECS_TASK_ID || 'local'}`;
    }
  }));
}

export const logRequest = (req: Request, message: string, meta?: any) => {
  logger.info(message, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: (req as any).user?.id,
    ...meta
  });
};

export const logError = (req: Request, error: Error, meta?: any) => {
  logger.error(error.message, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: (req as any).user?.id,
    stack: error.stack,
    ...meta
  });
};

export { logger };
```

**Sentry Integration for Error Tracking:**
```typescript
// /apps/api-gw/src/utils/sentry.ts
import * as Sentry from '@sentry/node';
import { Request } from 'express';

export const initializeSentry = () => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SERVICE_VERSION || '1.0.0',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app })
      ]
    });
  }
};

export const captureException = (req: Request, error: Error, context?: any) => {
  Sentry.withScope((scope) => {
    scope.setTag('requestId', req.requestId);
    scope.setTag('userId', (req as any).user?.id);
    scope.setTag('path', req.path);
    scope.setTag('method', req.method);
    
    if (context) {
      scope.setContext('additional', context);
    }
    
    Sentry.captureException(error);
  });
};

export const captureMessage = (req: Request, message: string, level: Sentry.Severity = 'info') => {
  Sentry.withScope((scope) => {
    scope.setTag('requestId', req.requestId);
    scope.setTag('userId', (req as any).user?.id);
    scope.setTag('path', req.path);
    
    Sentry.captureMessage(message, level);
  });
};
```

**Day 9-10: Performance Optimization & Documentation**

**CDN Configuration with CloudFront:**
```typescript
// /infra/cloudfront/credlink-distribution.json
{
  "DistributionConfig": {
    "CallerReference": "credlink-api-v1",
    "Comment": "CredLink API Distribution",
    "DefaultRootObject": "",
    "Origins": {
      "Quantity": 1,
      "Items": [
        {
          "Id": "ECS-origin",
          "DomainName": "credlink-api-prod.us-east-1.elb.amazonaws.com",
          "CustomOriginConfig": {
            "HTTPPort": 80,
            "HTTPSPort": 443,
            "OriginProtocolPolicy": "https-only",
            "OriginSslProtocols": {
              "Quantity": 3,
              "Items": ["TLSv1.2", "TLSv1.1", "TLSv1"]
            }
          }
        }
      ]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "ECS-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "TrustedSigners": {
        "Enabled": false,
        "Quantity": 0
      },
      "ForwardedValues": {
        "QueryString": true,
        "Cookies": {
          "Forward": "all"
        },
        "Headers": {
          "Quantity": 3,
          "Items": ["Authorization", "X-API-Key", "Content-Type"]
        }
      },
      "MinTTL": 0,
      "DefaultTTL": 0,
      "MaxTTL": 0
    },
    "Enabled": true,
    "HttpVersion": "http2",
    "PriceClass": "PriceClass_100",
    "ViewerCertificate": {
      "ACMCertificateArn": "arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID",
      "SSLSupportMethod": "sni-only",
      "MinimumProtocolVersion": "TLSv1.2_2021"
    }
  }
}
```

**Performance Monitoring with New Relic:**
```typescript
// /apps/api-gw/src/utils/newrelic.ts
import * as newrelic from 'newrelic';

export const recordCustomMetric = (name: string, value: number, attributes?: any) => {
  newrelic.recordMetric(name, value, attributes);
};

export const recordWebTransaction = (name: string, fn: () => Promise<any>) => {
  return newrelic.startSegment(name, true, fn);
};

export const addCustomAttribute = (key: string, value: string) => {
  newrelic.addCustomAttribute(key, value);
};

export const noticeError = (error: Error, customAttributes?: any) => {
  newrelic.noticeError(error, customAttributes);
};
```

**Acceptance Criteria:**
- ✅ ECS service running with Fargate
- ✅ Application Load Balancer with HTTPS
- ✅ Auto-scaling configured (min 2, max 10 tasks)
- ✅ CloudWatch dashboards and alerts
- ✅ Prometheus metrics collection
- ✅ Grafana dashboards
- ✅ Structured logging to CloudWatch
- ✅ Sentry error tracking
- ✅ CDN distribution with CloudFront
- ✅ Performance monitoring with New Relic
- ✅ 99.9% uptime SLA
- ✅ p95 latency < 1s

**Deliverables:**
- `/infra/ecs/credlink-api-task-definition.json` (ECS configuration)
- `/infra/alb/credlink-alb.yaml` (Load balancer setup)
- `/infra/monitoring/cloudwatch-dashboard.json` (CloudWatch config)
- `/infra/monitoring/prometheus-config.yaml` (Prometheus setup)
- `/infra/monitoring/alert_rules.yml` (Alerting rules)
- `/apps/api-gw/src/utils/logger.ts` (Structured logging)
- `/apps/api-gw/src/utils/sentry.ts` (Error tracking)
- `/infra/cloudfront/credlink-distribution.json` (CDN setup)
- `/infra/autoscaling/credlink-autoscaling.yaml` (Auto-scaling config)
- `/docs/DEPLOYMENT-GUIDE.md` (Production deployment guide)

---

### **Week 3-4: Real Proof Storage (S3/Cloudflare R2)** ⏱️ 10 days

**Goal:** Replace in-memory storage with persistent remote storage

#### Tasks:

**Day 1-2: S3 Integration**
- [ ] Create `S3ProofStorage` class:
  ```typescript
  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    const key = `proofs/${imageHash}.json.gz`;
    const compressed = gzip(JSON.stringify(manifest));
    await s3.putObject({
      Bucket: 'credlink-proofs',
      Key: key,
      Body: compressed,
      ServerSideEncryption: 'AES256'
    });
    return `https://proofs.credlink.com/${imageHash}`;
  }
  ```
- [ ] Add environment variables:
  - `AWS_S3_BUCKET`
  - `AWS_REGION`
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
- [ ] Create S3 bucket with:
  - Versioning enabled
  - Server-side encryption
  - Lifecycle policy (delete after 1 year)
  - Access logging

**Day 3-4: Cloudflare R2 Alternative**
- [ ] Create `CloudflareR2Storage` class as alternative:
  - Better for serving proofs globally
  - <50ms latency to any location
  - Cheaper than S3 ($0.015/GB vs $0.023/GB)
- [ ] Add conditional logic:
  ```typescript
  const storage = process.env.STORAGE_BACKEND === 'r2'
    ? new CloudflareR2Storage()
    : new S3ProofStorage();
  ```
- [ ] Set up R2 bucket with:
  - Custom domain for serving
  - Cache headers (1 year TTL)
  - CORS for verification

**Day 5-6: Retrieval & Caching**
- [ ] Implement proof retrieval with caching:
  ```typescript
  async retrieveProof(proofId: string): Promise<C2PAManifest | null> {
    // Try cache first (Redis)
    const cached = await redis.get(`proof:${proofId}`);
    if (cached) return JSON.parse(cached);

    // Fetch from S3/R2
    const proof = await s3.getObject(...).promise();
    const manifest = JSON.parse(gunzip(proof.Body));

    // Cache for 24 hours
    await redis.setex(`proof:${proofId}`, 86400, JSON.stringify(manifest));
    return manifest;
  }
  ```
- [ ] Add Redis layer:
  - 24-hour TTL for cached proofs
  - Automatic refresh on access
  - Handle cache misses

**Day 7-8: Deduplication**
- [ ] Implement image hash indexing:
  - Same image → same proof
  - Saves storage, detects duplicates
  - Index: `imageHash → proofId`
- [ ] Test deduplication:
  - Upload same image twice → same manifest
  - Upload edited image → new manifest

**Day 9-10: Testing & Migration**
- [ ] Test S3 storage:
  - Store and retrieve (10 tests)
  - Handle connection failures
  - Handle S3 errors (throttling, permissions)
  - Load test: 1000 proofs stored/retrieved
- [ ] Test Cloudflare R2 storage
- [ ] Verify old in-memory data can be migrated
- [ ] Performance test: Store/retrieve <500ms

**Acceptance Criteria:**
- ✅ Proofs persist in S3 or R2 (survives restart)
- ✅ Retrieval is <500ms (with caching)
- ✅ Deduplication works (same image = same proof)
- ✅ Proofs are compressed (gzip)
- ✅ `pnpm test` passes all storage tests (12+ tests)

**Deliverable:**
- `/apps/sign-service/src/services/s3-storage.ts` (new)
- `/apps/sign-service/src/services/cloudflare-r2-storage.ts` (new)
- `/apps/sign-service/src/tests/unit/proof-storage.test.ts` (updated)

---

### **Week 5-6: Survival Testing & Polish** ⏱️ 10 days

**Goal:** Prove signatures survive CDN transformations

#### Tasks:

**Day 1-4: Survival Test Framework**
- [ ] Create `SurvivalTester` class to test real scenarios:
  ```
  1. JPEG Quality Reduction (Q75)
  2. JPEG Quality Reduction (Q50)
  3. Format Conversion (JPG → WebP)
  4. Format Conversion (JPG → PNG)
  5. CDN Optimization (ImageMagick simulation)
  6. Metadata Stripping
  7. Compression/Decompression
  8. Resizing (same aspect ratio)
  9. Resizing (different aspect ratio)
  10. Rotation
  ```
- [ ] For each scenario:
  - Load test image
  - Compress/transform it
  - Try to extract manifest
  - Verify signature
  - Record success/failure

**Day 5-6: Fix Failures**
- Based on what doesn't survive:
  - If JPEG quality reduction kills manifest → use JUMBF container (C2PA standard)
  - If CDN stripping kills metadata → fall back to remote-only proof
  - If resizing breaks hash → use perceptual hashing instead
- [ ] Update embedding strategy:
  - Always embed in XMP (survives better than EXIF)
  - Always store proof on R2 (backup if embed fails)
  - Use JUMBF container (C2PA standard, most robust)

**Day 7-8: Load Testing**
- [ ] Test API under load:
  - 10 concurrent sign requests
  - 50 concurrent sign requests
  - 100 concurrent sign requests
  - Measure: latency, memory usage, errors
- [ ] Optimize if needed:
  - Add connection pooling
  - Add request queuing
  - Cache common operations

**Day 9-10: Documentation & Edge Cases**
- [ ] Document survival rates:
  - "Manifest survives JPEG quality reduction: 95%"
  - "Manifest survives format conversion: 90%"
  - "Manifest survives CDN optimization: 85%"
  - "Proof retrieval always works: 99.9%"
- [ ] Handle edge cases:
  - Very large images (>50MB) → error handling
  - Corrupted EXIF data → fallback to remote
  - Missing certificate → clear error message
- [ ] Write final integration tests (20+ scenarios)

**Acceptance Criteria:**
- ✅ Survival tested on 10+ real-world scenarios
- ✅ Document actual survival rates (not theoretical)
- ✅ API handles 100 concurrent requests
- ✅ Latency p95 < 2 seconds
- ✅ Zero memory leaks
- ✅ Error messages are helpful
- ✅ All 30+ integration tests pass

**Deliverable:**
- `/apps/sign-service/src/tests/survival/survival-rates.test.ts` (updated with real data)
- `/apps/sign-service/SURVIVAL-REPORT.md` (actual measured rates)
- Performance baseline

---

## **PHASE 2: INFRASTRUCTURE & DEPLOYMENT (Weeks 5-8)**

**Run Weeks 5-6 in parallel with backend Week 5-6, then do deployment Weeks 7-8**

### **Week 5-6: Database & Infrastructure Setup** ⏱️ 10 days

**Goal:** Set up AWS infrastructure for production

#### Tasks:

**Day 1-2: Clean Up Terraform**
- [ ] Review `/infra/terraform/main.tf` (current: 26KB)
- [ ] Remove commented-out terraform.tfvars
- [ ] Uncomment backend S3 configuration:
  ```hcl
  backend "s3" {
    bucket         = "credlink-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
  }
  ```
- [ ] Create S3 bucket for terraform state
- [ ] Create DynamoDB table for terraform locks

**Day 3-4: RDS PostgreSQL**
- [ ] Deploy RDS PostgreSQL:
  - Multi-AZ for high availability
  - Automated backups (30-day retention)
  - Performance Insights enabled
  - Environment: `db.t3.medium` (1 vCPU, 4GB RAM) to start
- [ ] Create database schema:
  - `proofs` table (manifest data)
  - `signing_keys` table (rotation tracking)
  - `audit_logs` table (compliance)
- [ ] Test connection from local machine
- [ ] Set up automated backups to S3

**Day 5-6: Redis Cache**
- [ ] Deploy ElastiCache Redis:
  - Multi-AZ with auto-failover
  - 6GB heap to start
  - Environment: `cache.t3.medium`
- [ ] Configure Redis for:
  - Proof manifest caching (24hr TTL)
  - Session storage (if adding auth later)
  - Rate limiting cache
- [ ] Test connection from local

**Day 7-8: S3 Buckets**
- [ ] Create S3 bucket for proof storage:
  - `credlink-proofs-prod`
  - Versioning enabled
  - Server-side encryption
  - Lifecycle: Delete after 1 year
  - CloudFront distribution for fast access
- [ ] Create S3 bucket for terraform state
- [ ] Set bucket policies (least privilege)

**Day 9-10: Networking**
- [ ] VPC is already designed in Terraform
- [ ] Create VPC, subnets, NAT gateway, route tables
- [ ] Create security groups:
  - RDS: Inbound from ECS only (port 5432)
  - Redis: Inbound from ECS only (port 6379)
  - ALB: Inbound from 0.0.0.0 (ports 80, 443)
  - ECS: Outbound to RDS, Redis, S3
- [ ] Test connectivity

**Acceptance Criteria:**
- ✅ Terraform applies without errors
- ✅ RDS is running in multi-AZ
- ✅ Redis is running with failover
- ✅ S3 buckets are created with correct policies
- ✅ Terraform state is stored in S3
- ✅ terraform.tfstate is not in git
- ✅ All resources have proper tags

**Deliverable:**
- Deployed AWS infrastructure
- Updated `.gitignore` to exclude terraform state
- Terraform outputs (database endpoint, Redis endpoint, bucket names)

---

### **Week 7: CI/CD & Deployment Pipeline** ⏱️ 7 days

**Goal:** Automate deployment from git push to production

#### Tasks:

**Day 1-2: GitHub Actions Setup**
- [ ] Create `.github/workflows/deploy.yml`:
  ```yaml
  on:
    push:
      branches: [main]
  jobs:
    build:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
          with:
            node-version: 20
        - run: pnpm install
        - run: pnpm build
        - run: pnpm test
        - name: Build Docker image
          run: docker build -t credlink:${{ github.sha }} .
        - name: Push to ECR
          run: aws ecr push-image ...
    deploy:
      needs: build
      runs-on: ubuntu-latest
      steps:
        - name: Deploy to ECS
          run: aws ecs update-service ...
  ```
- [ ] Create Dockerfile for backend:
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN pnpm install --prod
  COPY dist ./dist
  EXPOSE 3001
  CMD ["node", "dist/index.js"]
  ```
- [ ] Set up secrets in GitHub:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
  - `DATABASE_URL`
  - `REDIS_URL`

**Day 3-4: ECS Deployment**
- [ ] Create ECS cluster in Terraform
- [ ] Create ECS task definition (already in /infra/terraform)
- [ ] Create load balancer
- [ ] Create auto-scaling policy
  - Scale up if CPU > 70%
  - Scale down if CPU < 30%
  - Min 2 tasks, max 10 tasks
- [ ] Configure health checks
  - ECS task → /health endpoint
  - ALB → ECS tasks

**Day 5: Database Migrations**
- [ ] Create migration framework (Flyway or knex-migrate)
- [ ] Write initial migration:
  ```sql
  CREATE TABLE proofs (
    id UUID PRIMARY KEY,
    manifest JSONB NOT NULL,
    image_hash VARCHAR(64) UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    ttl_expires_at TIMESTAMP,
    access_count INT DEFAULT 0
  );

  CREATE TABLE signing_keys (
    id UUID PRIMARY KEY,
    certificate TEXT NOT NULL,
    activated_at TIMESTAMP,
    rotated_at TIMESTAMP,
    revoked_at TIMESTAMP
  );

  CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    event_type VARCHAR(64),
    user_id VARCHAR(128),
    resource_id VARCHAR(128),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Test migrations locally
- [ ] Test migrations in staging
- [ ] Automate migration on deploy (pre-deploy)

**Day 6: Monitoring & Logging**
- [ ] Set up CloudWatch:
  - Log group for each service
  - Metric: Request count, latency, errors
  - Dashboard for monitoring
- [ ] Set up alerts:
  - High error rate (>1%)
  - High latency (p95 > 2s)
  - Low disk space
  - Database connection errors
- [ ] Configure PagerDuty integration (alerts go to PagerDuty)

**Day 7: Testing Deployment**
- [ ] Deploy to staging environment first
- [ ] Run smoke tests:
  - POST /sign (upload test image)
  - POST /verify (verify test image)
  - GET /health (health check)
- [ ] Test rollback:
  - Deploy bad code
  - Trigger automatic rollback
  - Verify previous version works
- [ ] Manual testing before production

**Acceptance Criteria:**
- ✅ Git push triggers CI/CD pipeline
- ✅ Tests must pass before deployment
- ✅ Docker image builds and pushes to ECR
- ✅ ECS auto-deploys new image
- ✅ Health checks pass
- ✅ Load balancer distributes traffic
- ✅ Monitoring captures all metrics
- ✅ Can rollback in < 5 minutes

**Deliverable:**
- `.github/workflows/deploy.yml`
- `Dockerfile`
- Deployed ECS cluster
- CloudWatch dashboards
- PagerDuty integration

---

### **Week 8: Domain, HTTPS, DNS** ⏱️ 7 days

**Goal:** Get production domain and HTTPS working

#### Tasks:

**Day 1-2: Domain & DNS**
- [ ] Register domain: `credlink.com` (or similar)
- [ ] Create Route53 hosted zone
- [ ] DNS records:
  - `api.credlink.com` → ALB DNS
  - `proofs.credlink.com` → CloudFront (for proof retrieval)
  - `docs.credlink.com` → GitHub Pages (documentation)
- [ ] Test DNS resolution

**Day 3-4: HTTPS/TLS**
- [ ] Request ACM certificate:
  - `*.credlink.com` (wildcard)
  - Valid for 1 year (auto-renew)
- [ ] Add certificate to ALB
- [ ] Configure security groups to allow 443
- [ ] Test HTTPS connection: `https://api.credlink.com/health`
- [ ] Redirect HTTP → HTTPS

**Day 5-6: Security Headers**
- [ ] Add security headers to Express:
  ```typescript
  app.use(helmet()); // HSTS, CSP, X-Frame-Options, etc.
  app.use((req, res, next) => {
    res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  ```
- [ ] SSL Labs test: Aim for A+ rating
- [ ] Set CSP (Content Security Policy)
- [ ] Set CORS headers properly

**Day 7: Final Testing**
- [ ] Test entire flow:
  1. Upload image to `https://api.credlink.com/sign`
  2. Verify response includes proof URI
  3. Verify proof URI is retrievable
  4. Verify signed image can be verified
- [ ] Load test: 100 concurrent requests
- [ ] Performance test: p95 latency < 2s
- [ ] Monitor for errors

**Acceptance Criteria:**
- ✅ Domain resolves to load balancer
- ✅ HTTPS certificate is valid
- ✅ HTTP redirects to HTTPS
- ✅ SSL Labs rating: A or A+
- ✅ Security headers present
- ✅ No mixed content warnings

**Deliverable:**
- Production domain
- HTTPS working
- DNS properly configured
- Security headers implemented

---

## **PHASE 3: TESTING & QUALITY (Weeks 9-10)**

### **Week 9: Comprehensive Testing** ⏱️ 7 days

**Goal:** Ensure product is production-ready

#### Tasks:

**Day 1: Unit Tests**
- [ ] Current test coverage: ~70%
- [ ] Target: 90% code coverage
- [ ] Run: `pnpm test:unit`
- [ ] Add tests for:
  - Error handling edge cases
  - Rate limiting
  - CORS validation
  - Input validation

**Day 2: Integration Tests**
- [ ] Test full sign/verify flow (10+ scenarios)
- [ ] Test with real images:
  - iPhone photo
  - Android photo
  - Photoshop-edited
  - ChatGPT-generated image
  - Deepfake
- [ ] Test error cases:
  - Corrupted image
  - Missing manifest
  - Invalid signature
  - Expired certificate

**Day 3: Performance Tests**
- [ ] Load test:
  - 100 concurrent /sign requests
  - 100 concurrent /verify requests
  - 1000 total requests
  - Measure: latency p50, p95, p99
  - Measure: error rate
  - Target: p95 < 2s, error rate < 0.1%
- [ ] Memory test:
  - Monitor memory usage over time
  - Ensure no leaks
  - Test with 10K images

**Day 4: Security Tests**
- [ ] OWASP Top 10:
  - SQL injection (N/A - no raw SQL)
  - XSS prevention
  - CSRF tokens (if needed)
  - Rate limiting
  - Input validation
- [ ] Try to break it:
  - Send massive files
  - Send invalid MIME types
  - Send malformed JSON
  - Rapid requests (rate limiting)
- [ ] Security audit:
  - Check dependencies: `npm audit`
  - Check for secrets in code
  - Check S3 bucket policies

**Day 5: Survival Rate Validation**
- [ ] Run survival tests against production API:
  - Take 100 random images
  - Compress with different JPEG qualities
  - Convert to WebP, PNG
  - Run through CDN optimizer
  - Verify each one
  - Document actual survival %
- [ ] Document results:
  ```
  Survival Rate Report:
  - JPEG quality reduction (Q75): 95% survive
  - JPEG quality reduction (Q50): 88% survive
  - JPG → WebP conversion: 92% survive
  - CDN optimization: 85% survive
  - Overall remote proof success: 99.9%
  ```

**Day 6-7: Browser Testing**
- [ ] Test API endpoints in different browsers
- [ ] Test proof verification in:
  - Chrome (desktop)
  - Safari (desktop)
  - Firefox (desktop)
  - Chrome (mobile)
  - Safari (iOS)
- [ ] Test CORS:
  - Can call API from different domains
  - Blocked from unsupported origins

**Acceptance Criteria:**
- ✅ 90%+ code coverage
- ✅ All integration tests pass
- ✅ Load test: p95 < 2s, error rate < 0.1%
- ✅ No memory leaks
- ✅ No security vulnerabilities
- ✅ Survival rate documented (real numbers)
- ✅ Works in all major browsers

**Deliverable:**
- Test reports with coverage %
- Performance baseline (latency, memory)
- Security audit report
- Survival rate statistics

---

### **Week 10: Bug Fixes & Polish** ⏱️ 7 days

**Goal:** Fix issues found in testing, prepare for beta

#### Tasks:

**Day 1-3: Fix High Priority Bugs**
- [ ] Fix any bugs found in Week 9 testing
- [ ] Priority: correctness > performance > features
- [ ] If survival rate < 90%, investigate and fix
- [ ] If error rate > 0.1%, investigate and fix
- [ ] If latency p95 > 2s, optimize

**Day 4: Documentation**
- [ ] Update API documentation:
  - POST /sign endpoint (with examples)
  - POST /verify endpoint (with examples)
  - Request/response schemas
  - Error codes and meanings
  - Rate limits
- [ ] Create "Getting Started" guide
- [ ] Create "Survival Rate" documentation
- [ ] Create "Troubleshooting" guide

**Day 5: Error Messages**
- [ ] Improve error responses:
  - Old: `{ error: 'Not Found' }`
  - New: `{ error: 'image_required', message: 'No image file provided', statusCode: 400 }`
- [ ] Add error codes for API consumers
- [ ] Document what each error means

**Day 6: Logging & Observability**
- [ ] Add structured logging:
  ```json
  {
    "timestamp": "2025-11-10T14:05:21.123Z",
    "level": "info",
    "service": "sign-service",
    "action": "sign_image",
    "imageSize": 1024000,
    "duration_ms": 1250,
    "manifestHash": "sha256:abc123...",
    "proofUri": "https://proofs.credlink.com/abc123",
    "status": "success"
  }
  ```
- [ ] Enable CloudWatch log insights
- [ ] Create useful dashboards:
  - Requests per minute
  - Average latency
  - Error rate by type
  - Top endpoints

**Day 7: Prepare for Beta**
- [ ] Create private landing page (not public yet)
- [ ] Create beta terms of service
- [ ] Create privacy policy
- [ ] Create bug report form
- [ ] Set up email support
- [ ] Create onboarding checklist

**Acceptance Criteria:**
- ✅ All high-priority bugs fixed
- ✅ API documentation complete
- ✅ Error messages are helpful
- ✅ CloudWatch dashboards useful
- ✅ Ready to show to beta customers

**Deliverable:**
- Updated API documentation
- Improved error messages
- CloudWatch dashboards
- Beta landing page (private)

---

## **PHASE 4: BETA PROGRAM (Weeks 11-16)**

### **Week 11: Beta Launch Preparation** ⏱️ 7 days

**Goal:** Get first 10 beta customers signed up

#### Tasks:

**Day 1-2: Beta Landing Page**
- [ ] Create simple landing page:
  ```
  CredLink Beta

  Sign images with C2PA cryptographic proof
  Verify authenticity even after 1,000 shares

  [Apply for Beta Access]

  What you get:
  - Early access to signing API
  - Unlimited free usage during beta
  - Direct access to founders for feedback
  - Lifetime pricing for early adopters

  Success Stories (coming soon)
  FAQ
  Docs
  ```
- [ ] Simple form: name, email, use case
- [ ] Landing page: ~500 words, no BS

**Day 2-3: Beta Outreach List**
- [ ] Research 100 potential beta customers:
  - Newsrooms (large newspapers, news agencies)
  - E-commerce platforms (Shopify stores, Amazon sellers)
  - Real estate (MLS agents, property photos)
  - NFT/crypto projects (digital art authentication)
  - Stock photo agencies
  - Academic research (image integrity)
- [ ] Find decision maker email:
  - CTO / VP Engineering
  - Product Manager
  - Use Hunter.io, RocketReach
- [ ] List: Name, Company, Email, Use Case

**Day 4-5: Outreach Email**
- [ ] Write compelling beta outreach email:
  ```
  Subject: Early access to image authenticity API (beta)

  Hi [Name],

  We're building a way to cryptographically sign images
  so they can be verified even after 1,000 shares,
  compression, and CDN optimization.

  Your team is doing [specific work] and might benefit
  from [specific benefit].

  We're looking for 20 beta customers to validate this
  works in the real world. If interested:

  [Link to apply]

  - Free beta access
  - Direct access to founders
  - Early pricing (locked in for 2 years)

  Let me know if you have questions.

  [Your name]
  ```
- [ ] Personalize top 30 emails
- [ ] Send batch 1: 30 emails, track responses

**Day 6-7: Setup & Onboarding**
- [ ] Create beta customer workspace:
  - Unique API key per customer
  - Dashboard showing: API calls, proofs stored, credits used
  - Integration guide (cURL, Python, JavaScript)
- [ ] Create onboarding flow:
  1. Send API key
  2. Customer makes first /sign request
  3. We respond with proof URI
  4. Customer calls /verify
  5. Show them proof works
- [ ] Create support channel:
  - Email: support@credlink.com
  - Slack channel (optional, for closer customers)

**Acceptance Criteria:**
- ✅ Landing page live
- ✅ Outreach list of 100 customers
- ✅ 30+ emails sent
- ✅ Beta workspace ready
- ✅ Onboarding flow documented

**Deliverable:**
- Beta landing page (private)
- Outreach email template
- Beta customer dashboard
- Onboarding guide

---

### **Week 12-14: Beta Customer Onboarding & Feedback** ⏱️ 21 days

**Goal:** Get 10-20 beta customers, collect feedback

#### Tasks:

**Weekly (Weeks 12-14):**

**Acquisition:**
- [ ] Send outreach emails in waves:
  - Week 12: Send to 30 more
  - Week 13: Send to 30 more
  - Week 14: Send to remaining
- [ ] Track response rate (aim for 5-10% positive responses)
- [ ] Follow up non-responders after 3 days
- [ ] Aim for 10-20 customers by week 14

**Onboarding (each customer):**
- [ ] 30-min call with customer:
  - Understand their use case
  - Show them API
  - Have them make first request
  - Celebrate when it works
- [ ] Send them integration guide
- [ ] Answer their questions
- [ ] Get them to first success (signed image)

**Feedback Collection:**
- [ ] Weekly pulse check:
  - "How's the API working for you?"
  - "What's missing?"
  - "Would you pay for this?"
  - "What would make this 10x better?"
- [ ] Track in spreadsheet:
  - Customer name
  - Use case
  - # of API calls
  - Feedback
  - NPS (net promoter score)
  - Would they pay?

**Measurement:**
- [ ] Track metrics:
  - # of customers: 10-20
  - # of API calls: growing (target: 2x growth per week)
  - Survival rate in real usage
  - Error rate from real usage
  - Support tickets (aim for < 2 per customer)

**Product Improvements:**
- [ ] Based on feedback, make small improvements:
  - Better error messages
  - Add missing features (if easy)
  - Fix bugs
  - Document edge cases
- [ ] Avoid scope creep (no big new features yet)

**Acceptance Criteria:**
- ✅ 10+ beta customers signed up
- ✅ 80% have successfully signed an image
- ✅ 60% say they'd consider paying
- ✅ NPS > 30 (good)
- ✅ Error rate in real usage < 0.5%
- ✅ Survival rate > 85% (real-world conditions)

**Deliverable:**
- Customer feedback spreadsheet
- Usage metrics
- Top feature requests
- Top bugs found

---

### **Week 15-16: Pricing, Monetization & Iteration** ⏱️ 14 days

**Goal:** Get to $1-5K MRR with paying customers

#### Tasks:

**Day 1-3: Pricing Strategy**
- [ ] Analyze customer needs:
  - Who needs this most?
  - What would they pay?
  - How many requests per month?
- [ ] Design simple pricing:
  ```
  Free Tier:
  - 100 signs/month
  - No verification
  - Community support

  Starter: $99/month
  - 10,000 signs/month
  - Unlimited verifications
  - Email support

  Professional: $499/month
  - 100,000 signs/month
  - SLA (99.9% uptime)
  - Priority support

  Enterprise: Custom
  - Unlimited usage
  - Dedicated support
  - Custom contract
  ```
- [ ] Validate with customers:
  - "Would you buy Starter at $99?"
  - "What's your actual volume?"
  - "Would Enterprise at $X work?"

**Day 4-5: Payment Integration**
- [ ] Add Stripe:
  ```typescript
  POST /subscribe
  - customer takes plan
  - Stripe charge card
  - API key is activated
  - Return API key
  ```
- [ ] Create simple billing page:
  - Show current plan
  - Show usage (% of quota)
  - Link to upgrade
  - Show invoice history
- [ ] Set up billing alerts:
  - Email when 80% of quota used
  - Email on failed payment

**Day 6-7: Convert Beta Customers**
- [ ] Offer beta customers special deal:
  - Starter plan at $49/month (50% off)
  - Lock in price for 2 years
  - Lifetime early adopter status
- [ ] Move them from free API key → paid plans
- [ ] Aim for:
  - 10 paying customers
  - Mix of Starter ($99) and Professional ($499)
  - Target: $2-3K MRR

**Day 8-10: Iterate Based on Feedback**
- [ ] Fix top 3 issues from beta testing
- [ ] Add top 1 feature request (if quick)
- [ ] Document known limitations
- [ ] Update API docs with real-world examples

**Day 11-14: Success Metrics**
- [ ] Measure:
  - # of paying customers: 10+ (target)
  - MRR: $1,000-5,000 (target)
  - Churn rate: 0% (all staying)
  - Support burden: manageable
  - API uptime: 99.9%+
  - Customer satisfaction: NPS > 40

**Acceptance Criteria:**
- ✅ Pricing is live
- ✅ 10+ paying customers
- ✅ $1-5K MRR achieved
- ✅ Payment processing works
- ✅ Customers can see usage/billing
- ✅ NPS > 40

**Deliverable:**
- Pricing page
- Stripe integration
- Billing dashboard
- Customer testimonials
- MRR report

---

## **SUCCESS CRITERIA: MVP IS DONE WHEN**

✅ **Technical:**
- Real C2PA signing (not mock)
- Real signature verification
- Proofs survive >85% of real-world transformations
- Infrastructure is deployed to AWS
- API uptime is 99.9%+
- p95 latency < 2 seconds
- Error rate < 0.5%

✅ **Business:**
- 10+ paying customers
- $1,000-5,000 MRR recurring
- 50%+ of beta customers are paying
- NPS > 40 (very good)
- At least 3 customer testimonials
- Clear evidence someone wants to pay

✅ **Code Quality:**
- 90%+ test coverage
- Zero critical security issues
- Clean, documented code
- Ready for GitHub publication

---

## **TIMELINE SUMMARY**

```
Week 1-2:   Real C2PA signing
Week 2-3:   Real verification & extraction
Week 3-4:   Real proof storage (S3/R2)
Week 5-6:   Survival testing + Infrastructure setup (parallel)
Week 7:     CI/CD pipeline
Week 8:     Domain, HTTPS, DNS
Week 9:     Comprehensive testing
Week 10:    Bug fixes & polish
Week 11:    Beta launch prep
Week 12-14: Beta customer acquisition & feedback
Week 15-16: Monetization & iteration

TOTAL: 16 weeks (4 months)
LAUNCH: 4 weeks with paying customers at MRR validation
```

---

## **RESOURCES NEEDED**

**People:**
- 2 backend engineers (Weeks 1-8)
- 1 DevOps engineer (Weeks 5-8)
- 1 founder/product person (Weeks 11-16 for customer acquisition)

**Infrastructure Costs (production):**
- RDS PostgreSQL: ~$150/month
- Redis: ~$50/month
- ECS/EC2: ~$100-200/month (scales with traffic)
- S3/R2: ~$10-50/month (depends on usage)
- **Total: ~$350-450/month**

**Third-party Services:**
- Stripe (2.9% + $0.30 per transaction)
- Cloudflare R2 ($0.015/GB storage, $0.20/GB egress)
- GitHub Pro: $4/month
- PagerDuty (free tier fine for beta)

---

## **RISKS & MITIGATIONS**

| Risk | Mitigation |
|------|-----------|
| C2PA library doesn't work well | Research early (Week 1), have backup plan |
| Signatures don't survive CDN compression | Fall back to remote-only storage, test extensively |
| Customers don't want to pay | Better to know in Week 14 than Week 50 |
| Infrastructure costs blow up | Monitor costs weekly, set budgets in AWS |
| Team gets sick/leaves | Document everything, pair programming on critical pieces |

---

## **SUCCESS LOOKS LIKE**

At Week 16:
- ✅ Real customers are signing images in production
- ✅ Real customers are paying monthly
- ✅ Proofs provably survive real-world transformations
- ✅ You have paying customers' quotes: "CredLink saved us from [problem]"
- ✅ GitHub repo is clean, honest, ready for public
- ✅ You know the next 16 weeks will be easier (just scaling & features)

---

## **NEXT STEP**

**Week 1 Monday morning:**
- Pick C2PA library (c2pa-node vs Rust)
- Get it working locally
- Start replacing mock code with real code
- Every day: Push code, see tests pass
- Every week: Working feature to show customers

**This is executable. This is real. This will get you to MVP.**

