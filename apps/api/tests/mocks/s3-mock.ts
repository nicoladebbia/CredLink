/**
 * S3 Client Mock
 * Week 7 Day 1: Mock S3 operations for testing without external dependencies
 * 
 * Provides a proper cleanup mechanism to prevent test hangs from unclosed connections.
 */

interface PutObjectRequest {
  Bucket: string;
  Key: string;
  Body: Buffer | string;
  ContentType?: string;
  ServerSideEncryption?: string;
}

interface GetObjectRequest {
  Bucket: string;
  Key: string;
}

interface DeleteObjectRequest {
  Bucket: string;
  Key: string;
}

interface PutObjectOutput {
  ETag: string;
  VersionId?: string;
}

interface GetObjectOutput {
  Body: Buffer;
  ContentType?: string;
  ContentLength: number;
}

export class S3ClientMock {
  private storage = new Map<string, { body: Buffer; contentType?: string }>();
  private closed = false;
  private requestCount = 0;

  /**
   * Put an object into mock storage
   */
  async putObject(params: PutObjectRequest): Promise<PutObjectOutput> {
    this.assertNotClosed();
    this.requestCount++;

    const key = `${params.Bucket}/${params.Key}`;
    const body = Buffer.isBuffer(params.Body) 
      ? params.Body 
      : Buffer.from(params.Body);

    this.storage.set(key, {
      body,
      contentType: params.ContentType
    });

    return {
      ETag: `"${this.generateETag(body)}"`,
      VersionId: `v${Date.now()}`
    };
  }

  /**
   * Get an object from mock storage
   */
  async getObject(params: GetObjectRequest): Promise<GetObjectOutput> {
    this.assertNotClosed();
    this.requestCount++;

    const key = `${params.Bucket}/${params.Key}`;
    const stored = this.storage.get(key);

    if (!stored) {
      throw new Error(`NoSuchKey: The specified key does not exist: ${key}`);
    }

    return {
      Body: stored.body,
      ContentType: stored.contentType,
      ContentLength: stored.body.length
    };
  }

  /**
   * Delete an object from mock storage
   */
  async deleteObject(params: DeleteObjectRequest): Promise<void> {
    this.assertNotClosed();
    this.requestCount++;

    const key = `${params.Bucket}/${params.Key}`;
    this.storage.delete(key);
  }

  /**
   * List objects in mock storage (simplified)
   */
  async listObjects(bucket: string, prefix?: string): Promise<string[]> {
    this.assertNotClosed();
    this.requestCount++;

    const keys: string[] = [];
    const bucketPrefix = `${bucket}/`;

    for (const key of this.storage.keys()) {
      if (key.startsWith(bucketPrefix)) {
        const objectKey = key.substring(bucketPrefix.length);
        if (!prefix || objectKey.startsWith(prefix)) {
          keys.push(objectKey);
        }
      }
    }

    return keys;
  }

  /**
   * Close the mock client (cleanup)
   */
  async destroy(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.storage.clear();
  }

  /**
   * Alias for destroy (for compatibility)
   */
  async close(): Promise<void> {
    await this.destroy();
  }

  /**
   * Check if the client is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get request count (for testing)
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Get storage size (for testing)
   */
  getStorageSize(): number {
    return this.storage.size;
  }

  /**
   * Clear all storage (for testing)
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Assert client is not closed
   */
  private assertNotClosed(): void {
    if (this.closed) {
      throw new Error('S3 client has been destroyed and cannot be used');
    }
  }

  /**
   * Generate a simple ETag (MD5 hash in real S3)
   */
  private generateETag(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }
}

/**
 * Factory function to create S3 mock
 */
export function createS3Mock(): S3ClientMock {
  return new S3ClientMock();
}
