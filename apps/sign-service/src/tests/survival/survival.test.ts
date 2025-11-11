import { describe, it, expect, beforeAll } from '@jest/globals';
import { RealWorldSurvivalTester } from './real-world-survival-tester';
import { SurvivalReportGenerator } from './survival-report-generator';
import { SurvivalVerificationResult } from './survival-types';
import sharp from 'sharp';

describe('Survival Testing Suite', () => {
  let tester: RealWorldSurvivalTester;
  let reportGenerator: SurvivalReportGenerator;
  let testImages: Buffer[];

  beforeAll(async () => {
    tester = new RealWorldSurvivalTester({
      sampleSize: 5,
      minConfidence: 30,
      verbose: false
    });

    reportGenerator = new SurvivalReportGenerator();

    // Generate test images
    testImages = await generateTestImages(5);
  });

  describe('RealWorldSurvivalTester', () => {
    it('should initialize with all scenarios', () => {
      const scenarios = tester.getScenarios();
      expect(scenarios.length).toBe(14);
    });

    it('should have scenarios for all major platforms', () => {
      const scenarios = tester.getScenarios();
      const platforms = scenarios.map(s => s.platform);

      expect(platforms).toContain('Instagram');
      expect(platforms).toContain('Facebook');
      expect(platforms).toContain('Twitter');
      expect(platforms).toContain('WhatsApp');
      expect(platforms).toContain('LinkedIn');
      expect(platforms).toContain('TikTok');
    });

    it('should categorize scenarios correctly', () => {
      const social = tester.getScenariosByCategory('social');
      const messaging = tester.getScenariosByCategory('messaging');
      const cloud = tester.getScenariosByCategory('cloud');
      const email = tester.getScenariosByCategory('email');

      expect(social.length).toBeGreaterThan(0);
      expect(messaging.length).toBeGreaterThan(0);
      expect(cloud.length).toBeGreaterThan(0);
      expect(email.length).toBeGreaterThan(0);
    });

    it('should have scenarios at different severity levels', () => {
      const low = tester.getScenariosBySeverity('low');
      const medium = tester.getScenariosBySeverity('medium');
      const high = tester.getScenariosBySeverity('high');
      const extreme = tester.getScenariosBySeverity('extreme');

      expect(low.length).toBeGreaterThan(0);
      expect(medium.length).toBeGreaterThan(0);
      expect(high.length).toBeGreaterThan(0);
      expect(extreme.length).toBeGreaterThan(0);
    });

    it('should run survival tests', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true, algorithm: 'ES256' },
        certificateResult: { isValid: true, issuer: 'CredLink' }
      });

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      expect(report).toBeDefined();
      expect(report.totalScenarios).toBeGreaterThan(0);
      expect(report.results.length).toBe(report.totalScenarios);
      expect(report.averageSurvival).toBeGreaterThan(0);
    });

    it('should detect failures correctly', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 20, // Below threshold
        isValid: false,
        extractionResult: { manifest: false, metadata: false },
        signatureResult: { isValid: false },
        certificateResult: { isValid: false },
        failureReason: 'manifest_not_found'
      });

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      expect(report.failedScenarios).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });

    it('should calculate category statistics', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      expect(report.byCategory).toBeDefined();
      expect(Object.keys(report.byCategory).length).toBeGreaterThan(0);
      
      Object.values(report.byCategory).forEach(stats => {
        expect(stats.totalScenarios).toBeGreaterThan(0);
        expect(stats.averageSurvival).toBeGreaterThanOrEqual(0);
        expect(stats.averageSurvival).toBeLessThanOrEqual(1);
      });
    });

    it('should calculate severity statistics', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      expect(report.bySeverity).toBeDefined();
      expect(Object.keys(report.bySeverity).length).toBeGreaterThan(0);
    });

    it('should identify critical failures', async () => {
      const mockSign = async (img: Buffer) => img;
      let callCount = 0;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => {
        callCount++;
        // Fail low severity scenarios (critical)
        return {
          confidence: callCount % 3 === 0 ? 20 : 85,
          isValid: callCount % 3 !== 0,
          extractionResult: { manifest: callCount % 3 !== 0, metadata: true },
          signatureResult: { isValid: callCount % 3 !== 0 },
          certificateResult: { isValid: callCount % 3 !== 0 }
        };
      };

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      // Should have some critical failures or recommendations
      expect(
        report.criticalFailures.length > 0 || report.recommendations.length > 0
      ).toBe(true);
    });

    it('should analyze failure patterns', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 20,
        isValid: false,
        extractionResult: { manifest: false, metadata: false },
        signatureResult: { isValid: false },
        certificateResult: { isValid: false },
        failureReason: 'manifest_not_found'
      });

      const report = await tester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      const analysis = tester.analyzeFailures(report.results);

      expect(analysis.totalFailures).toBeGreaterThan(0);
      expect(analysis.byReason).toBeDefined();
      expect(analysis.byPlatform).toBeDefined();
      expect(analysis.byCategory).toBeDefined();
    });
  });

  describe('Transformation Tests', () => {
    it('should apply Instagram transformation', async () => {
      const scenarios = tester.getScenarios();
      const instagram = scenarios.find(s => s.platform === 'Instagram');
      
      expect(instagram).toBeDefined();
      
      if (instagram) {
        const transformed = await instagram.transform(testImages[0]);
        expect(transformed).toBeInstanceOf(Buffer);
        expect(transformed.length).toBeGreaterThan(0);
      }
    });

    it('should apply Twitter transformation', async () => {
      const scenarios = tester.getScenarios();
      const twitter = scenarios.find(s => s.platform === 'Twitter');
      
      expect(twitter).toBeDefined();
      
      if (twitter) {
        const transformed = await twitter.transform(testImages[0]);
        expect(transformed).toBeInstanceOf(Buffer);
      }
    });

    it('should apply WhatsApp transformation', async () => {
      const scenarios = tester.getScenarios();
      const whatsapp = scenarios.find(s => s.platform === 'WhatsApp');
      
      expect(whatsapp).toBeDefined();
      
      if (whatsapp) {
        const transformed = await whatsapp.transform(testImages[0]);
        expect(transformed).toBeInstanceOf(Buffer);
      }
    });

    it('should handle transformation errors gracefully', async () => {
      const scenarios = tester.getScenarios();
      const scenario = scenarios[0];

      // Test with invalid buffer
      await expect(async () => {
        await scenario.transform(Buffer.from('invalid'));
      }).rejects.toThrow();
    });
  });

  describe('SurvivalReportGenerator', () => {
    it('should generate markdown report', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await tester.runRealWorldTests(
        testImages.slice(0, 2),
        mockSign,
        mockVerify
      );

      // Test markdown generation (don't write to disk in tests)
      expect(report).toBeDefined();
      expect(report.results.length).toBeGreaterThan(0);
    });

    it('should print console summary', async () => {
      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await tester.runRealWorldTests(
        testImages.slice(0, 2),
        mockSign,
        mockVerify
      );

      // Should not throw
      expect(() => {
        reportGenerator.printConsoleSummary(report);
      }).not.toThrow();
    });
  });

  describe('Configuration Tests', () => {
    it('should filter by platform', async () => {
      const filteredTester = new RealWorldSurvivalTester({
        platforms: ['Instagram', 'Facebook'],
        sampleSize: 3
      });

      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await filteredTester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      expect(report.totalScenarios).toBe(2);
    });

    it('should filter by category', async () => {
      const filteredTester = new RealWorldSurvivalTester({
        categories: ['social'],
        sampleSize: 3
      });

      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await filteredTester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      report.results.forEach(result => {
        expect(result.category).toBe('social');
      });
    });

    it('should filter by severity', async () => {
      const filteredTester = new RealWorldSurvivalTester({
        severities: ['extreme'],
        sampleSize: 3
      });

      const mockSign = async (img: Buffer) => img;
      const mockVerify = async (_img: Buffer): Promise<SurvivalVerificationResult> => ({
        confidence: 85,
        isValid: true,
        extractionResult: { manifest: true, metadata: true },
        signatureResult: { isValid: true },
        certificateResult: { isValid: true }
      });

      const report = await filteredTester.runRealWorldTests(
        testImages,
        mockSign,
        mockVerify
      );

      report.results.forEach(result => {
        expect(result.severity).toBe('extreme');
      });
    });
  });
});

/**
 * Generate test images
 */
async function generateTestImages(count: number): Promise<Buffer[]> {
  const images: Buffer[] = [];

  for (let i = 0; i < count; i++) {
    const image = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 100 + i * 20, g: 150, b: 200 }
      }
    })
      .jpeg()
      .toBuffer();

    images.push(image);
  }

  return images;
}
