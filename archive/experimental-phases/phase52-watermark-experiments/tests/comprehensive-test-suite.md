# Comprehensive Test Suite - Phase 52 Watermark Experiments

## Complete Testing Framework

### Test Configuration and Setup
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  WatermarkConfig, 
  WatermarkPayload, 
  TenantWatermarkConfig,
  WatermarkError,
  WatermarkErrorCode,
  DEFAULT_WATERMARK_CONFIG
} from '../core/watermark-config';
import { PayloadGenerator, PayloadBinding, PayloadGeneratorFactory } from '../core/payload-generator';
import { DCTWatermarkEmbedder, DCTWatermarkFactory } from '../watermarking/dct-watermark-embedder';
import { DCTWatermarkDetectorFactory } from '../detectors/dct-watermark-detector';
import { RobustnessEvaluator, RobustnessReporter } from '../evaluation/robustness-evaluation';

export interface TestEnvironment {
  testImages: {
    original: ArrayBuffer;
    jpeg: ArrayBuffer;
    png: ArrayBuffer;
    webp: ArrayBuffer;
    small: ArrayBuffer;
    large: ArrayBuffer;
  };
  testManifests: {
    valid: string;
    invalid: string;
    edge: string;
  };
  testConfigs: {
    default: WatermarkConfig;
    minimal: WatermarkConfig;
    maximum: WatermarkConfig;
  };
  outputDir: string;
}

export interface TestResults {
  suite: string;
  tests: Array<{
    name: string;
    passed: boolean;
    duration: number;
    error?: string;
  }>;
  passed: number;
  failed: number;
  errors: string[];
}

export class WatermarkTestSuite {
  private environment: TestEnvironment;
  private payloadGenerator: PayloadGenerator;
  private payloadBinding: PayloadBinding;
  private dctEmbedder: DCTWatermarkEmbedder;
  private dctDetector: DCTWatermarkDetector;

  constructor() {
    this.environment = {} as TestEnvironment;
    this.payloadGenerator = PayloadGeneratorFactory.createStandard();
    this.payloadBinding = new PayloadBinding(this.payloadGenerator);
    this.dctEmbedder = DCTWatermarkFactory.createDefault();
    this.dctDetector = DCTWatermarkDetectorFactory.createDefault();
  }

  async setup(): Promise<void> {
    console.log('🔧 Setting up watermark test environment...');
    
    // SECURITY: Added path validation for output directory
    const baseOutputDir = './test-output';
    const testId = `watermark-tests-${Date.now()}`;
    const outputDir = path.join(baseOutputDir, testId);
    
    // Validate and normalize path
    const normalizedOutputDir = path.normalize(outputDir);
    if (normalizedOutputDir !== outputDir || outputDir.includes('..') || outputDir.includes('~')) {
      throw new Error('Path traversal detected in output directory');
    }
    
    // Ensure we're within the expected base directory
    const resolvedOutputDir = path.resolve(outputDir);
    const resolvedBaseDir = path.resolve(baseOutputDir);
    if (!resolvedOutputDir.startsWith(resolvedBaseDir)) {
      throw new Error('Output directory must be within test-output folder');
    }
    
    // Create output directory
    this.environment.outputDir = outputDir;
    await fs.mkdir(this.environment.outputDir, { recursive: true });
    
    // Load test images
    await this.loadTestImages();
    
    // Generate test manifests
    this.environment.testManifests = {
      valid: this.generateManifestHash('test-content-1'),
      invalid: 'invalid-hash-format',
      edge: this.generateManifestHash('edge-case-content')
    };
    
    // Setup test configurations
    this.environment.testConfigs = {
      default: DEFAULT_WATERMARK_CONFIG,
      minimal: this.createMinimalConfig(),
      maximum: this.createMaximumConfig()
    };
    
    console.log('✅ Test environment setup complete');
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up test environment...');
    
    // Clean up test files if needed
    // await fs.rmdir(this.environment.outputDir, { recursive: true });
    
    console.log('✅ Cleanup complete');
  }

  // Core Test Suites

