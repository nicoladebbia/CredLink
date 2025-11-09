/**
 * Cloudflare R2 Storage Service
 * Handles manifest storage and retrieval from Cloudflare R2
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || 'credlink-manifests';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://manifests.credlink.com';

// Use local filesystem fallback if R2 credentials not configured
const USE_LOCAL_STORAGE = !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY;

// S3-compatible client for R2
let r2Client: S3Client | null = null;

if (!USE_LOCAL_STORAGE) {
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

// Local storage fallback
import fs from 'fs/promises';
import path from 'path';

const LOCAL_STORAGE_PATH = path.join(process.cwd(), '.local-storage', 'manifests');

/**
 * Initialize local storage directory
 */
async function initLocalStorage(): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    try {
      await fs.mkdir(LOCAL_STORAGE_PATH, { recursive: true });
      console.log(`[Storage] Using local filesystem: ${LOCAL_STORAGE_PATH}`);
    } catch (error) {
      console.error('[Storage] Failed to create local storage directory:', error);
      throw error;
    }
  }
}

/**
 * Store manifest in R2 or local filesystem
 */
export async function storeManifest(
  manifestHash: string,
  manifest: any
): Promise<{ bucket: string; key: string; url: string; region?: string }> {
  const key = `${manifestHash}.c2pa`;
  const manifestContent = JSON.stringify(manifest, null, 2);
  const contentBuffer = Buffer.from(manifestContent, 'utf-8');

  if (USE_LOCAL_STORAGE) {
    // Local filesystem storage
    await initLocalStorage();
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    
    try {
      await fs.writeFile(filePath, contentBuffer);
      console.log(`[Storage] Stored manifest locally: ${filePath}`);
      
      return {
        bucket: 'local-storage',
        key: key,
        url: `http://localhost:3001/manifests/${manifestHash}`,
        region: 'local'
      };
    } catch (error) {
      console.error('[Storage] Failed to write manifest to local storage:', error);
      throw new Error(`Failed to store manifest locally: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Cloudflare R2 storage
    if (!r2Client) {
      throw new Error('R2 client not initialized');
    }

    try {
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: contentBuffer,
        ContentType: 'application/json',
        ContentLength: contentBuffer.length,
        Metadata: {
          'manifest-hash': manifestHash,
          'created-at': new Date().toISOString(),
          'content-hash': createHash('sha256').update(contentBuffer).digest('hex')
        },
        CacheControl: 'public, max-age=31536000, immutable', // 1 year cache
      });

      await r2Client.send(command);
      
      console.log(`[Storage] Stored manifest in R2: ${R2_BUCKET}/${key}`);
      
      return {
        bucket: R2_BUCKET,
        key: key,
        url: `${R2_PUBLIC_URL}/${key}`,
        region: 'auto'
      };
    } catch (error) {
      console.error('[Storage] Failed to upload manifest to R2:', error);
      throw new Error(`Failed to store manifest in R2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Retrieve manifest from R2 or local filesystem
 */
export async function retrieveManifest(
  manifestHash: string
): Promise<{ manifest: any; metadata: Record<string, string>; etag?: string }> {
  const key = `${manifestHash}.c2pa`;

  if (USE_LOCAL_STORAGE) {
    // Local filesystem retrieval
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const manifest = JSON.parse(content);
      
      const stats = await fs.stat(filePath);
      
      return {
        manifest,
        metadata: {
          'manifest-hash': manifestHash,
          'created-at': stats.birthtime.toISOString(),
          'last-modified': stats.mtime.toISOString(),
          'size': stats.size.toString()
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Manifest not found: ${manifestHash}`);
      }
      console.error('[Storage] Failed to read manifest from local storage:', error);
      throw new Error(`Failed to retrieve manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  } else {
    // Cloudflare R2 retrieval
    if (!r2Client) {
      throw new Error('R2 client not initialized');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });

      const response = await r2Client.send(command);
      
      if (!response.Body) {
        throw new Error('Empty response body from R2');
      }

      // Convert stream to string
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks).toString('utf-8');
      const manifest = JSON.parse(content);

      return {
        manifest,
        metadata: response.Metadata || {},
        etag: response.ETag
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw new Error(`Manifest not found: ${manifestHash}`);
      }
      console.error('[Storage] Failed to retrieve manifest from R2:', error);
      throw new Error(`Failed to retrieve manifest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Check if manifest exists
 */
export async function manifestExists(manifestHash: string): Promise<boolean> {
  const key = `${manifestHash}.c2pa`;

  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  } else {
    if (!r2Client) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });
      await r2Client.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Get manifest metadata without downloading content
 */
export async function getManifestMetadata(
  manifestHash: string
): Promise<{ size: number; lastModified: Date; etag?: string; metadata: Record<string, string> }> {
  const key = `${manifestHash}.c2pa`;

  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
        metadata: {
          'manifest-hash': manifestHash,
          'created-at': stats.birthtime.toISOString()
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Manifest not found: ${manifestHash}`);
      }
      throw error;
    }
  } else {
    if (!r2Client) {
      throw new Error('R2 client not initialized');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });
      const response = await r2Client.send(command);

      return {
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag,
        metadata: response.Metadata || {}
      };
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        throw new Error(`Manifest not found: ${manifestHash}`);
      }
      throw error;
    }
  }
}

/**
 * Delete manifest (for testing/cleanup)
 */
export async function deleteManifest(manifestHash: string): Promise<void> {
  const key = `${manifestHash}.c2pa`;

  if (USE_LOCAL_STORAGE) {
    const filePath = path.join(LOCAL_STORAGE_PATH, key);
    try {
      await fs.unlink(filePath);
      console.log(`[Storage] Deleted manifest locally: ${filePath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  } else {
    if (!r2Client) {
      throw new Error('R2 client not initialized');
    }

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });
    await r2Client.send(command);
    console.log(`[Storage] Deleted manifest from R2: ${R2_BUCKET}/${key}`);
  }
}

/**
 * Get storage configuration info
 */
export function getStorageInfo(): {
  type: 'r2' | 'local';
  bucket?: string;
  publicUrl?: string;
  localPath?: string;
} {
  if (USE_LOCAL_STORAGE) {
    return {
      type: 'local',
      localPath: LOCAL_STORAGE_PATH
    };
  } else {
    return {
      type: 'r2',
      bucket: R2_BUCKET,
      publicUrl: R2_PUBLIC_URL
    };
  }
}
