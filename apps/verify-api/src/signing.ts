/**
 * Signing Service
 * Handles image signing, manifest generation, and storage
 */

import crypto from 'crypto';
import { createHash } from 'crypto';
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
 * Creates a basic C2PA manifest structure
 * For demo purposes - will be enhanced with real C2PA library
 */
function createC2PAManifest(
  imageHash: string,
  imageBuffer: Buffer,
  request: SigningRequest,
  timestamp: string
): { manifest: any; manifestHash: string } {
  
  const manifest = {
    claim: [
      {
        label: 'stds.assertions',
        claim_generator: 'CredLink Signing Service v1.0.0',
        claim_generator_version: '1.0.0',
        assertions: [
          {
            label: 'c2pa.actions',
            data: {
              actions: [
                {
                  action: 'c2pa.created',
                  when: timestamp,
                  digitalSourceType: 'https://schema.org/Photograph',
                  parameters: {
                    format: imageBuffer.length > 0 && imageBuffer[0] === 0xFF ? 'image/jpeg' : 'image/png'
                  }
                }
              ]
            }
          },
          {
            label: 'c2pa.signature',
            data: {
              algorithm: 'sha256',
              hash: imageHash,
              key_id: SIGNING_KEY_ID,
              signer: {
                name: request.creator,
                organization: SIGNING_ORG,
                key_id: SIGNING_KEY_ID
              },
              timestamp: timestamp
            }
          }
        ]
      }
    ]
  };

  // Add custom assertions if provided
  if (request.assertions) {
    const customAssertions: any[] = [];
    
    if (request.assertions.ai_generated !== undefined) {
      customAssertions.push({
        label: 'c2pa.ai_training',
        data: {
          ai_generated: request.assertions.ai_generated,
          ai_training_use: 'notTraining'
        }
      });
    }

    if (request.assertions.description || request.assertions.title) {
      customAssertions.push({
        label: 'c2pa.description',
        data: {
          description: request.assertions.description || '',
          title: request.assertions.title || ''
        }
      });
    }

    if (request.assertions.metadata && request.assertions.metadata.location) {
      customAssertions.push({
        label: 'c2pa.location',
        data: {
          location: request.assertions.metadata.location
        }
      });
    }

    manifest.claim[0].assertions.push(...customAssertions);
  }

  // Generate manifest hash
  const manifestString = JSON.stringify(manifest, null, 2);
  const manifestHash = createHash('sha256').update(manifestString).digest('hex');

  return { manifest, manifestHash };
}

/**
 * Main signing function
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

    // Create C2PA manifest
    const { manifest, manifestHash } = createC2PAManifest(imageHash, imageBuffer, request, timestamp);

    // Store manifest in R2 or local storage
    const storage = await storeManifest(manifestHash, manifest);

    const totalTime = Date.now() - startTime;
    console.log(`Signing completed in ${totalTime}ms for image hash: ${imageHash}`);

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
      }
    };

  } catch (error) {
    console.error('Signing failed:', error);
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
      console.error('Failed to sign image:', error);
      // Continue with other images, but could also collect errors
    }
  }
  
  return results;
}