  async runPayloadTests(): Promise<TestResults> {
    console.log('🧪 Running payload generation tests...');
    
    const results: TestResults = {
      suite: 'Payload Generation',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: Valid payload generation
      await this.testValidPayloadGeneration(results);
      
      // Test 2: Payload size limits
      await this.testPayloadSizeLimits(results);
      
      // Test 3: Payload serialization/deserialization
      await this.testPayloadSerialization(results);
      
      // Test 4: Payload binding verification
      await this.testPayloadBinding(results);
      
      // Test 5: Security validation
      await this.testPayloadSecurity(results);
      
      // Test 6: Edge cases and error handling
      await this.testPayloadEdgeCases(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 Payload tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runDCTEmbeddingTests(): Promise<TestResults> {
    console.log('🧪 Running DCT embedding tests...');
    
    const results: TestResults = {
      suite: 'DCT Embedding',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: Basic embedding functionality
      await this.testBasicDCTEmbedding(results);
      
      // Test 2: Different image formats
      await this.testDCTImageFormats(results);
      
      // Test 3: Strength parameter variations
      await this.testDCTStrengthVariations(results);
      
      // Test 4: Error handling and validation
      await this.testDCTErrorHandling(results);
      
      // Test 5: Performance benchmarks
      await this.testDCTPerformance(results);
      
      // Test 6: Visual quality impact
      await this.testDCTVisualQuality(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 DCT embedding tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runDCTDetectionTests(): Promise<TestResults> {
    console.log('🧪 Running DCT detection tests...');
    
    const results: TestResults = {
      suite: 'DCT Detection',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: Basic detection functionality
      await this.testBasicDCTDetection(results);
      
      // Test 2: Confidence score accuracy
      await this.testDCTConfidenceAccuracy(results);
      
      // Test 3: False positive rate
      await this.testDCTFalsePositiveRate(results);
      
      // Test 4: Payload extraction accuracy
      await this.testDCTPayloadExtraction(results);
      
      // Test 5: Transform robustness
      await this.testDCTTransformRobustness(results);
      
      // Test 6: Detection performance
      await this.testDCTDetectionPerformance(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 DCT detection tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runRobustnessTests(): Promise<TestResults> {
    console.log('🧪 Running robustness evaluation tests...');
    
    const results: TestResults = {
      suite: 'Robustness Evaluation',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: Transform matrix execution
      await this.testTransformMatrix(results);
      
      // Test 2: Target threshold verification
      await this.testTargetThresholds(results);
      
      // Test 3: Visual quality metrics
      await this.testVisualQualityMetrics(results);
      
      // Test 4: Report generation
      await this.testReportGeneration(results);
      
      // Test 5: Performance benchmarks
      await this.testRobustnessPerformance(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 Robustness tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runComplianceTests(): Promise<TestResults> {
    console.log('🧪 Running compliance tests...');
    
    const results: TestResults = {
      suite: 'Compliance',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: PII detection and prevention
      await this.testPIIPrevention(results);
      
      // Test 2: Payload size limits
      await this.testPayloadSizeCompliance(results);
      
      // Test 3: Opt-in requirements
      await this.testOptInRequirements(results);
      
      // Test 4: Disclaimer and warning presence
      await this.testDisclaimerPresence(results);
      
      // Test 5: Audit logging
      await this.testAuditLogging(results);
      
      // Test 6: Data retention policies
      await this.testDataRetention(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 Compliance tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runSecurityTests(): Promise<TestResults> {
    console.log('🧪 Running security tests...');
    
    const results: TestResults = {
      suite: 'Security',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: Input validation and sanitization
      await this.testInputValidation(results);
      
      // Test 2: Payload forgery resistance
      await this.testPayloadForgery(results);
      
      // Test 3: Collision resistance
      await this.testCollisionResistance(results);
      
      // Test 4: Side-channel resistance
      await this.testSideChannelResistance(results);
      
      // Test 5: Memory safety
      await this.testMemorySafety(results);
      
      // Test 6: Resource exhaustion protection
      await this.testResourceExhaustion(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 Security tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  async runIntegrationTests(): Promise<TestResults> {
    console.log('🧪 Running integration tests...');
    
    const results: TestResults = {
      suite: 'Integration',
      tests: [],
      passed: 0,
      failed: 0,
      errors: []
    };

    try {
      // Test 1: End-to-end watermark workflow
      await this.testEndToEndWorkflow(results);
      
      // Test 2: CLI interface integration
      await this.testCLIIntegration(results);
      
      // Test 3: API integration
      await this.testAPIIntegration(results);
      
      // Test 4: UI integration
      await this.testUIIntegration(results);
      
      // Test 5: Multi-tenant isolation
      await this.testMultiTenantIsolation(results);
      
      // Test 6: C2PA integration
      await this.testC2PAIntegration(results);
      
    } catch (error) {
      results.errors.push(`Suite failed: ${error instanceof Error ? error.message : error}`);
      results.failed++;
    }

    console.log(`📊 Integration tests: ${results.passed} passed, ${results.failed} failed`);
    return results;
  }

  // Individual Test Implementations

  private async testValidPayloadGeneration(results: TestResults): Promise<void> {
    const testName = 'Valid payload generation';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      expect(payload).toBeDefined();
      expect(payload.version).toBe(1);
      expect(payload.truncatedHash.length).toBeGreaterThan(0);
      expect(payload.salt.length).toBeGreaterThan(0);
      expect(payload.reserved.length).toBeGreaterThan(0);
      
      // Verify payload size ≤ 128 bits
      const totalBits = (payload.truncatedHash.length + payload.salt.length + payload.reserved.length + 1) * 8;
      expect(totalBits).toBeLessThanOrEqual(128);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testPayloadSizeLimits(results: TestResults): Promise<void> {
    const testName = 'Payload size limits';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      // Serialize and check size
      const serialized = this.payloadGenerator.serializePayload(payload);
      expect(serialized.byteLength * 8).toBeLessThanOrEqual(128);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testPayloadSerialization(results: TestResults): Promise<void> {
    const testName = 'Payload serialization/deserialization';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const originalPayload = this.payloadGenerator.generatePayload(manifestHash);
      
      // Serialize
      const serialized = this.payloadGenerator.serializePayload(originalPayload);
      
      // Deserialize
      const deserialized = this.payloadGenerator.deserializePayload(serialized);
      
      // Verify equality
      expect(deserialized.version).toBe(originalPayload.version);
      expect(deserialized.truncatedHash).toEqual(originalPayload.truncatedHash);
      expect(deserialized.salt).toEqual(originalPayload.salt);
      expect(deserialized.reserved).toEqual(originalPayload.reserved);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testPayloadBinding(results: TestResults): Promise<void> {
    const testName = 'Payload binding verification';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      // Test valid binding
      const validBinding = this.payloadBinding.verifyBinding(payload, manifestHash);
      expect(validBinding.binds).toBe(true);
      expect(validBinding.confidence).toBe(1.0);
      
      // Test invalid binding
      const invalidBinding = this.payloadBinding.verifyBinding(payload, this.environment.testManifests.edge);
      expect(invalidBinding.binds).toBe(false);
      expect(invalidBinding.confidence).toBe(0.0);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testPayloadSecurity(results: TestResults): Promise<void> {
    const testName = 'Payload security validation';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      // Test security validator
      const validator = new PayloadSecurityValidator();
      const security = validator.validatePayloadSecurity(payload);
      
      expect(security.secure).toBe(true);
      expect(security.violations).toHaveLength(0);
      
      // Test with potentially malicious payload
      const maliciousPayload = { ...payload };
      // Add some PII-like pattern (this should fail validation)
      maliciousPayload.salt = new Uint8Array([0x41, 0x64, 0x61, 0x6d]); // "Adam"
      
      const maliciousSecurity = validator.validatePayloadSecurity(maliciousPayload);
      expect(maliciousSecurity.secure).toBe(false);
      expect(maliciousSecurity.violations.length).toBeGreaterThan(0);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testBasicDCTEmbedding(results: TestResults): Promise<void> {
    const testName = 'Basic DCT embedding';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      const watermarkedImage = await this.dctEmbedder.embedWatermark(
        this.environment.testImages.original,
        payload
      );
      
      expect(watermarkedImage).toBeDefined();
      expect(watermarkedImage.byteLength).toBeGreaterThan(0);
      
      // Verify it's still a valid image
      const metadata = await sharp(watermarkedImage).metadata();
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testBasicDCTDetection(results: TestResults): Promise<void> {
    const testName = 'Basic DCT detection';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const payload = this.payloadGenerator.generatePayload(manifestHash);
      
      // Embed watermark
      const watermarkedImage = await this.dctEmbedder.embedWatermark(
        this.environment.testImages.original,
        payload
      );
      
      // Detect watermark
      const detectionResult = await this.dctDetector.detectWatermark(watermarkedImage);
      
      expect(detectionResult.match).toBe(true);
      expect(detectionResult.confidence).toBeGreaterThan(0.5);
      expect(detectionResult.payload).toBeDefined();
      expect(detectionResult.processingTimeMs).toBeGreaterThan(0);
      
      // Verify payload binding
      const binding = this.payloadBinding.verifyBinding(detectionResult.payload!, manifestHash);
      expect(binding.binds).toBe(true);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testTargetThresholds(results: TestResults): Promise<void> {
    const testName = 'Target threshold verification';
    
    try {
      const manifestHash = this.environment.testManifests.valid;
      const evaluator = new RobustnessEvaluator();
      
      const evaluation = await evaluator.runRobustnessEvaluation(
        this.environment.testImages.original,
        manifestHash,
        false // Use basic test matrix
      );
      
      // Check JPEG 75 quality threshold
      const jpeg75Result = evaluation.results.find(r => 
        r.transform.name.includes('JPEG Compression Q7575') && 
        r.transform.parameters.jpegQuality === 75
      );
      
      expect(jpeg75Result).toBeDefined();
      expect(jpeg75Result!.payloadRecovered).toBe(true);
      expect(jpeg75Result!.transformedConfidence).toBeGreaterThanOrEqual(0.5);
      
      // Check 10% crop threshold
      const crop10Result = evaluation.results.find(r => 
        r.transform.name.includes('Crop 10%')
      );
      
      expect(crop10Result).toBeDefined();
      expect(crop10Result!.payloadRecovered).toBe(true);
      expect(crop10Result!.transformedConfidence).toBeGreaterThanOrEqual(0.5);
      
      // Check overall performance
      expect(evaluation.summary.targetThresholds.jpeg75).toBe(true);
      expect(evaluation.summary.targetThresholds.crop10).toBe(true);
      expect(evaluation.summary.targetThresholds.overall).toBe(true);
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  private async testPIIPrevention(results: TestResults): Promise<void> {
    const testName = 'PII detection and prevention';
    
    try {
      const validator = new PayloadSecurityValidator();
      
      // Test with clean payload
      const cleanPayload = this.payloadGenerator.generatePayload(this.environment.testManifests.valid);
      const cleanValidation = validator.validatePayloadSecurity(cleanPayload);
      expect(cleanValidation.secure).toBe(true);
      
      // Test with various PII patterns
      const piiTests = [
        { name: 'email', pattern: 'test@example.com' },
        { name: 'phone', pattern: '555-123-4567' },
        { name: 'ssn', pattern: '123-45-6789' },
        { name: 'credit card', pattern: '4111-1111-1111-1111' }
      ];
      
      for (const piiTest of piiTests) {
        const maliciousPayload = { ...cleanPayload };
        // Convert PII string to bytes and put in salt
        const piiBytes = new TextEncoder().encode(piiTest.pattern);
        maliciousPayload.salt = piiBytes.slice(0, 4);
        
        const validation = validator.validatePayloadSecurity(maliciousPayload);
        expect(validation.secure).toBe(false);
        expect(validation.violations.some(v => v.includes('PII'))).toBe(true);
      }
      
      results.tests.push({ name: testName, status: 'passed' });
      results.passed++;
      
    } catch (error) {
      results.tests.push({ 
        name: testName, 
        status: 'failed', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      results.failed++;
    }
  }

  // Helper methods

  private async loadTestImages(): Promise<void> {
    const testImagePath = path.join('./test-assets', 'images');
    
    try {
      this.environment.testImages = {
        original: await fs.readFile(path.join(testImagePath, 'test-original.jpg')),
        jpeg: await fs.readFile(path.join(testImagePath, 'test-jpeg.jpg')),
        png: await fs.readFile(path.join(testImagePath, 'test-png.png')),
        webp: await fs.readFile(path.join(testImagePath, 'test-webp.webp')),
        small: await fs.readFile(path.join(testImagePath, 'test-small.jpg')),
        large: await fs.readFile(path.join(testImagePath, 'test-large.jpg'))
      };
    } catch (error) {
      // Create test images if they don't exist
      await this.createTestImages();
    }
  }

  private async createTestImages(): Promise<void> {
    console.log('📸 Creating test images...');
    
    const testImagePath = path.join('./test-assets', 'images');
    await fs.mkdir(testImagePath, { recursive: true });
    
    // Create test images using sharp
    const testImage = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    })
    .composite([{
      input: Buffer.from(`
        <svg width="512" height="512">
          <rect width="512" height="512" fill="rgb(128,128,128)"/>
          <text x="256" y="256" font-family="Arial" font-size="24" fill="white" text-anchor="middle">TEST IMAGE</text>
        </svg>
      `),
      blend: 'over'
    }])
    .jpeg({ quality: 90 })
    .toBuffer();
    
    this.environment.testImages = {
      original: testImage,
      jpeg: testImage,
      png: await sharp(testImage).png().toBuffer(),
      webp: await sharp(testImage).webp().toBuffer(),
      small: await sharp(testImage).resize(256, 256).jpeg().toBuffer(),
      large: await sharp(testImage).resize(1024, 1024).jpeg().toBuffer()
    };
    
    // Save test images
    await fs.writeFile(path.join(testImagePath, 'test-original.jpg'), testImage);
    await fs.writeFile(path.join(testImagePath, 'test-png.png'), this.environment.testImages.png);
    await fs.writeFile(path.join(testImagePath, 'test-webp.webp'), this.environment.testImages.webp);
    await fs.writeFile(path.join(testImagePath, 'test-small.jpg'), this.environment.testImages.small);
    await fs.writeFile(path.join(testImagePath, 'test-large.jpg'), this.environment.testImages.large);
  }

  private generateManifestHash(content: string): string {
    // Simple hash generation for testing
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private createMinimalConfig(): WatermarkConfig {
    return {
      payload: {
        version: 1,
        hashAlgorithm: 'sha256',
        truncationBits: 32,
        saltBits: 16,
        versionBits: 4,
        reservedBits: 12
      },
      profiles: {
        off: null,
        dct_ecc_v1: {
          type: 'dct_ecc',
          strength: 0.1,
          blockSize: 8,
          quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
          eccScheme: 'reed_solomon',
          eccRedundancy: 1,
          frequencyBands: [1, 2, 3],
          spatialSpread: true
        },
        latent_x: {
          type: 'latent_diffusion',
          strength: 0.05,
          layers: [8, 9],
          noiseScale: 0.01,
          keyBits: 64,
          modelCompatibility: ['stable-diffusion-v1.5']
        }
      },
      detection: {
        confidenceThreshold: 0.7,
        maxFalsePositiveRate: 0.01,
        timeoutMs: 3000
      },
      ui: {
        showHintBadge: true,
        requireC2PA: true,
        allowDisable: true
      }
    };
  }

  private createMaximumConfig(): WatermarkConfig {
    return {
      payload: {
        version: 1,
        hashAlgorithm: 'sha256',
        truncationBits: 64,
        saltBits: 32,
        versionBits: 4,
        reservedBits: 28
      },
      profiles: {
        off: null,
        dct_ecc_v1: {
          type: 'dct_ecc',
          strength: 0.5,
          blockSize: 8,
          quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
          eccScheme: 'reed_solomon',
          eccRedundancy: 3,
          frequencyBands: [1, 2, 3, 4, 5, 6, 7, 8],
          spatialSpread: true
        },
        latent_x: {
          type: 'latent_diffusion',
          strength: 0.2,
          layers: [6, 7, 8, 9, 10, 11, 12],
          noiseScale: 0.1,
          keyBits: 256,
          modelCompatibility: ['stable-diffusion-v1.5', 'stable-diffusion-xl', 'dall-e-2']
        }
      },
      detection: {
        confidenceThreshold: 0.3,
        maxFalsePositiveRate: 0.05,
        timeoutMs: 10000
      },
      ui: {
        showHintBadge: true,
        requireC2PA: false,
        allowDisable: true
      }
    };
  }
}

// Test result interfaces
export interface TestResults {
  suite: string;
  tests: Array<{
    name: string;
    status: 'passed' | 'failed';
    error?: string;
  }>;
  passed: number;
  failed: number;
  errors: string[];
}

// Main test runner
export async function runCompleteTestSuite(): Promise<TestResults[]> {
  const testSuite = new WatermarkTestSuite();
  
  try {
    await testSuite.setup();
    
    const results: TestResults[] = [];
    
    // Run all test suites
    results.push(await testSuite.runPayloadTests());
    results.push(await testSuite.runDCTEmbeddingTests());
    results.push(await testSuite.runDCTDetectionTests());
    results.push(await testSuite.runRobustnessTests());
    results.push(await testSuite.runComplianceTests());
    results.push(await testSuite.runSecurityTests());
    results.push(await testSuite.runIntegrationTests());
    
    // Generate summary report
    generateTestSummary(results);
    
    return results;
    
  } finally {
    await testSuite.cleanup();
  }
}

function generateTestSummary(results: TestResults[]): void {
  console.log('\n📋 Phase 52 Watermark Test Summary');
  console.log('='.repeat(50));
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const result of results) {
    console.log(`\n${result.suite}:`);
    console.log(`  ✅ Passed: ${result.passed}`);
    console.log(`  ❌ Failed: ${result.failed}`);
    
    if (result.errors.length > 0) {
      console.log(`  🚨 Errors: ${result.errors.length}`);
      result.errors.forEach(error => console.log(`    - ${error}`));
    }
    
    totalPassed += result.passed;
    totalFailed += result.failed;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`Total: ${totalPassed + totalFailed} tests`);
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📊 Success Rate: ${Math.round((totalPassed / (totalPassed + totalFailed)) * 100)}%`);
  
  if (totalFailed === 0) {
    console.log('\n🎉 All tests passed! Phase 52 is ready for review.');
  } else {
    console.log('\n⚠️  Some tests failed. Review and fix issues before proceeding.');
  }
}

// Export for use in test files
export { WatermarkTestSuite as default };
```
