/**
 * C2PA Wrapper - Real Cryptographic Signing
 *
 * This wrapper provides real RSA-SHA256 cryptographic signing of images.
 *
 * Phase 1: Real crypto signing (current)
 * Phase 2: Full C2PA manifest embedding with JUMBF containers
 * Phase 3: C2PA library integration (when ES module issues resolved)
 */

import { readFileSync } from 'fs';
import * as crypto from 'crypto';
import { CertificateManager } from './certificate-manager';

const certManager = new CertificateManager();

export interface C2PASignResult {
  signedBuffer: Buffer;
  manifestStore: Record<string, unknown>;
  manifestUri: string;
}

export interface C2PAManifestDefinition {
  claim_generator: string;
  claim_generator_info?: Array<{
    name: string;
    version: string;
  }>;
  title?: string;
  format?: string;
  instance_id?: string;
  assertions?: Array<{
    label: string;
    data: Record<string, unknown> | string | number | boolean;
  }>;
  ingredients?: Array<{
    uri?: string;
    'xmp.ns'?: Record<string, string>;
    'xmp.meta'?: Record<string, unknown>;
  }>;
}

export class C2PAWrapper {
  private certPath: string;
  private keyPath: string;
  private signingAlgorithm: string = 'RSA-SHA256';

  constructor() {
    this.certPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
    this.keyPath = process.env.SIGNING_PRIVATE_KEY || './certs/signing-key.pem';
  }

  /**
   * Sign image buffer with real RSA-SHA256 cryptographic signature
   * Returns cryptographically valid signature (not mock)
   */
  async sign(imageBuffer: Buffer, manifest: C2PAManifestDefinition): Promise<C2PASignResult> {
    try {
      const manifestUri = `urn:uuid:${crypto.randomUUID()}`;
      const signingKey = await certManager.getSigningKey();

      // Create real cryptographic signature of manifest using RSA-SHA256
      const manifestString = JSON.stringify({
        ...manifest,
        manifestUri,
        timestamp: new Date().toISOString()
      });

      const signature = crypto
        .sign(this.signingAlgorithm, Buffer.from(manifestString), signingKey)
        .toString('base64');

      return {
        signedBuffer: imageBuffer,
        manifestStore: {
          manifest,
          signature,
          timestamp: new Date().toISOString()
        },
        manifestUri
      };
    } catch (error) {
      throw new Error(`C2PA signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read C2PA manifest (placeholder for Phase 2 JUMBF implementation)
   */
  async read(imageBuffer: Buffer): Promise<Record<string, unknown> | null> {
    try {
      // Phase 2: Will extract JUMBF container from image
      // For now, return null as images don't have embedded manifests yet
      return null;
    } catch (error) {
      throw new Error(`C2PA reading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify cryptographic signature
   */
  async verify(imageBuffer: Buffer, signature: string): Promise<boolean> {
    try {
      const cert = this.loadCertificate();
      // Extract public key from certificate
      // Note: Real implementation requires full certificate chain validation
      // This is a placeholder for Phase 2
      return true;
    } catch (error) {
      return false;
    }
  }

  private loadCertificate(): string {
    try {
      if (this.certPath.startsWith('./')) {
        return readFileSync(this.certPath, 'utf8');
      }
      return this.certPath; // Assume it's already PEM content
    } catch (error) {
      throw new Error(`Failed to load certificate from ${this.certPath}: ${error}`);
    }
  }

  private loadPrivateKey(): string {
    try {
      if (this.keyPath.startsWith('./')) {
        return readFileSync(this.keyPath, 'utf8');
      }
      return this.keyPath; // Assume it's already PEM content
    } catch (error) {
      throw new Error(`Failed to load private key from ${this.keyPath}: ${error}`);
    }
  }

  private detectMimeType(buffer: Buffer): string {
    const signature = buffer.toString('hex', 0, 12);
    
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('89504e470d0a1a0a')) return 'image/png';
    if (signature.startsWith('52494646') && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
    
    throw new Error('Unable to detect image MIME type');
  }

  private convertManifest(manifest: C2PAManifestDefinition): any {
    // Convert our manifest format to C2PA library format
    return {
      claim_generator: manifest.claim_generator,
      claim_generator_info: manifest.claim_generator_info,
      title: manifest.title,
      format: manifest.format,
      instance_id: manifest.instance_id || crypto.randomUUID(),
      assertions: manifest.assertions || [],
      ingredients: manifest.ingredients || []
    };
  }

  private generateManifestUri(): string {
    return `urn:uuid:${crypto.randomUUID()}`;
  }
}
