import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { createHash } from 'crypto';
import { ManifestStore } from './manifest-store.js';
import type { ManifestStoreConfig } from './types.js';

describe('ManifestStore', () => {
  let store: ManifestStore;
  
  beforeEach(() => {
    store = new ManifestStore({
      baseUrl: 'https://test.manifests.example',
      bucket: 'test-bucket',
      region: 'us-east-1',
      writeOnceEnabled: true,
      signedUrlTtl: 3600000,
      negativeCacheTtl: 300000,
      maxObjectSize: 10 * 1024 * 1024, // 10MB
      allowedMimeTypes: [
        'application/c2pa',
        'application/json',
        'application/octet-stream'
      ]
    });
  });

  test('should generate signed URL for valid request', async () => {
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const request = {
      objectKey,
      contentType: 'application/c2pa',
      contentLength: content.length,
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature'
    };

    const result = await store.generateSignedUrl(request);

    assert.strictEqual(result.method, 'PUT');
    assert.strictEqual(result.url, `https://test.manifests.example/${request.objectKey}`);
    assert.strictEqual(result.headers['Content-Type'], request.contentType);
    assert.strictEqual(result.headers['Content-Length'], request.contentLength.toString());
    assert.strictEqual(result.headers['X-C2-Tenant'], request.tenantId);
    assert.strictEqual(result.headers['X-C2-Author'], request.author);
    assert.ok(result.expires);
    assert.ok(result.url.includes(request.objectKey));
  });

  test('should reject invalid object key format', async () => {
    const request = {
      objectKey: 'invalid-key.c2pa',
      contentType: 'application/c2pa',
      contentLength: 1024,
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature'
    };

    await assert.rejects(
      () => store.generateSignedUrl(request),
      /Invalid object key: must be SHA-256 hash with \.c2pa extension/
    );
  });

  test('should reject disallowed content type', async () => {
    const request = {
      objectKey: 'a'.repeat(64) + '.c2pa',
      contentType: 'text/plain',
      contentLength: 1024,
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature'
    };

    await assert.rejects(
      () => store.generateSignedUrl(request),
      /Content type text\/plain not allowed/
    );
  });

  test('should store manifest with valid metadata', async () => {
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const metadata = {
      hash: actualHash,
      contentType: 'application/c2pa',
      contentLength: content.length,
      etag: `"${actualHash}"`,
      lastModified: new Date().toUTCString(),
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature',
      checksum: actualChecksum
    };

    const result = await store.storeManifest(objectKey, content, metadata);

    assert.strictEqual(result.hash, metadata.hash);
    assert.strictEqual(result.contentType, metadata.contentType);
    assert.strictEqual(result.contentLength, metadata.contentLength);
    assert.strictEqual(result.tenantId, metadata.tenantId);
    assert.strictEqual(result.author, metadata.author);
    assert.ok(result.createdAt);
  });

  test('should enforce write-once semantics', async () => {
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const metadata = {
      hash: actualHash,
      contentType: 'application/c2pa',
      contentLength: content.length,
      etag: `"${actualHash}"`,
      lastModified: new Date().toUTCString(),
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature',
      checksum: actualChecksum
    };

    // First store should succeed
    await store.storeManifest(objectKey, content, metadata);

    // Second store should fail
    await assert.rejects(
      () => store.storeManifest(objectKey, content, metadata),
      /Object already exists: write-once semantics prohibit overwrites/
    );
  });

  test('should check manifest integrity correctly', async () => {
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const metadata = {
      hash: actualHash,
      contentType: 'application/c2pa',
      contentLength: content.length,
      etag: `"${actualHash}"`,
      lastModified: new Date().toUTCString(),
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature',
      checksum: actualChecksum
    };

    // Store the manifest
    await store.storeManifest(objectKey, content, metadata);

    // Check integrity should pass
    const result = await store.checkIntegrity(objectKey, content);
    
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.expectedHash, actualHash);
    assert.strictEqual(result.actualHash, actualHash);
    assert.strictEqual(result.sizeMatch, true);
    assert.strictEqual(result.contentTypeValid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  test('should detect integrity violations', async () => {
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const metadata = {
      hash: actualHash,
      contentType: 'application/c2pa',
      contentLength: content.length,
      etag: `"${actualHash}"`,
      lastModified: new Date().toUTCString(),
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature',
      checksum: actualChecksum
    };

    // Store the manifest
    await store.storeManifest(objectKey, content, metadata);

    // Check integrity with different content should fail
    const differentContent = Buffer.from('different content');
    const result = await store.checkIntegrity(objectKey, differentContent);
    
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.expectedHash, actualHash);
    assert.notStrictEqual(result.actualHash, actualHash);
    assert.strictEqual(result.sizeMatch, false);
    assert.ok(result.errors.length > 0);
  });

  test('should list objects with pagination', async () => {
    // Create many objects
    for (let i = 0; i < 5; i++) {
      const content = Buffer.from(`test content ${i}`);
      const actualHash = createHash('sha256').update(content).digest('hex');
      const objectKey = actualHash + '.c2pa';
      const actualChecksum = createHash('md5').update(content).digest('hex');
      
      const metadata = {
        hash: actualHash,
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"${actualHash}"`,
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: actualChecksum
      };

      await store.storeManifest(objectKey, content, metadata);
    }

    const result = await store.listObjects({ limit: 3 });
    
    assert.strictEqual(result.objects.length, 3);
    assert.strictEqual(result.totalCount, 5);
    assert.strictEqual(result.isTruncated, true);
    assert.ok(result.continuationToken);
  });

  test('should filter objects by tenant', async () => {
    // Create objects for different tenants
    const tenants = ['tenant1', 'tenant2', 'tenant3'];
    
    for (const tenant of tenants) {
      const content = Buffer.from(`test content for ${tenant}`);
      const actualHash = createHash('sha256').update(content).digest('hex');
      const objectKey = actualHash + '.c2pa';
      const actualChecksum = createHash('md5').update(content).digest('hex');
      
      const metadata = {
        hash: actualHash,
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"${actualHash}"`,
        lastModified: new Date().toUTCString(),
        tenantId: tenant,
        author: 'test-author',
        signature: 'test-signature',
        checksum: actualChecksum
      };

      await store.storeManifest(objectKey, content, metadata);
    }

    const result = await store.listObjects({ tenantId: 'tenant2' });
    
    assert.strictEqual(result.objects.length, 1);
    assert.strictEqual(result.objects[0].tenantId, 'tenant2');
    assert.strictEqual(result.totalCount, 1);
  });

  test('should provide store metrics', async () => {
    // Create some objects
    for (let i = 0; i < 3; i++) {
      const content = Buffer.from(`test content ${i}`);
      const actualHash = createHash('sha256').update(content).digest('hex');
      const objectKey = actualHash + '.c2pa';
      const actualChecksum = createHash('md5').update(content).digest('hex');
      
      const metadata = {
        hash: actualHash,
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: `"${actualHash}"`,
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: actualChecksum
      };

      await store.storeManifest(objectKey, content, metadata);
    }

    const metrics = await store.getMetrics();
    
    assert.strictEqual(metrics.totalObjects, 3);
    assert.ok(metrics.totalSize > 0);
    assert.ok(metrics.averageObjectSize > 0);
    assert.ok(metrics.objectCountByTenant['test-tenant'] === 3);
  });

  test('should retrieve audit records', async () => {
    // Create an object to generate audit records
    const content = Buffer.from('test manifest content');
    const actualHash = createHash('sha256').update(content).digest('hex');
    const objectKey = actualHash + '.c2pa';
    const actualChecksum = createHash('md5').update(content).digest('hex');
    
    const metadata = {
      hash: actualHash,
      contentType: 'application/c2pa',
      contentLength: content.length,
      etag: `"${actualHash}"`,
      lastModified: new Date().toUTCString(),
      tenantId: 'test-tenant',
      author: 'test-author',
      signature: 'test-signature',
      checksum: actualChecksum
    };

    await store.storeManifest(objectKey, content, metadata);

    // Retrieve audit records
    const auditResult = await store.getAuditRecords({ limit: 10 });
    
    assert.ok(auditResult.records.length > 0);
    assert.ok(auditResult.total > 0);
    
    // Check that we have the creation record
    const createRecord = auditResult.records.find(r => r.operation === 'create');
    assert.ok(createRecord);
    assert.strictEqual(createRecord.objectKey, objectKey);
    assert.strictEqual(createRecord.tenantId, 'test-tenant');
    assert.strictEqual(createRecord.result, 'success');
  });
});
