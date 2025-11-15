#!/usr/bin/env node

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { RealWorldSurvivalTester } from '../src/tests/survival/real-world-survival-tester';
import { SurvivalReportGenerator } from '../src/tests/survival/survival-report-generator';
import { SurvivalVerificationResult } from '../src/tests/survival/survival-types';

/**
 * CLI tool for running C2PA survival tests
 * 
 * Usage:
 *   pnpm survival:test
 *   pnpm survival:test --platform=Instagram
 *   pnpm survival:test --category=social
 *   pnpm survival:test --severity=extreme
 *   pnpm survival:test --sample-size=20
 *   pnpm survival:test --report=markdown
 */

interface CLIOptions {
  imageDir?: string;
  platforms?: string[];
  categories?: string[];
  severities?: string[];
  sampleSize?: number;
  minConfidence?: number;
  reportFormat?: 'markdown' | 'json' | 'html' | 'console';
  outputPath?: string;
  verbose?: boolean;
}

async function main() {
  const options = parseArgs();

  console.log('🛡️  C2PA Signature Survival Testing\n');
  console.log('Configuration:');
  console.log(`  Image Directory: ${options.imageDir || 'test/images'}`);
  console.log(`  Sample Size: ${options.sampleSize || 10}`);
  console.log(`  Min Confidence: ${options.minConfidence || 30}`);
  if (options.platforms?.length) {
    console.log(`  Platforms: ${options.platforms.join(', ')}`);
  }
  if (options.categories?.length) {
    console.log(`  Categories: ${options.categories.join(', ')}`);
  }
  if (options.severities?.length) {
    console.log(`  Severities: ${options.severities.join(', ')}`);
  }
  console.log(`  Report Format: ${options.reportFormat || 'console'}\n`);

  // Load test images
  console.log('📸 Loading test images...');
  const testImages = await loadTestImages(options.imageDir || 'test/images');
  console.log(`   Loaded ${testImages.length} test images\n`);

  if (testImages.length === 0) {
    console.error('❌ No test images found. Please add images to the test directory.');
    process.exit(1);
  }

  // Initialize tester
  const tester = new RealWorldSurvivalTester({
    sampleSize: options.sampleSize,
    minConfidence: options.minConfidence,
    platforms: options.platforms,
    categories: options.categories,
    severities: options.severities,
    verbose: options.verbose
  });

  // Show scenarios to be tested
  const scenarios = tester.getScenarios();
  console.log(`🎯 Testing ${scenarios.length} scenarios:\n`);
  scenarios.forEach(scenario => {
    console.log(`   ${scenario.platform.padEnd(20)} ${scenario.category.padEnd(12)} ${scenario.severity.padEnd(8)} (${(scenario.expectedSurvival * 100).toFixed(0)}% expected)`);
  });
  console.log('');

  // Mock sign and verify functions
  // In production, these would use actual C2PA signing/verification
  const mockSign = async (image: Buffer): Promise<Buffer> => {
    // TODO: Replace with actual C2PA signing
    return image;
  };

  const mockVerify = async (image: Buffer): Promise<SurvivalVerificationResult> => {
    // TODO: Replace with actual C2PA verification
    // For now, simulate varying confidence levels
    const confidence = 50 + Math.random() * 50; // 50-100
    
    return {
      confidence,
      isValid: confidence > 30,
      extractionResult: {
        manifest: confidence > 30,
        metadata: confidence > 50
      },
      signatureResult: {
        isValid: confidence > 40,
        algorithm: 'ES256'
      },
      certificateResult: {
        isValid: confidence > 40,
        issuer: 'CredLink'
      }
    };
  };

  // Run tests
  console.log('🧪 Running survival tests...\n');
  const startTime = Date.now();

  const report = await tester.runRealWorldTests(
    testImages,
    mockSign,
    mockVerify
  );

  const duration = Date.now() - startTime;
  console.log(`\n✅ Tests completed in ${(duration / 1000).toFixed(2)}s\n`);

  // Generate report
  const reportGenerator = new SurvivalReportGenerator();

  switch (options.reportFormat) {
    case 'markdown':
      const mdPath = options.outputPath || 'SURVIVAL-TEST-REPORT.md';
      await reportGenerator.generateMarkdownReport(report, mdPath);
      console.log(`📄 Markdown report saved to: ${mdPath}`);
      break;

    case 'json':
      const jsonPath = options.outputPath || 'survival-test-report.json';
      await reportGenerator.generateJSONReport(report, jsonPath);
      console.log(`📄 JSON report saved to: ${jsonPath}`);
      break;

    case 'html':
      const htmlPath = options.outputPath || 'survival-test-report.html';
      await reportGenerator.generateHTMLReport(report, htmlPath);
      console.log(`📄 HTML report saved to: ${htmlPath}`);
      break;

    case 'console':
    default:
      reportGenerator.printConsoleSummary(report);
      break;
  }

  // Exit with appropriate code
  const exitCode = report.passedScenarios === report.totalScenarios ? 0 : 1;
  process.exit(exitCode);
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  args.forEach(arg => {
    if (arg.startsWith('--image-dir=')) {
      options.imageDir = arg.split('=')[1];
    } else if (arg.startsWith('--platform=')) {
      const platforms = arg.split('=')[1].split(',');
      options.platforms = platforms;
    } else if (arg.startsWith('--category=')) {
      const categories = arg.split('=')[1].split(',');
      options.categories = categories;
    } else if (arg.startsWith('--severity=')) {
      const severities = arg.split('=')[1].split(',');
      options.severities = severities;
    } else if (arg.startsWith('--sample-size=')) {
      options.sampleSize = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--min-confidence=')) {
      options.minConfidence = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--report=')) {
      options.reportFormat = arg.split('=')[1] as 'markdown' | 'json' | 'html' | 'console';
    } else if (arg.startsWith('--output=')) {
      options.outputPath = arg.split('=')[1];
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  });

  return options;
}

/**
 * Load test images from directory
 */
async function loadTestImages(dir: string): Promise<Buffer[]> {
  const images: Buffer[] = [];

  try {
    const files = await readdir(dir);
    const imageFiles = files.filter(f => 
      f.endsWith('.jpg') || 
      f.endsWith('.jpeg') || 
      f.endsWith('.png') ||
      f.endsWith('.webp')
    );

    for (const file of imageFiles) {
      const filePath = join(dir, file);
      const buffer = await readFile(filePath);
      images.push(buffer);
    }
  } catch (error) {
    console.warn(`Warning: Could not load images from ${dir}`);
    console.warn('Using generated test images instead...');
    
    // Generate synthetic test images if directory doesn't exist
    for (let i = 0; i < 5; i++) {
      const image = await sharp({
        create: {
          width: 1920,
          height: 1080,
          channels: 3,
          background: { r: 100 + i * 30, g: 150, b: 200 }
        }
      })
        .jpeg()
        .toBuffer();
      
      images.push(image);
    }
  }

  return images;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
C2PA Signature Survival Testing CLI

Usage:
  pnpm survival:test [options]

Options:
  --image-dir=<path>        Directory containing test images (default: test/images)
  --platform=<platforms>    Comma-separated list of platforms to test
  --category=<categories>   Comma-separated list of categories to test
  --severity=<severities>   Comma-separated list of severities to test
  --sample-size=<n>         Number of images to test per scenario (default: 10)
  --min-confidence=<n>      Minimum confidence threshold (default: 30)
  --report=<format>         Report format: markdown, json, html, console (default: console)
  --output=<path>           Output file path for report
  --verbose, -v             Enable verbose logging
  --help, -h                Show this help message

Examples:
  pnpm survival:test
  pnpm survival:test --platform=Instagram,Facebook
  pnpm survival:test --category=social --report=markdown
  pnpm survival:test --severity=extreme --verbose
  pnpm survival:test --sample-size=20 --report=html --output=report.html

Platforms:
  Instagram, Facebook, Twitter, WhatsApp, LinkedIn, TikTok, Pinterest,
  Google Photos, iCloud, Dropbox, Slack, Discord, Email, MMS

Categories:
  social, messaging, cloud, email

Severities:
  low, medium, high, extreme
`);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
}

export { main };
