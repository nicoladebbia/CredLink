/**
 * Custody Tests - Verify FIPS-validated key management
 */

import { CustodyService } from '../custody/custody-service.js';
import { createLogger } from '../src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('CustodyTests');

async function runCustodyTests() {
  const custodyService = new CustodyService();
  const testTenant = `test-${Date.now()}`;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    logger.info('Starting custody tests');

    // Test 1: Provision AWS KMS key
    try {
      logger.info('Test 1: Provision AWS KMS key');
      const kmsKey = await custodyService.provisionTenantKey(testTenant, {
        mode: 'aws-kms',
        rotation: '90d',
        region: 'us-east-1',
      });

      if (!kmsKey.keyId || !kmsKey.fipsValidated) {
        throw new Error('KMS key provisioning failed validation');
      }

      logger.info('✅ Test 1 passed: KMS key provisioned', { keyId: kmsKey.keyId });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 1 failed:', error.message);
      testsFailed++;
    }

    // Test 2: Sign manifest
    try {
      logger.info('Test 2: Sign C2PA manifest');
      const manifestData = {
        claim_generator: 'Phase59/1.0',
        assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created' }] } }],
      };

      const signature = await custodyService.signManifest(testTenant, manifestData);

      if (!signature.signature || signature.algorithm !== 'ES256') {
        throw new Error('Signing failed validation');
      }

      logger.info('✅ Test 2 passed: Manifest signed', {
        algorithm: signature.algorithm,
        hasTSA: !!signature.tsaToken,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 2 failed:', error.message);
      testsFailed++;
    }

    // Test 3: Get evidence packs
    try {
      logger.info('Test 3: Retrieve evidence packs');
      const packs = await custodyService.getEvidencePacks(testTenant);

      if (!Array.isArray(packs) || packs.length === 0) {
        throw new Error('No evidence packs found');
      }

      const pack = packs[0];
      if (!pack.id || !pack.hash || !pack.content) {
        throw new Error('Evidence pack missing required fields');
      }

      logger.info('✅ Test 3 passed: Evidence packs retrieved', {
        packCount: packs.length,
        firstPackType: pack.type,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 3 failed:', error.message);
      testsFailed++;
    }

    // Test 4: Key rotation
    try {
      logger.info('Test 4: Key rotation');

      // Get current key
      const packsBeforeRotation = await custodyService.getEvidencePacks(testTenant);
      const currentKeyId = packsBeforeRotation[0].content.key_id;

      const rotationResult = await custodyService.rotateKey(testTenant, currentKeyId, 'manual');

      if (!rotationResult.newKeyId || rotationResult.newKeyId === rotationResult.oldKeyId) {
        throw new Error('Rotation did not create new key');
      }

      if (!rotationResult.evidencePackId) {
        throw new Error('Rotation evidence pack not generated');
      }

      logger.info('✅ Test 4 passed: Key rotated', {
        oldKeyId: rotationResult.oldKeyId,
        newKeyId: rotationResult.newKeyId,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 4 failed:', error.message);
      testsFailed++;
    }

    // Test 5: FIPS validation
    try {
      logger.info('Test 5: Verify FIPS validation');
      const packs = await custodyService.getEvidencePacks(testTenant);

      const allFipsValidated = packs.every((pack) => pack.content.fips_validated === true);

      if (!allFipsValidated) {
        throw new Error('Not all keys are FIPS validated');
      }

      logger.info('✅ Test 5 passed: All keys FIPS validated');
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 5 failed:', error.message);
      testsFailed++;
    }

    // Summary
    logger.info('\n=== Custody Tests Summary ===');
    logger.info(`Total tests: ${testsPassed + testsFailed}`);
    logger.info(`Passed: ${testsPassed}`);
    logger.info(`Failed: ${testsFailed}`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Custody tests failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

runCustodyTests();
