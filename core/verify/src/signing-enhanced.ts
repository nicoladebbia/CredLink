/**
 * Enhanced C2PA Signing Service with Real Cryptographic Signatures
 * Integrates with TSA service for trusted timestamps
 */

import crypto from 'crypto';
import { createHash, createSign, generateKeyPairSync } from 'crypto';
import { SigningRequest, SigningResult, SigningError } from './types.js';
import { storeManifest } from './storage.js';

// Supported image formats
const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Environment configuration
const MANIFEST_BASE_URL = process.env.MANIFEST_BASE_URL || 'https://manifests.credlink.com';
const R2_BUCKET = process.env.R2_BUCKET || 'credlink-manifests';
const SIGNING_KEY_ID = process.env.SIGNING_KEY_ID || 'demo-key-1';
const SIGNING_ORG = process.env.SIGNING_ORG || 'CredLink Demo';
const TSA_ENDPOINT = process.env.TSA_ENDPOINT || 'http://localhost:3002/tsa/sign';
const USE_TSA = process.env.USE_TSA === 'true';
const USE_REAL_CRYPTO = process.env.USE_REAL_CRYPTO !== 'false'; // Default to true

// Signing key management
let signingKeyPair: { publicKey: string; privateKey: string } | null = null;

/**
 * Initialize or load signing keys
 */
function getSigningKeys(): { publicKey: string; privateKey: string } {
  if (!signingKeyPair) {
    // In production, load from secure key storage (KMS, HSM, etc.)
    // For now, generate ephemeral keys
    console.log('[Crypto] Generating signing key pair...');
    
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    signingKeyPair = { publicKey, privateKey };
    console.log('[Crypto] Signing keys generated successfully');
  }
  
  return signingKeyPair;
}

/**
 * Validates uploaded image file
 */
function validateImageFile(buffer: Buffer, mimetype: string): void {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new SigningError('IMAGE_TOO_LARGE', `Image size ${buffer.length} exceeds maximum allowed size of ${MAX_FILE_SIZE}`);
  }

  // Check MIME type
  if (!SUPPORTED_FORMATS.includes(mimetype)) {
    throw new SigningError('UNSUPPORTED_FORMAT', `Unsupported image format: ${mimetype}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`);
  }

  // Basic image validation - check file signatures
  const signatures = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/webp': [0x52, 0x49, 0x46, 0x46],
    'image/gif': [0x47, 0x49, 0x46, 0x38]
  };

  const expectedSignature = signatures[mimetype as keyof typeof signatures];
  if (expectedSignature) {
    for (let i = 0; i < expectedSignature.length; i++) {
      if (buffer[i] !== expectedSignature[i]) {
        throw new SigningError('INVALID_IMAGE', `File does not match expected ${mimetype} signature`);
      }
    }
  }
}

/**
 * Generates SHA-256 hash of image data
 */
function generateImageHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate cryptographic signature for data
 */
function generateSignature(data: string, privateKey: string): string {
  const sign = createSign('RSA-SHA256');
  sign.update(data);
  sign.end();
  
  const signature = sign.sign(privateKey, 'base64');
  return signature;
}

/**
 * Request TSA timestamp for manifest
 */
