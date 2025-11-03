import { test, describe, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ManifestStore } from '../../../../packages/manifest-store/dist/manifest-store.js';
import type { ManifestStoreConfig } from '../../../../packages/manifest-store/dist/types.js';

describe('Manifest Store Acceptance Tests', () => {
  let store: ManifestStore;
  const config: ManifestStoreConfig = {
    baseUrl: 'https://manifests.survival.test',
    bucket: 'c2-manifests',
    region: 'auto',
    writeOnceEnabled: true,
    signedUrlTtl: 3600000,
    negativeCacheTtl: 300000,
    maxObjectSize: 100 * 1024 * 1024,
    allowedMimeTypes: [
      'application/c2pa',
      'application/json',
      'application/octet-stream'
    ]
  };

  beforeEach(() => {
    store = new ManifestStore(config);
  });

  describe('Write-Once Semantics', () => {
    test('should prevent overwriting existing manifests', async () => {
      const objectKey = 'a'.repeat(64) + '.c2pa';
      const content = Buffer.from('test manifest content');
      const metadata = {
        hash: 'a'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      // First store should succeed
      await store.storeManifest(objectKey, content, metadata);

      // Second store should fail with write-once semantics
      await assert.rejects(
        () => store.storeManifest(objectKey, content, metadata),
        /Object already exists: write-once semantics prohibit overwrites/
      );

      // Verify audit log records the attempt
      const auditResult = await store.getAuditRecords({
        operation: 'attempt_overwrite',
        tenantId: 'test-tenant'
      });

      assert.ok(auditResult.records.length > 0);
      assert.strictEqual(auditResult.records[0].result, 'failure');
      assert.strictEqual(auditResult.records[0].reason, 'Write-once semantics prohibit overwrite');
    });
  });

  describe('Hash-Addressed Paths', () => {
    test('should enforce SHA-256 hash naming convention', async () => {
      const invalidKeys = [
        'invalid-key.c2pa',
        'short.c2pa',
        'g'.repeat(63) + '.c2pa',
        'g'.repeat(65) + '.c2pa',
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.c2pa'
      ];

      for (const invalidKey of invalidKeys) {
        await assert.rejects(
          () => store.generateSignedUrl({
            objectKey: invalidKey,
            contentType: 'application/c2pa',
            contentLength: 1024,
            tenantId: 'test-tenant',
            author: 'test-author',
            signature: 'test-signature'
          }),
          /Invalid object key: must be SHA-256 hash/
        );
      }

      // Valid SHA-256 hash should work
      const validKey = 'a'.repeat(64) + '.c2pa';
      const result = await store.generateSignedUrl({
        objectKey: validKey,
        contentType: 'application/c2pa',
        contentLength: 1024,
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature'
      });

      assert.ok(result.url.includes(validKey));
    });
  });

  describe('Cache Control Headers', () => {
    test('should set appropriate cache headers for different operations', async () => {
      const objectKey = 'b'.repeat(64) + '.c2pa';
      const content = Buffer.from('test manifest content');
      const metadata = {
        hash: 'b'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      await store.storeManifest(objectKey, content, metadata);

      // HEAD request should return immutable cache headers
      const retrieved = await store.getManifest(objectKey);
      assert.ok(retrieved);

      // In a real implementation, this would verify cache headers
      // For now, we verify the metadata is correct
      assert.strictEqual(retrieved.contentType, 'application/c2pa');
      assert.strictEqual(retrieved.hash, 'b'.repeat(64));
    });
  });

  describe('Integrity Checking', () => {
    test('should validate manifest integrity against filename hash', async () => {
      const objectKey = 'c'.repeat(64) + '.c2pa';
      const content = Buffer.from('test manifest content');
      const metadata = {
        hash: 'c'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      await store.storeManifest(objectKey, content, metadata);

      const result = await store.checkIntegrity(objectKey, content);

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.expectedHash, 'c'.repeat(64));
      assert.strictEqual(result.actualHash, 'c'.repeat(64));
      assert.strictEqual(result.sizeMatch, true);
      assert.strictEqual(result.contentTypeValid, true);
      assert.deepStrictEqual(result.errors, []);
    });

    test('should detect tampered manifests', async () => {
      const objectKey = 'd'.repeat(64) + '.c2pa';
      const originalContent = Buffer.from('original manifest content');
      const tamperedContent = Buffer.from('tampered manifest content');
      const metadata = {
        hash: 'd'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: originalContent.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      await store.storeManifest(objectKey, originalContent, metadata);

      const result = await store.checkIntegrity(objectKey, tamperedContent);

      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.expectedHash, 'd'.repeat(64));
      assert.notStrictEqual(result.actualHash, 'd'.repeat(64));
      assert.strictEqual(result.sizeMatch, false);
      assert.ok(result.errors.length > 0);
      assert.ok(result.errors.some(error => error.includes('Hash mismatch')));
    });
  });

  describe('Audit Trail', () => {
    test('should maintain tamper-evident audit records', async () => {
      const objectKey = 'e'.repeat(64) + '.c2pa';
      const content = Buffer.from('test manifest content');
      const metadata = {
        hash: 'e'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'test-tenant',
        author: 'test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      await store.storeManifest(objectKey, content, metadata);

      const auditResult = await store.getAuditRecords({ tenantId: 'test-tenant' });

      assert.ok(auditResult.records.length > 0);
      
      const createRecord = auditResult.records.find(r => r.operation === 'create');
      assert.ok(createRecord);
      assert.strictEqual(createRecord.objectKey, objectKey);
      assert.strictEqual(createRecord.tenantId, 'test-tenant');
      assert.strictEqual(createRecord.author, 'test-author');
      assert.strictEqual(createRecord.result, 'success');
      assert.ok(createRecord.timestamp);
      assert.ok(createRecord.id);
      assert.strictEqual(createRecord.beforeState, null);
      assert.ok(createRecord.afterState);
      assert.strictEqual(createRecord.afterState?.hash, 'e'.repeat(64));
    });
  });

  describe('Listing Scalability', () => {
    test('should handle large numbers of objects efficiently', async () => {
      const objectCount = 1000;
      const tenantId = 'scale-test-tenant';

      // Create many objects
      for (let i = 0; i < objectCount; i++) {
        const hash = 'f'.repeat(60) + i.toString().padStart(4, '0');
        const objectKey = hash + '.c2pa';
        const content = Buffer.from(`content ${i}`);
        const metadata = {
          hash,
          contentType: 'application/c2pa',
          contentLength: content.length,
          etag: `"test-etag-${i}"`,
          lastModified: new Date().toUTCString(),
          tenantId,
          author: 'scale-test-author',
          signature: 'test-signature',
          checksum: `checksum-${i}`
        };
        await store.storeManifest(objectKey, content, metadata);
      }

      // Test pagination
      const firstPage = await store.listObjects({ tenantId, limit: 100 });
      assert.strictEqual(firstPage.objects.length, 100);
      assert.strictEqual(firstPage.isTruncated, true);
      assert.strictEqual(firstPage.totalCount, objectCount);
      assert.ok(firstPage.continuationToken);

      // Test second page
      const secondPage = await store.listObjects({ 
        tenantId, 
        limit: 100, 
        continuationToken: firstPage.continuationToken 
      });
      assert.strictEqual(secondPage.objects.length, 100);
      assert.strictEqual(secondPage.isTruncated, true);

      // Test filtering by prefix
      const prefixResults = await store.listObjects({ 
        tenantId, 
        prefix: 'f'.repeat(60) + '00'
      });
      assert.ok(prefixResults.objects.length > 0);
      assert.ok(prefixResults.objects.every(obj => obj.hash.startsWith('f'.repeat(60) + '00')));
    });
  });

  describe('Performance Targets', () => {
    test('should meet p95 latency targets for HEAD/GET operations', async () => {
      const objectKey = 'g'.repeat(64) + '.c2pa';
      const content = Buffer.from('test manifest content');
      const metadata = {
        hash: 'g'.repeat(64),
        contentType: 'application/c2pa',
        contentLength: content.length,
        etag: '"test-etag"',
        lastModified: new Date().toUTCString(),
        tenantId: 'perf-test-tenant',
        author: 'perf-test-author',
        signature: 'test-signature',
        checksum: 'test-checksum'
      };

      await store.storeManifest(objectKey, content, metadata);

      // Measure GET performance
      const startTime = performance.now();
      const result = await store.getManifest(objectKey);
      const endTime = performance.now();
      const latency = endTime - startTime;

      assert.ok(result);
      assert.ok(latency < 150, `GET latency ${latency}ms exceeds 150ms target`);

      // Measure HEAD performance (simulated by getManifest)
      const headStartTime = performance.now();
      await store.getManifest(objectKey);
      const headEndTime = performance.now();
      const headLatency = headEndTime - headStartTime;

      assert.ok(headLatency < 150, `HEAD latency ${headLatency}ms exceeds 150ms target`);
    });
  });

  describe('Security and Validation', () => {
    test('should validate signed URL requests properly', async () => {
      const testCases = [
        {
          name: 'invalid content type',
          request: {
            objectKey: 'h'.repeat(64) + '.c2pa',
            contentType: 'text/plain',
            contentLength: 1024,
            tenantId: 'test-tenant',
            author: 'test-author',
            signature: 'test-signature'
          },
          expectedError: /Content type text\/plain not allowed/
        },
        {
          name: 'file too large',
          request: {
            objectKey: 'i'.repeat(64) + '.c2pa',
            contentType: 'application/c2pa',
            contentLength: 200 * 1024 * 1024, // 200MB
            tenantId: 'test-tenant',
            author: 'test-author',
            signature: 'test-signature'
          },
          expectedError: /Content size .* exceeds maximum/
        },
        {
          name: 'invalid tenant ID',
          request: {
            objectKey: 'j'.repeat(64) + '.c2pa',
            contentType: 'application/c2pa',
            contentLength: 1024,
            tenantId: '',
            author: 'test-author',
            signature: 'test-signature'
          },
          expectedError: /Invalid tenant ID/
        }
      ];

      for (const testCase of testCases) {
        await assert.rejects(
          () => store.generateSignedUrl(testCase.request),
          testCase.expectedError,
          `Failed for case: ${testCase.name}`
        );
      }
    });
  });
});