async function requestTSATimestamp(manifestHash: string): Promise<{
  timestamp_token: string;
  timestamp_time: string;
  tsa_url: string;
} | null> {
  if (!USE_TSA) {
    return null;
  }

  try {
    const response = await fetch(TSA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tenant_id: 'default',
        imprint: manifestHash,
        hashAlg: 'sha256',
        certReq: true
      }),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      console.warn('[TSA] Timestamp request failed:', response.status, response.statusText);
      return null;
    }

    const data = await response.json() as any;
    
    if (data.success && data.timestamp_token) {
      return {
        timestamp_token: data.timestamp_token,
        timestamp_time: data.timestamp_time || new Date().toISOString(),
        tsa_url: TSA_ENDPOINT
      };
    }
    
    return null;
  } catch (error) {
    console.warn('[TSA] Timestamp request error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Creates a C2PA manifest with real cryptographic signature
 */
async function createC2PAManifest(
  imageHash: string,
  imageBuffer: Buffer,
  request: SigningRequest,
  timestamp: string
): Promise<{ manifest: any; manifestHash: string; signature: string }> {
  
  // Get signing keys
  const keys = getSigningKeys();
  
  // Build base manifest
  const manifest = {
    '@context': 'https://c2pa.org/specifications/1.0/context.json',
    '@type': 'c2pa.manifest',
    claim_generator: 'CredLink Signing Service v2.0.0',
    claim_generator_version: '2.0.0',
    format: 'application/c2pa',
    instance_id: `urn:uuid:${crypto.randomUUID()}`,
    title: request.assertions?.title || 'Signed Image',
    claim: [
      {
        label: 'stds.assertions',
        claim_generator: 'CredLink Signing Service v2.0.0',
        claim_generator_version: '2.0.0',
        assertions: [
          {
            label: 'c2pa.actions',
            data: {
              actions: [
                {
                  action: 'c2pa.created',
                  when: timestamp,
                  digitalSourceType: 'https://schema.org/Photograph',
                  softwareAgent: 'CredLink/2.0.0',
                  parameters: {
                    format: imageBuffer.length > 0 && imageBuffer[0] === 0xFF ? 'image/jpeg' : 'image/png',
                    size: imageBuffer.length
                  }
                }
              ]
            }
          },
          {
            label: 'c2pa.hash.data',
            data: {
              name: 'jumbf manifest',
              alg: 'sha256',
              hash: imageHash,
              pad: Buffer.from(imageHash).toString('base64')
            }
          }
        ]
      }
    ],
    signature_info: {
      alg: 'rs256',
      issuer: SIGNING_ORG,
      cert_serial_number: SIGNING_KEY_ID,
      time: timestamp
    }
  };

  // Add custom assertions if provided
  if (request.assertions) {
    const customAssertions: any[] = [];
    
    if (request.assertions.ai_generated !== undefined) {
      customAssertions.push({
        label: 'c2pa.ai_generative_training',
        data: {
          use: request.assertions.ai_generated ? 'allowed' : 'notAllowed',
          constraint_info: {
            name: 'AI Training Policy',
            constraint_type: 'training'
          }
        }
      });
    }

    if (request.assertions.description || request.assertions.title) {
      customAssertions.push({
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'CreativeWork',
          author: {
            '@type': 'Person',
            name: request.creator
          },
          ...(request.assertions.title && { name: request.assertions.title }),
          ...(request.assertions.description && { description: request.assertions.description })
        }
      });
    }

    if (request.assertions.metadata?.location) {
      const location = request.assertions.metadata.location as any;
      customAssertions.push({
        label: 'stds.exif',
        data: {
          'exif:GPSLatitude': location.latitude,
          'exif:GPSLongitude': location.longitude
        }
      });
    }

    manifest.claim[0].assertions.push(...customAssertions);
  }

  // Generate manifest hash (before signature)
  const manifestString = JSON.stringify(manifest, null, 2);
  const manifestHash = createHash('sha256').update(manifestString).digest('hex');

  // Request TSA timestamp
  const tsaTimestamp = await requestTSATimestamp(manifestHash);
  
  if (tsaTimestamp) {
    console.log('[TSA] Timestamp obtained:', tsaTimestamp.timestamp_time);
    (manifest.claim[0].assertions as any[]).push({
      label: 'c2pa.timestamp',
      data: {
        timestamp_token: tsaTimestamp.timestamp_token,
        timestamp_time: tsaTimestamp.timestamp_time,
        tsa_url: tsaTimestamp.tsa_url,
        algorithm: 'sha256'
      }
    });
  }

  // Generate cryptographic signature
  let signature: string;
  
  if (USE_REAL_CRYPTO) {
    signature = generateSignature(manifestString, keys.privateKey);
    console.log('[Crypto] Generated RSA-SHA256 signature');
  } else {
    // Fallback to mock signature for development
    signature = Buffer.from(manifestHash.slice(0, 32)).toString('base64');
    console.log('[Crypto] Using mock signature (development mode)');
  }

  // Add signature to manifest
  manifest.signature_info = {
    ...(manifest.signature_info as any),
    signature: signature,
    public_key: keys.publicKey,
    signing_time: new Date().toISOString()
  };

  // Add signer information
  (manifest.claim[0].assertions as any[]).push({
    label: 'c2pa.signature',
    data: {
      algorithm: 'rs256',
      signature: signature,
      hash: manifestHash,
      key_id: SIGNING_KEY_ID,
      signer: {
        name: request.creator,
        organization: SIGNING_ORG,
        key_id: SIGNING_KEY_ID,
        public_key_fingerprint: createHash('sha256').update(keys.publicKey).digest('hex').slice(0, 16)
      },
      timestamp: timestamp,
      ...(tsaTimestamp && {
        tsa_timestamp: {
          token: tsaTimestamp.timestamp_token,
          time: tsaTimestamp.timestamp_time
        }
      })
    }
  });

  return { manifest, manifestHash, signature };
}

/**
 * Main signing function with real cryptographic signatures
 */
export async function signImage(
  imageBuffer: Buffer,
  mimetype: string,
  request: SigningRequest
): Promise<SigningResult> {
  const startTime = Date.now();

  try {
    // Validate input
    if (!request.creator || request.creator.trim().length === 0) {
      throw new SigningError('CREATOR_REQUIRED', 'Creator identifier is required');
    }

    // Validate image
    validateImageFile(imageBuffer, mimetype);

    // Generate image hash
    const imageHash = generateImageHash(imageBuffer);
    const timestamp = new Date().toISOString();

    console.log(`[Signing] Processing image: ${imageHash.slice(0, 16)}...`);
    console.log(`[Signing] Creator: ${request.creator}`);
    console.log(`[Signing] Crypto mode: ${USE_REAL_CRYPTO ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`[Signing] TSA enabled: ${USE_TSA ? 'YES' : 'NO'}`);

    // Create C2PA manifest with cryptographic signature
    const { manifest, manifestHash, signature } = await createC2PAManifest(
      imageHash, 
      imageBuffer, 
      request, 
      timestamp
    );

    // Store manifest in R2 or local storage
    const storage = await storeManifest(manifestHash, manifest);

    const totalTime = Date.now() - startTime;
    console.log(`[Signing] ✅ Completed in ${totalTime}ms`);
    console.log(`[Signing] Manifest hash: ${manifestHash.slice(0, 16)}...`);
    console.log(`[Signing] Signature: ${signature.slice(0, 32)}...`);

    return {
      manifest_url: storage.url,
      image_hash: imageHash,
      created_at: timestamp,
      signer: {
        name: request.creator,
        key_id: SIGNING_KEY_ID,
        organization: SIGNING_ORG
      },
      manifest_hash: manifestHash,
      storage: {
        bucket: storage.bucket,
        key: storage.key,
        region: storage.region
      },
      // Include cryptographic details
      signature: signature,
      crypto_algorithm: USE_REAL_CRYPTO ? 'RSA-SHA256' : 'mock',
      has_tsa_timestamp: manifest.claim[0].assertions.some((a: any) => a.label === 'c2pa.timestamp')
    };

  } catch (error) {
    console.error('[Signing] ❌ Failed:', error);
    throw error;
  }
}

/**
 * Batch signing for multiple images
 */
export async function signImages(
  images: Array<{ buffer: Buffer; mimetype: string; request: SigningRequest }>
): Promise<SigningResult[]> {
  const results: SigningResult[] = [];
  
  for (const image of images) {
    try {
      const result = await signImage(image.buffer, image.mimetype, image.request);
      results.push(result);
    } catch (error) {
      console.error('[Signing] Failed to sign image:', error);
      // Continue with other images
    }
  }
  
  return results;
}

/**
 * Get signing service status
 */
export function getSigningStatus(): {
  ready: boolean;
  crypto_mode: 'production' | 'development';
  tsa_enabled: boolean;
  key_id: string;
  organization: string;
} {
  return {
    ready: true,
    crypto_mode: USE_REAL_CRYPTO ? 'production' : 'development',
    tsa_enabled: USE_TSA,
    key_id: SIGNING_KEY_ID,
    organization: SIGNING_ORG
  };
}
